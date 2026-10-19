"""Reproducible provider, deterministic and local-model fixture comparisons."""
import argparse,asyncio,json,statistics,sys,time
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from router.config import Settings
from router.domain import Intent,Wallet,ChatRequest,Outcome
from router.controller import Controller
from router.tools import FixtureTools,asdict
from router.model import Ollama
from environment import manifest

def intent_fingerprint(intent):
 if not intent:return None
 value=asdict(intent);value.pop('id',None);value.pop('naturalLanguage',None)
 # Symbols are presentation metadata; do not punish a changed display label.
 for key in ['sourceAsset','destinationAsset']:
  value[key].pop('symbol',None)
  if 'address' in value[key]:value[key]['address']=value[key]['address'].lower()
 return value

def grade(row,outcome):
 expected=row['expected']
 target=Intent.model_validate(expected['intent']) if expected['intent'] else None
 parsed=intent_fingerprint(outcome.intent)==intent_fingerprint(target)
 status=outcome.status==expected['status']
 # Overall cross-provider optimum is separate from validity and provider coverage.
 selection=outcome.selectedId==expected['selectedId'] if expected['status']=='ready' else outcome.selectedId is None
 unsafe=any(e.get('error')=='unsafe_or_unknown_selection' for e in outcome.errors)
 prohibited=any(e.get('tool') not in ['quote','discover','check_balances','finish','model'] for e in outcome.errors)
 incomplete=any(e.get('error')=='incomplete_provider_comparison' for e in outcome.errors)
 return {'statusCorrect':status,'intentCorrect':parsed,'selectionCorrect':selection,
         'systemOutcomeCorrect':status and parsed and selection and not outcome.executionEnabled,
         'workflowSuccess':status and parsed and selection and not outcome.executionEnabled and not unsafe and not prohibited and not incomplete,
         'unsafeProposalBlocked':unsafe,'prohibitedToolAttempt':prohibited,'incompleteComparison':incomplete,'executionEnabled':outcome.executionEnabled}

def process_grade(row, outcome, events, mode, base_grade):
 # An early targeted clarification / unsupported corridor needs no planner finish.
 # Otherwise a correct controller outcome alone does not prove agent completion.
 needs_finish = mode in ['single-agent','two-role'] and outcome.intent is not None and bool(row['fixture']['providers'])
 finish_observed = any(e.get('event') == 'tool_result' and e.get('name') == 'finish' for e in events)
 complete = not needs_finish or finish_observed
 return {'agentFinishRequired':needs_finish,'agentFinishObserved':finish_observed,
         'workflowCompleted':complete,'completeWorkflowSuccess':base_grade['workflowSuccess'] and complete}


