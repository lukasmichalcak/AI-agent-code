import json
from datetime import datetime, timezone
from decimal import Decimal
from .domain import interpretation_schema, Asset, Candidate, Intent, Interpretation, Outcome, Amount, units
from .tools import asdict, exact_asset
from .extraction import Extraction
from .prompts import INTERPRETER, PLANNER, PROMPT_VERSION
from .trace import Trace
from .config import Settings

def function(name, description, properties=None, required=None):
    return {'type':'function','function':{'name':name,'description':description,'parameters':
        {'type':'object','properties':properties or {},'required':required or [],'additionalProperties':False}}}

def filter_candidates(intent, candidates, balances, current_time, max_age=120):
    accepted, rejected = [], []
    seen = set()
    for c in candidates:
        reasons = []
        try:
            exact_asset(intent.sourceAsset,c.sourceAsset)
            exact_asset(intent.sourceAsset,c.sourceInput.asset)
            exact_asset(intent.destinationAsset,c.destinationAsset)
            exact_asset(intent.destinationAsset,c.expectedOutput.asset)
            if c.minimumOutput: exact_asset(intent.destinationAsset,c.minimumOutput.asset)
            if c.intentId != intent.id: reasons.append('intent_id_mismatch')
            if units(c.sourceInput.amount,c.sourceAsset.decimals) != units(intent.amount,intent.sourceAsset.decimals): reasons.append('input_amount_mismatch')
            units(c.expectedOutput.amount,c.destinationAsset.decimals)
            if c.minimumOutput:
                units(c.minimumOutput.amount,c.destinationAsset.decimals)
                if Decimal(c.minimumOutput.amount) > Decimal(c.expectedOutput.amount): reasons.append('invalid_minimum_output')
            if Decimal(c.expectedOutput.amount) <= 0: reasons.append('zero_output')
            quoted = datetime.fromisoformat(c.quotedAt.replace('Z','+00:00'))
            age = (current_time-quoted).total_seconds()
            if age > max_age or age < -5: reasons.append('stale_or_future_quote')
            if c.expiresAt and datetime.fromisoformat(c.expiresAt.replace('Z','+00:00')) <= current_time: reasons.append('expired_quote')
            if c.destinationRepresentation == 'unknown': reasons.append('unknown_destination_representation')
            if c.destinationRepresentation == 'wrapped' and not intent.constraints.allowWrapped: reasons.append('wrapped_not_allowed')
            constraint = intent.constraints
            if constraint.maximumFeeUsd is not None:
                if not c.feeComplete or c.totalUserCostUsd is None: reasons.append('unknown_total_fee')
                elif Decimal(c.totalUserCostUsd) > Decimal(constraint.maximumFeeUsd): reasons.append('fee_limit')
            if constraint.minimumReceived is not None:
                if not c.minimumOutput: reasons.append('unknown_minimum_output')
                elif Decimal(c.minimumOutput.amount) < Decimal(constraint.minimumReceived): reasons.append('minimum_output_limit')
            if constraint.maximumDurationSeconds is not None:
                if c.estimatedDurationSeconds is None: reasons.append('unknown_duration')
                elif c.estimatedDurationSeconds > constraint.maximumDurationSeconds: reasons.append('duration_limit')
            # Sum base units, including gas in the same asset as the input; avoid Decimal rounding.
            required = {intent.sourceAsset.key(): int(units(intent.amount,intent.sourceAsset.decimals))}
            for gas in c.gasNeeds:
                required[gas.asset.key()] = required.get(gas.asset.key(),0) + int(units(gas.amount,gas.asset.decimals))
            for key, amount in required.items():
                if key not in balances: reasons.append('balance_unverified')
                elif balances[key] < amount: reasons.append('insufficient_balance_or_gas')
            if c.id in seen: reasons.append('duplicate_candidate_id')
            seen.add(c.id)
        except (ValueError,TypeError,KeyError):
            reasons.append('candidate_identity_or_schema_mismatch')
        if reasons: rejected.append({'id':c.id,'provider':c.provider,'reasons':sorted(set(reasons))})
        else: accepted.append(c)
    return accepted,rejected

def select_candidate(intent, candidates):
    if not candidates: return None
    def score(c):
        cost = Decimal(c.totalUserCostUsd) if c.feeComplete and c.totalUserCostUsd is not None else Decimal('Infinity')
        speed = c.estimatedDurationSeconds if c.estimatedDurationSeconds is not None else float('inf')
        output = -Decimal(c.expectedOutput.amount)
        return {'cost':(cost,output,speed,c.id),'speed':(speed,cost,output,c.id),'output':(output,cost,speed,c.id)}[intent.constraints.preference]
    return min(candidates,key=score).id

