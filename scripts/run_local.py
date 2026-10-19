"""Launch the local stack in one process tree; Ctrl+C stops only children we own."""
import argparse,os,shutil,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--fixture',action='store_true');p.add_argument('--model',default=os.getenv('OLLAMA_MODEL','qwen3.5:4b'));args=p.parse_args()
 npm=shutil.which('npm' if os.name=='nt' else 'npm')
 if not npm:raise SystemExit('Install Node 22.12+ first.')
 env={**os.environ,'TOOL_MODE':'fixture' if args.fixture else 'live','OLLAMA_MODEL':args.model}
 processes=[]
 try:
  for command,cwd in [(['node','server.mjs'],ROOT/'adapters'),([sys.executable,'-m','uvicorn','router.api:app','--app-dir','backend','--host','127.0.0.1','--port','8000'],ROOT),([npm,'run','dev','--','--port','5173','--strictPort'],ROOT/'frontend')]:
   processes.append(subprocess.Popen(command,cwd=cwd,env=env))
  print('\nOpen http://127.0.0.1:5173 · read-only · Ctrl+C stops the stack.',flush=True)
  print('Ollama must already be running for chat. The form baseline works without a model.',flush=True)
  while True:
   for child in processes:
    if child.poll() is not None:raise RuntimeError(f'A service exited with {child.returncode}; see its log above.')
   time.sleep(.5)
 except KeyboardInterrupt:pass
 finally:
  for child in reversed(processes):
   if child.poll() is None:
    if os.name=='nt':subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    else:child.terminate()
  for child in processes:
   try:child.wait(timeout=10)
   except subprocess.TimeoutExpired:child.kill()
if __name__=='__main__':main()
