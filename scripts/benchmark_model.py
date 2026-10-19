"""Measure local structured-output and tool-call smoke tests, RAM and Ollama metadata."""
import argparse,asyncio,json,sys,threading,time,subprocess
from pathlib import Path
import httpx,psutil
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from router.config import Settings
from router.extraction import Extraction
from router.prompts import INTERPRETER
from router.model import Ollama
from router.trace import Trace
from environment import manifest
async def main(args):
 settings=Settings(model=args.model);settings.trace_dir=str(ROOT/'evaluation/results/model-smoke-traces')
 trace=Trace(settings.trace_dir);out={'manifest':await manifest(settings),'runs':[]}
 peak={'systemUsedRamBytes':0,'ollamaProcessRssBytes':0,'gpuMemoryMiB':None};done=threading.Event()
 def sample():
  while not done.wait(.25):
   peak['systemUsedRamBytes']=max(peak['systemUsedRamBytes'],psutil.virtual_memory().used)
   rss=0
   for process in psutil.process_iter(['name','memory_info']):
    try:
     if any(term in (process.info['name'] or '').lower() for term in ['ollama','llama']):rss+=process.info['memory_info'].rss
    except (psutil.NoSuchProcess,psutil.AccessDenied):pass
   peak['ollamaProcessRssBytes']=max(peak['ollamaProcessRssBytes'],rss)
 sampler=threading.Thread(target=sample,daemon=True);sampler.start()
 cases=json.loads((ROOT/'evaluation/scenarios.json').read_text())['scenarios']
 model=Ollama(settings)
 try:
  for row in [cases[0],cases[1],cases[3]]:
   start=time.perf_counter()
   try:
    reply=await model.chat([{'role':'system','content':INTERPRETER},{'role':'user','content':row['utterance']}],trace,'smoke-interpretation',schema=Extraction.model_json_schema())
    parsed=Extraction.model_validate_json(reply['content']).interpretation(row['utterance']);result={'status':'ok','result':parsed.model_dump(exclude_none=True)}
   except Exception as e:result={'status':'error','error':str(e)}
   out['runs'].append({'case':row['id'],'seconds':time.perf_counter()-start,**result})
  spec={'type':'function','function':{'name':'quote','description':'Read-only route quote','parameters':{'type':'object','properties':{'provider':{'type':'string','enum':['paraspell']}},'required':['provider'],'additionalProperties':False}}}
  try:
   reply=await model.chat([{'role':'user','content':'Call quote with provider paraspell. Return a tool call, not text.'}],trace,'smoke-tool-calling',tools=[spec]);calls=reply.get('tool_calls') or []
   ok=len(calls)==1 and calls[0]['function']['name']=='quote' and calls[0]['function']['arguments']=={'provider':'paraspell'}
   out['toolCalling']={'status':'ok' if ok else 'incorrect','reply':reply}
  except Exception as e:out['toolCalling']={'status':'error','error':str(e)}
  async with httpx.AsyncClient(trust_env=False,timeout=10) as client:
   try:out['loadedModels']=(await client.get(settings.ollama_url+'/api/ps')).json()
   except Exception as e:out['loadedModelsError']=str(e)
  try:
   result=subprocess.run(['nvidia-smi','--query-gpu=memory.used','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=10)
   if result.returncode==0:peak['gpuMemoryMiB']=result.stdout.strip()
  except OSError:pass
 finally:done.set();sampler.join(timeout=2)
 out['resourceObservation']=peak;out['traceId']=trace.id
 out['limits']=['System RAM includes other processes. Process RSS can double-count shared pages.','GPU sample is an end-of-run observation, not continuous peak VRAM.','No power/energy or USD inference cost is estimated.','These smoke tests do not establish dataset success.']
 path=ROOT/'evaluation/results'/f'model-smoke-{args.model.replace(":","-").replace("/","-")}.json';path.write_text(json.dumps(out,indent=2,default=str))
 print('Saved:',path);print(json.dumps({'runs':out['runs'],'toolCalling':out.get('toolCalling'), 'resourceObservation':peak},indent=2))
 return 0 if all(r['status']=='ok' for r in out['runs']) and out.get('toolCalling',{}).get('status')=='ok' else 1
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--model',default='qwen3.5:4b');sys.exit(asyncio.run(main(p.parse_args())))
