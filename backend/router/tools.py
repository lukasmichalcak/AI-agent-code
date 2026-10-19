import asyncio
import json
from decimal import Decimal, localcontext
from uuid import uuid4
import httpx
from .domain import Asset, Amount, Candidate, Fee, Intent, Step, human, units, now
from .config import Settings

EVM_CHAINS = [1,42161,8453,11155111,84532,421614]
WORMHOLE_NAMES = {1:'Ethereum',42161:'Arbitrum',8453:'Base',11155111:'Sepolia',421614:'ArbitrumSepolia',84532:'BaseSepolia'}
WRAPPED = {(421614,'0x45b677f11c37fc73ba89e78bccb86762a653b6ef')}
USDC = {42161: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', 8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'}

def asdict(model):
    return model.model_dump(exclude_none=True)

def representation(asset):
    if asset.kind == 'native' or asset.assetIdentifier == 'native:PAS':
        return 'native'
    if asset.kind == 'erc20' and (asset.chain.chainId, asset.address.lower()) in WRAPPED:
        return 'wrapped'
    if asset.kind == 'erc20' and USDC.get(asset.chain.chainId) == asset.address.lower():
        return 'canonical'
    return 'unknown'

def lifi_asset(token):
    address = token['address']
    native = address.lower() == '0x' + '0'*40
    return Asset(chain={'ecosystem':'evm', 'chainId':token['chainId']}, kind='native' if native else 'erc20',
                 symbol=token['symbol'], decimals=token['decimals'], address=None if native else address)

def exact_asset(expected, actual):
    if expected.key() != actual.key() or expected.decimals != actual.decimals:
        raise ValueError('provider returned a different asset identity or decimals')

def normalize_lifi(raw, intent, provenance='live'):
    # Accept either /quote Step or /advanced/routes Route; includedSteps are not counted twice.
    is_route = 'steps' in raw
    steps = raw['steps'] if is_route else [raw]
    if not steps:
        raise ValueError('empty LI.FI route')
    source = lifi_asset(raw['fromToken'] if is_route else raw['action']['fromToken'])
    dest = lifi_asset(raw['toToken'] if is_route else raw['action']['toToken'])
    exact_asset(intent.sourceAsset, source); exact_asset(intent.destinationAsset, dest)
    raw_input = raw['fromAmount'] if is_route else raw['action']['fromAmount']
    if int(raw_input) != int(units(intent.amount, source.decimals)):
        raise ValueError('provider changed input amount')
    fees, gas, plan_steps = [], [], []
    complete = True
    # Absence of a cost array means unknown, whereas an explicitly empty array means none.
    for index, step in enumerate(steps):
        estimate = step['estimate']
        if 'feeCosts' not in estimate or 'gasCosts' not in estimate:
            complete = False
        for item in estimate.get('feeCosts') or []:
            asset = lifi_asset(item['token'])
            usd = item.get('amountUSD')
            fees.append(Fee(label=item['name'], amount=Amount(asset=asset, amount=human(item['amount'],asset.decimals)),
                            includedInInput=item['included'], estimatedUsd=usd))
            complete &= usd is not None
        for item in estimate.get('gasCosts') or []:
            asset = lifi_asset(item['token'])
            amount = Amount(asset=asset, amount=human(item['amount'], asset.decimals))
            gas.append(amount)
            usd = item.get('amountUSD')
            fees.append(Fee(label=f"Gas: {item.get('type', 'transaction')}", amount=amount, includedInInput=False, estimatedUsd=usd))
            complete &= usd is not None
        action = step['action']
        if action['fromChainId'] != source.chain.chainId and index == 0:
            raise ValueError('source chain mismatch')
        plan_steps.append(Step(id=str(index), description=f"{step.get('tool','LI.FI')} · {step.get('type','cross')}",
                               chain={'ecosystem':'evm','chainId':action['fromChainId']},
                               action='swap' if step.get('type') == 'swap' else 'bridge'))
    output = raw['toAmount'] if is_route else raw['estimate']['toAmount']
    minimum = raw.get('toAmountMin') if is_route else raw['estimate'].get('toAmountMin')
    with localcontext() as ctx:
        ctx.prec = 120
        total = str(sum((Decimal(f.estimatedUsd) for f in fees), Decimal(0))) if complete else None
    durations = [s['estimate'].get('executionDuration') for s in steps]
    duration = int(sum(durations)) if all(isinstance(x,(int,float)) and x >= 0 for x in durations) else None
    warnings = ['Balance and allowance are not transfer authorization. Approval gas may change; re-quote before execution.']
    if minimum is None: warnings.append('Provider did not supply a minimum output.')
    return Candidate(id=raw.get('id') or uuid4().hex, intentId=intent.id, provider='lifi', providerQuoteId=raw.get('id'),
                     sourceAsset=source, sourceInput=Amount(asset=source,amount=intent.amount), destinationAsset=dest,
                     destinationRepresentation=representation(dest), expectedOutput=Amount(asset=dest,amount=human(output,dest.decimals)),
                     minimumOutput=Amount(asset=dest,amount=human(minimum,dest.decimals)) if minimum is not None else None,
                     fees=fees,gasNeeds=gas,totalUserCostUsd=total,feeComplete=bool(complete),estimatedDurationSeconds=duration,
                     quotedAt=now(),warnings=warnings,steps=plan_steps,provenance=provenance,raw=raw)

