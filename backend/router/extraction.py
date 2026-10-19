"""Small-model-facing flat fields; deterministic conversion into the canonical domain."""
from typing import Literal
from pydantic import Field
from .domain import Strict,DecimalString,Intent,Asset,Constraints,Interpretation

CHAIN_IDS={'Ethereum':1,'Arbitrum':42161,'Base':8453,'Sepolia':11155111,'ArbitrumSepolia':421614,'BaseSepolia':84532}
CHAIN_NAMES=[*CHAIN_IDS,'AssetHubPaseo','PeoplePaseo']
class Extraction(Strict):
    status: Literal['intent','clarification']
    sourceChain: str | None = None
    destinationChain: str | None = None
    sourceKind: Literal['native','erc20'] | None = None
    destinationKind: Literal['native','erc20'] | None = None
    sourceContract: str | None = None
    destinationContract: str | None = None
    sourceDecimals: int | None = Field(default=None,ge=0,le=255)
    destinationDecimals: int | None = Field(default=None,ge=0,le=255)
    amount: DecimalString | None = None
    recipient: str | None = None
    maximumFeeUsd: DecimalString | None = None
    minimumReceived: DecimalString | None = None
    maximumDurationSeconds: int | None = Field(default=None,gt=0)
    allowWrapped: bool = False
    preference: Literal['cost','speed','output'] = 'cost'
    clarification: str | None = None

    def interpretation(self,message):
        if self.status=='clarification':
            return Interpretation(clarification=self.clarification or 'Specify exact source/destination chains, asset identifiers, amount and recipient.')
        missing=[]
        def canonical(value):
            if value is None:return None
            key=value.replace(' ','').lower()
            return next((name for name in CHAIN_NAMES if name.lower()==key or str(CHAIN_IDS.get(name))==value),None)
        source,dest=canonical(self.sourceChain),canonical(self.destinationChain)
        for label,value in [('source chain',source),('destination chain',dest),('source asset kind',self.sourceKind),('destination asset kind',self.destinationKind),('amount',self.amount),('recipient',self.recipient)]:
            if value is None or value=='':missing.append(label)
        for side in ['source','destination']:
            if getattr(self,side+'Kind')=='erc20':
                if not getattr(self,side+'Contract'):missing.append(side+' token contract')
                if getattr(self,side+'Decimals') is None:missing.append(side+' token decimals')
        if missing:return Interpretation(clarification='Please provide '+', '.join(missing)+'. Tickers alone do not identify token contracts.')
        def asset(side,name):
            if name not in CHAIN_IDS:
                if getattr(self,side+'Kind')!='native':raise ValueError('Only native PAS is supported on the bounded Paseo chains')
                return Asset(chain={'ecosystem':'substrate','name':name},kind='substrate',symbol='PAS',decimals=10,assetIdentifier='native:PAS')
            if getattr(self,side+'Kind')=='native':
                return Asset(chain={'ecosystem':'evm','chainId':CHAIN_IDS[name]},kind='native',symbol='ETH',decimals=18)
            return Asset(chain={'ecosystem':'evm','chainId':CHAIN_IDS[name]},kind='erc20',symbol='Token',decimals=getattr(self,side+'Decimals'),address=getattr(self,side+'Contract'))
        return Interpretation(intent=Intent(id='parsed',naturalLanguage=message,sourceAsset=asset('source',source),destinationAsset=asset('destination',dest),amount=self.amount,recipient=self.recipient,
            constraints=Constraints(maximumFeeUsd=self.maximumFeeUsd,minimumReceived=self.minimumReceived,maximumDurationSeconds=self.maximumDurationSeconds,allowWrapped=self.allowWrapped,preference=self.preference)))
