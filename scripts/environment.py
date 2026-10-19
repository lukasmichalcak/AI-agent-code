import hashlib,json,platform,subprocess,sys
from pathlib import Path
import httpx,psutil
ROOT=Path(__file__).resolve().parents[1]
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def command(args):
 try:return subprocess.run(args,capture_output=True,text=True,timeout=15).stdout.strip()
 except (OSError,subprocess.TimeoutExpired):return None
async def manifest(settings):
 from router.prompts import PROMPT_VERSION
 result={'timestamp':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'python':sys.version,'os':platform.platform(),'processor':platform.processor(),'logicalCpus':psutil.cpu_count(),'ramBytes':psutil.virtual_memory().total,'node':command(['node','--version']),'gitHead':command(['git','rev-parse','HEAD']), 'gpu':command(['nvidia-smi','--query-gpu=name,driver_version,memory.total','--format=csv,noheader']), 'datasetSha256':sha(ROOT/'evaluation/scenarios.json'),'promptSha256':sha(ROOT/'backend/router/prompts.py'),'promptVersion':PROMPT_VERSION,'modelRequested':settings.model,'context':settings.context,'seed':settings.seed,'temperature':0,'thinking':False,'numPredict':2048,'toolMode':settings.tool_mode,'maxRounds':settings.max_rounds,'maxCalls':settings.max_calls}
 source_hash=hashlib.sha256()
 for directory in ['backend/router','adapters','scripts','frontend/src']:
  for file in sorted((ROOT/directory).rglob('*')):
   if file.is_file() and 'node_modules' not in file.parts and file.suffix in ['.py','.mjs','.ts','.tsx']:
    source_hash.update(str(file.relative_to(ROOT)).encode());source_hash.update(file.read_bytes())
 result['sourceCodeSha256']=source_hash.hexdigest()
 for path in ['frontend/package-lock.json','adapters/package-lock.json','backend/requirements.txt','backend/requirements-lock.txt']:
  if (ROOT/path).exists():result[path+'Sha256']=sha(ROOT/path)
 try:
  async with httpx.AsyncClient(trust_env=False, timeout=10) as client:
   result['ollamaVersion']=(await client.get(settings.ollama_url+'/api/version')).json()
   result['ollamaTags']=(await client.get(settings.ollama_url+'/api/tags')).json()
   result['modelDetails']=(await client.post(settings.ollama_url+'/api/show',json={'model':settings.model})).json()
 except Exception as e:result['ollamaUnavailable']=type(e).__name__
 return result