def normalize_paraspell(raw, intent):
    info, simulation = raw['info'], raw['dryRun']
    if not simulation.get('success'):
        raise ValueError('ParaSpell dry run failed')
    selected = info['origin']['selectedCurrency']
    if not selected.get('sufficient'):
        raise ValueError('ParaSpell reports insufficient source balance')
    received = info['destination']['receivedCurrency']
    asset_info = received['asset']
    if asset_info['symbol'] != 'PAS' or asset_info['decimals'] != 10 or not asset_info.get('isNative'):
        raise ValueError('Unsupported destination fee/asset mapping')
    fee_items, gas = [], []
    nodes = [('origin',info['origin'],intent.sourceAsset), ('destination',info['destination'],intent.destinationAsset)]
    if info.get('hops'):
        # No loss of intermediate asset identity is permitted in V0.
        raise ValueError('Intermediate XCM hop normalization outside bounded V0 corridor')
    for label,node,asset in nodes:
        fee = node.get('xcmFee')
        if not fee or fee.get('sufficient') is False:
            raise ValueError('XCM fee missing or insufficient')
        metadata = fee['asset']
        if metadata['symbol'] != 'PAS' or metadata['decimals'] != 10 or not metadata.get('isNative'):
            raise ValueError('Unknown XCM fee asset')
        amount = Amount(asset=asset,amount=human(fee['fee'],10))
        fee_items.append(Fee(label=f'XCM {label}',amount=amount,includedInInput=label!='origin'))
        if label == 'origin': gas.append(amount)
    return Candidate(id=uuid4().hex,intentId=intent.id,provider='paraspell',sourceAsset=intent.sourceAsset,
                     sourceInput=Amount(asset=intent.sourceAsset,amount=intent.amount),destinationAsset=intent.destinationAsset,
                     destinationRepresentation='native',expectedOutput=Amount(asset=intent.destinationAsset,amount=human(received['receivedAmount'],10)),
                     fees=fee_items,gasNeeds=gas,feeComplete=False,quotedAt=now(),provenance='live',raw=raw,
                     warnings=['Dry-run estimate; USD valuation, duration and guaranteed minimum output are unavailable.'],
                     steps=[Step(id='xcm',description='ParaSpell XCM transfer',chain=intent.sourceAsset.chain,action='transfer')])

def normalize_wormhole(raw, intent):
    candidates = []
    for q in raw.get('quotes',[]):
        for token, asset in [(q['outputToken'],intent.destinationAsset),(q['sourceToken'],intent.sourceAsset)]:
            expected_address = 'native' if asset.kind == 'native' else asset.address.lower()
            if token['chain'] != WORMHOLE_NAMES.get(asset.chain.chainId) or token['address'].lower() != expected_address:
                raise ValueError('Wormhole quote token identity mismatch')
        if q['outputDecimals'] != intent.destinationAsset.decimals:
            raise ValueError('Wormhole output decimals mismatch')
        if q['sourceDecimals'] != intent.sourceAsset.decimals or int(q['sourceBaseUnits']) != int(units(intent.amount,intent.sourceAsset.decimals)):
            raise ValueError('Wormhole source amount mismatch')
        # Manual WTT gives a wrapped destination, unless transferring back to the origin.
        # The current worker does not prove origin-token equivalence; use wrapped conservatively.
        candidates.append(Candidate(id=uuid4().hex,intentId=intent.id,provider='wormhole',sourceAsset=intent.sourceAsset,
           sourceInput=Amount(asset=intent.sourceAsset,amount=intent.amount),destinationAsset=intent.destinationAsset,
           destinationRepresentation='wrapped',expectedOutput=Amount(asset=intent.destinationAsset,amount=human(q['outputBaseUnits'],q['outputDecimals'])),
           feeComplete=False,quotedAt=now(),expiresAt=q.get('expires'),estimatedDurationSeconds=__import__('math').ceil(q['eta']/1000) if q.get('eta') is not None else None,provenance='live',raw=q,
           warnings=['Manual TokenBridge route: destination redemption needs a separate signer and gas.', 'Source transaction gas, destination redeem gas, and total USD cost are not estimated.', 'Provider ETA covers source finality/attestation, not a guaranteed redemption completion.'],
           steps=[Step(id='bridge',description=q['route'],chain=intent.sourceAsset.chain,action='bridge'),
                  Step(id='redeem',description='Redeem Wormhole attestation',chain=intent.destinationAsset.chain,action='redeem')]))
    return candidates