class Controller:
    def __init__(self, settings: Settings, tools, model=None, clock=None):
        self.settings,self.tools,self.model = settings,tools,model
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def source_address(self, intent, wallets):
        ecosystem = intent.sourceAsset.chain.ecosystem
        addresses = {w.address for w in wallets if w.ecosystem==ecosystem and w.status=='connected' and w.address}
        if len(addresses) != 1: return None
        address = next(iter(addresses))
        # Reuse validation on a source-native recipient; SS58 checksum is checked by SDK.
        import re
        if ecosystem == 'evm' and (not re.fullmatch(r'0x[0-9a-fA-F]{40}',address) or int(address,16)==0): return None
        if ecosystem == 'substrate' and not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{47,50}',address): return None
        return address

    async def chat(self, request):
        trace = Trace(self.settings.trace_dir)
        trace.add('task',mode=request.mode,input=request.model_dump(),promptVersion=PROMPT_VERSION,toolMode=self.settings.tool_mode)
        history = [{'role':x['role'],'content':x['text'][:10000]} for x in request.history if x.get('role') in ['user','assistant'] and isinstance(x.get('text'),str)]
        messages = [{'role':'system','content':INTERPRETER},*history,{'role':'user','content':request.message}]
        try:
            if not self.model: raise RuntimeError('No local model configured')
            if request.mode == 'two-role':
                reply = await self.model.chat(messages,trace,'interpreter',schema=Extraction.model_json_schema())
                parsed = Extraction.model_validate_json(reply['content']).interpretation(request.message)
                context = None
            else:
                messages[0]['content'] += '\nCall interpret_intent with the flat fields in its schema (status, sourceChain, destinationChain, asset kinds, amount, recipient and constraints).'
                schema = Extraction.model_json_schema()
                spec = {'type':'function','function':{'name':'interpret_intent','description':'Record exact intent or targeted clarification','parameters':schema}}
                reply = await self.model.chat(messages,trace,'single-agent',tools=[spec])
                calls = reply.get('tool_calls') or []
                if len(calls)!=1 or calls[0]['function']['name']!='interpret_intent': raise ValueError('Single agent did not produce interpret_intent')
                args = calls[0]['function']['arguments']
                if isinstance(args,str): args=json.loads(args)
                parsed = Extraction.model_validate(args).interpretation(request.message)
                messages += [reply,{'role':'tool','tool_name':'interpret_intent','content':json.dumps(asdict(parsed))}]
                context = messages
            if parsed.intent: parsed.intent.naturalLanguage=request.message
            trace.add('interpretation',result=asdict(parsed))
            if parsed.clarification:
                outcome = Outcome(status='clarification',message=parsed.clarification,traceId=trace.id)
                trace.add('outcome',result=asdict(outcome)); return outcome
            return await self.plan(parsed.intent,request.wallets,request.mode,trace,context)
        except Exception as error:
            trace.add('error',phase='interpretation',error=str(error))
            outcome = Outcome(status='model_error',message='Local model interpretation failed. Check the trace and Ollama endpoint; no tools were used to sign or submit.',traceId=trace.id)
            trace.add('outcome',result=asdict(outcome)); return outcome

    async def plan(self, intent, wallets, mode='deterministic', trace=None, context=None):
        trace = trace or Trace(self.settings.trace_dir)
        trace.add('planning_start',intent=asdict(intent),wallets=[asdict(w) for w in wallets],mode=mode,promptVersion=PROMPT_VERSION)
        sender = self.source_address(intent,wallets)
        if not sender:
            return self._finish(trace,Outcome(status='clarification',message='Provide one source account in the correct ecosystem to inspect balances and quotes. A public account is sufficient for read-only planning.',intent=intent,traceId=trace.id))
        providers = self.tools.providers(intent)
        if not providers:
            return self._finish(trace,Outcome(status='rejected',message='This corridor is outside the configured adapter coverage.',intent=intent,traceId=trace.id))
        candidates,balances,errors,called = [],{ },[],set()
        selection = None
        finished = mode=='deterministic'
        async def invoke(name, args):
            nonlocal selection,finished
            trace.add('tool_call',name=name,arguments=args)
            try:
                if not isinstance(args,dict): raise ValueError('Object arguments required')
                if name in ['quote','discover']:
                    if set(args)!= {'provider'} or args['provider'] not in providers: raise ValueError('Eligible provider argument required')
                    key = (name,args['provider'])
                    if key in called: raise ValueError('Duplicate tool call refused')
                    called.add(key)
                    if name=='discover': result=await self.tools.discover(args['provider'],intent)
                    else:
                        rows=await self.tools.quote(args['provider'],intent,sender)
                        if any(c.provider != args['provider'] for c in rows): raise ValueError('Provider mismatch')
                        candidates.extend(rows)
                        # Raw provider text remains in the trace, but only bounded quote facts reach the model.
                        result={'candidates':[c.model_dump(exclude={'raw'},exclude_none=True) for c in rows]}
                elif name=='check_balances':
                    if args: raise ValueError('check_balances takes no arguments')
                    assets={intent.sourceAsset.key():intent.sourceAsset}
                    for c in candidates:
                        for gas in c.gasNeeds: assets[gas.asset.key()]=gas.asset
                    rows=[]
                    for key,asset in assets.items():
                        account = sender if asset.chain == intent.sourceAsset.chain else intent.recipient
                        row=await self.tools.balance(asset,account)
                        exact_asset(asset,Asset.model_validate(row['asset']))
                        if row['address'].lower()!=account.lower(): raise ValueError('Balance account mismatch')
                        balances[key]=int(units(row['amount'],asset.decimals));rows.append(row)
                    result={'balances':rows}
                elif name=='finish':
                    if set(args)-{'selectedId'} or args.get('selectedId') is not None and not isinstance(args['selectedId'],str): raise ValueError('finish expects selectedId string or null')
                    selection=args.get('selectedId');finished=True;result={'selectionProposed':selection}
                else: raise ValueError('Unknown or prohibited tool')
                trace.add('tool_result',name=name,result=result)
                return result
            except Exception as error:
                result={'error':type(error).__name__,'message':str(error)}
                errors.append({'tool':name,'provider':args.get('provider') if isinstance(args,dict) else None,**result})
                trace.add('tool_error',name=name,result=result);return result
        if mode=='deterministic':
            for provider in providers: await invoke('quote',{'provider':provider})
            await invoke('check_balances',{})
        else:
            messages=context or [{'role':'system','content':PLANNER}]
            if context: messages.append({'role':'system','content':PLANNER})
            messages.append({'role':'user','content':json.dumps({'validatedIntent':asdict(intent),'sender':sender,'eligibleProviders':providers,'task':'Query quotes, check balances, select a candidate.'})})
            specs = [function(name,f'{name} for a provider bound to the current request',{'provider':{'type':'string','enum':providers}},['provider']) for name in ['discover','quote']]
            specs += [function('check_balances','Inspect source and every observed candidate gas asset; call after quote'),function('finish','Propose an observed candidate, or null',{'selectedId':{'type':['string','null']}},['selectedId'])]
            calls_used=0
            try:
                for _ in range(self.settings.max_rounds):
                    reply=await self.model.chat(messages,trace,'planner' if mode=='two-role' else 'single-agent',tools=specs)
                    messages.append(reply)
                    calls=reply.get('tool_calls') or []
                    if not calls: break
                    for call in calls:
                        calls_used+=1
                        if calls_used>self.settings.max_calls: raise ValueError('Tool budget exceeded')
                        name=call['function']['name'];args=call['function']['arguments']
                        if isinstance(args,str): args=json.loads(args)
                        result=await invoke(name,args)
                        messages.append({'role':'tool','tool_name':name,'content':json.dumps(result,ensure_ascii=False)[:50000]})
                        if finished: break
                    if finished: break
            except Exception as error:
                errors.append({'tool':'model','error':type(error).__name__,'message':str(error)})
                trace.add('error',phase='planning',error=str(error))
        accepted,rejected=filter_candidates(intent,candidates,balances,self.clock(),self.settings.max_quote_age)
        deterministic_selection=select_candidate(intent,accepted)
        if mode=='deterministic': selection=deterministic_selection
        elif selection and selection not in {c.id for c in accepted}:
            errors.append({'tool':'finish','error':'unsafe_or_unknown_selection','message':'Controller rejected proposed candidate'})
            selection=None
        # No silent deterministic rescue of agent omissions; these count as process failures.
        if mode!='deterministic' and (not finished or not selection) and accepted:
            status='unavailable';message='The agent did not finish with an eligible observed route. Validated alternatives are shown for review.'
        elif accepted and selection:
            status='ready';message='Read-only candidates validated for review. No transaction is signed or submitted.'
        elif rejected:
            status='rejected';message='Observed candidates fail one or more identity, balance, freshness or hard-constraint checks.'
        elif errors:
            status='unavailable';message='Provider or model calls failed; absence of a route is not proven.'
        else:
            status='rejected';message='No quote was returned for the exact requested asset pair.'
        if len({args[1] for args in called if args[0]=='quote'}) < len(providers):
            errors.append({'tool':'quote','error':'incomplete_provider_comparison','message':'One or more eligible providers were not queried'})
        return self._finish(trace,Outcome(status=status,message=message,intent=intent,candidates=accepted,selectedId=selection,rejected=rejected,errors=errors,traceId=trace.id))

    def _finish(self,trace,outcome):
        trace.add('outcome',result=asdict(outcome));return outcome