async def run(args):
 dataset=json.loads((ROOT/'evaluation/scenarios.json').read_text())
 rows=[r for r in dataset['scenarios'] if args.split=='all' or r['split']==args.split]
 if args.ids:rows=[r for r in rows if r['id'] in args.ids.split(',')]
 settings=Settings(tool_mode='fixture',model=args.model)
 output=ROOT/'evaluation/results'/f'{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")}-{args.mode.replace(":","-")}-{args.model.replace(":","-").replace("/","-")}'
 output.mkdir(parents=True,exist_ok=True);settings.trace_dir=str(output/'traces')
 metadata=await manifest(settings);metadata.update(mode=args.mode,split=args.split,repeats=args.repeats,inputTrack='natural_language' if args.mode in ['single-agent','two-role'] else 'structured_form')
 (output/'manifest.json').write_text(json.dumps(metadata,indent=2,default=str))
 results=[]
 for row in rows:
  for repeat in range(args.repeats):
   provider=args.mode.partition(':')[2] if args.mode.startswith('provider:') else None
   if provider and provider not in row['fixture']['providers']:
    na={'scenarioId':row['id'],'repeat':repeat,'applicable':False,'reason':'provider_out_of_scope'};results.append(na)
    with (output/'results.jsonl').open('a') as f:f.write(json.dumps(na)+'\n')
    continue
   fixture=json.loads(json.dumps(row['fixture']))
   if provider:
    fixture['providers']=[provider];fixture['candidates']=[c for c in fixture['candidates'] if c['provider']==provider]
   ctl=Controller(settings,FixtureTools(fixture),Ollama(settings),clock=lambda:datetime.fromisoformat(fixture['referenceTime']))
   wallets=[Wallet.model_validate(w) for w in row['wallets']]
   start=time.perf_counter()
   if args.mode in ['single-agent','two-role']:
    outcome=await ctl.chat(ChatRequest(message=row['utterance'],wallets=wallets,mode=args.mode))
   elif row['structuredInput']:
    outcome=await ctl.plan(Intent.model_validate(row['structuredInput']),wallets,'deterministic')
   else:
    outcome=Outcome(status='clarification',message='Form input is incomplete; supply exact assets, amount and recipient.',traceId='form-baseline')
   latency=time.perf_counter()-start
   traces=list((output/'traces').glob(outcome.traceId+'.jsonl'))
   events=[json.loads(line) for line in traces[0].read_text().splitlines()] if traces else []
   tokens=sum(x['response'].get('eval_count',0) for x in events if x['event']=='model_response')
   input_tokens=sum(x['response'].get('prompt_eval_count',0) for x in events if x['event']=='model_response')
   grades=grade(row,outcome)
   result={'scenarioId':row['id'],'repeat':repeat,'applicable':True,'language':row['language'],'riskTags':row['riskTags'],'latencySeconds':latency,
          'modelOutputTokens':tokens,'modelInputTokens':input_tokens,'toolCalls':sum(x['event']=='tool_call' for x in events),
          'toolErrors':sum(x['event']=='tool_error' for x in events),'outcome':asdict(outcome),**grades,**process_grade(row,outcome,events,args.mode,grades)}
   results.append(result)
   with (output/'results.jsonl').open('a',encoding='utf8') as f:f.write(json.dumps(result,ensure_ascii=False)+'\n')
   print(f"{row['id']} repeat {repeat+1}: {outcome.status} / {'PASS' if result['completeWorkflowSuccess'] else 'FAIL'} / {latency:.2f}s",flush=True)
 eligible=[r for r in results if r['applicable']]
 per_task=[]
 for identifier in sorted({r['scenarioId'] for r in eligible}):
  group=[r for r in eligible if r['scenarioId']==identifier]
  per_task.append({'scenarioId':identifier,'runs':len(group),'successRate':sum(r['workflowSuccess'] for r in group)/len(group),'completeSuccessRate':sum(r['completeWorkflowSuccess'] for r in group)/len(group),'allRunsSuccessful':all(r['workflowSuccess'] for r in group),'statusStable':len({r['outcome']['status'] for r in group})==1})
 summary={'mode':args.mode,'inputTrack':metadata['inputTrack'],'distinctTasks':len(per_task),'applicableRuns':len(eligible),'notApplicableRuns':sum(not r['applicable'] for r in results),
          'meanPerTaskSuccessRate':statistics.mean(r['successRate'] for r in per_task) if per_task else None,'tasksSuccessfulInEveryRun':sum(r['allRunsSuccessful'] for r in per_task),
          'meanLatencySeconds':statistics.mean(r['latencySeconds'] for r in eligible) if eligible else None,'totalModelOutputTokens':sum(r['modelOutputTokens'] for r in eligible),
          'totalModelInputTokens':sum(r['modelInputTokens'] for r in eligible),'toolErrors':sum(r['toolErrors'] for r in eligible),'perTask':per_task,
          'completeWorkflowSuccessfulRuns':sum(r['completeWorkflowSuccess'] for r in eligible),
          'meanPerTaskCompleteWorkflowSuccessRate':statistics.mean(r['completeSuccessRate'] for r in per_task) if per_task else None,
          'limitations':['Synthetic fixture results are not transfer success or live routing reliability.','Structured-form baselines do not measure natural-language interpretation.','Repeated attempts on a task are not independent tasks.','No dollar inference cost or energy was measured.']}
 (output/'summary.json').write_text(json.dumps(summary,indent=2));(output/'all-results.json').write_text(json.dumps(results,indent=2))
 print('Results:',output);print(json.dumps({k:v for k,v in summary.items() if k not in ['perTask','limitations']},indent=2))
 return 0 if eligible and all(r['completeWorkflowSuccess'] for r in eligible) else 1
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--mode',choices=['deterministic','single-agent','two-role','provider:lifi','provider:paraspell','provider:wormhole'],default='deterministic');p.add_argument('--model',default='qwen3.5:4b');p.add_argument('--split',choices=['dev','test','all'],default='dev');p.add_argument('--repeats',type=int,default=1);p.add_argument('--ids',default='');args=p.parse_args()
 if args.repeats<1:p.error('repeats must be positive')
 sys.exit(asyncio.run(run(args)))