class LiveTools:
    def __init__(self, settings: Settings):
        self.settings = settings

    def providers(self, intent):
        a,b = intent.sourceAsset.chain, intent.destinationAsset.chain
        if a.ecosystem == b.ecosystem == 'substrate' and (a.genesisHash or b.genesisHash): return []
        if a.ecosystem == b.ecosystem == 'substrate' and {a.name,b.name} <= {'AssetHubPaseo','PeoplePaseo'}:
            return ['paraspell']
        if a.ecosystem == b.ecosystem == 'evm' and a.chainId in EVM_CHAINS and b.chainId in EVM_CHAINS:
            if (a.chainId in [1,42161,8453]) != (b.chainId in [1,42161,8453]): return []
            return ['lifi','wormhole']
        return []

    async def _adapter(self, body):
        async with httpx.AsyncClient(trust_env=False,timeout=50) as client:
            response = await client.post(self.settings.adapter_url+'/call',json=body)
            data = response.json()
            if response.is_error: raise RuntimeError(str(data.get('error','Adapter HTTP '+str(response.status_code))))
        if not data.get('ok'): raise ValueError(str(data.get('error')))
        return data['result']

    async def _lifi(self, path, method='GET', **kwargs):
        headers = {'x-lifi-api-key':self.settings.lifi_key} if self.settings.lifi_key else {}
        # No automatic retries for expensive quotes; rate limiting is recorded explicitly.
        async with httpx.AsyncClient(timeout=25,headers=headers) as client:
            response = await client.request(method,self.settings.lifi_url+path,**kwargs)
            response.raise_for_status()
            return response.json()

    async def discover(self, provider, intent):
        if provider not in self.providers(intent): return {'supported':False}
        if provider == 'lifi':
            result = await self._lifi('/connections',params={'fromChain':intent.sourceAsset.chain.chainId,'toChain':intent.destinationAsset.chain.chainId,
                        'fromToken':intent.sourceAsset.address or '0x'+'0'*40,'toToken':intent.destinationAsset.address or '0x'+'0'*40})
            return {'provider':provider, 'provenance':'live', 'connections':result.get('connections',[]), 'note':'Connections do not guarantee a quotable route.'}
        return await self._adapter({'operation':'discover','provider':provider,'intent':asdict(intent)})

    async def balance(self, asset, address):
        provider = 'paraspell' if asset.kind == 'substrate' else 'evm'
        result = await self._adapter({'operation':'balance','provider':provider,'asset':asdict(asset),'address':address})
        return {'asset':asdict(asset),'address':address,'amount':human(result['amountBaseUnits'],asset.decimals),'amountBaseUnits':result['amountBaseUnits'],'provenance':'live'}

    async def quote(self, provider, intent, sender):
        if provider not in self.providers(intent): return []
        if provider == 'lifi':
            body = {'fromChainId':intent.sourceAsset.chain.chainId,'toChainId':intent.destinationAsset.chain.chainId,
                    'fromTokenAddress':intent.sourceAsset.address or '0x'+'0'*40,'toTokenAddress':intent.destinationAsset.address or '0x'+'0'*40,
                    'fromAmount':units(intent.amount,intent.sourceAsset.decimals),'fromAddress':sender,'toAddress':intent.recipient,
                    'options':{'integrator':'thesis-router','slippage':0.005,'order':'CHEAPEST' if intent.constraints.preference!='speed' else 'FASTEST'}}
            response = await self._lifi('/advanced/routes','POST',json=body)
            result = []
            for route in response.get('routes',[])[:5]:
                # Addresses must match even though no transaction is being signed.
                if route.get('fromAddress','').lower() != sender.lower() or route.get('toAddress','').lower() != intent.recipient.lower():
                    raise ValueError('LI.FI account or recipient mismatch')
                result.append(normalize_lifi(route,intent))
            return result
        raw = await self._adapter({'operation':'quote','provider':provider,'intent':asdict(intent),'sender':sender,'amountBaseUnits':units(intent.amount,intent.sourceAsset.decimals)})
        return [normalize_paraspell(raw,intent)] if provider == 'paraspell' else normalize_wormhole(raw,intent)

class FixtureTools:
    """Explicit deterministic environment; no scenario oracle is exposed as a tool."""
    def __init__(self, fixture):
        self.fixture = fixture
    def providers(self, intent):
        return self.fixture.get('providers',[])
    async def discover(self, provider, intent):
        return {'provider':provider,'supported':provider in self.providers(intent),'provenance':'fixture'}
    async def balance(self, asset, address):
        for row in self.fixture.get('balances',[]):
            if Asset.model_validate(row['asset']).key() == asset.key() and row['address'].lower() == address.lower():
                return {**row,'provenance':'fixture'}
        raise ValueError('No fixture balance for that account/asset')
    async def quote(self, provider, intent, sender):
        error = self.fixture.get('errors',{}).get(provider)
        if error: raise RuntimeError(error)
        return [Candidate.model_validate({**row,'intentId':intent.id}) for row in self.fixture.get('candidates',[]) if row['provider']==provider]
