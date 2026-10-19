"""Package source and evidence, excluding credentials, dependencies and browser captures."""
import argparse,hashlib,json,subprocess,zipfile
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EXCLUDED={'.git','node_modules','.venv','__pycache__','.pytest_cache','test-results','playwright-report','dist','.vite'}
MANIFEST=ROOT/'docs/SOURCE_MANIFEST.json'
def include(path):
 relative=path.relative_to(ROOT)
 return (path.is_file() and not EXCLUDED.intersection(relative.parts)
   and not (path.name.startswith('.env') and not path.name.endswith('.example'))
   and not path.name.startswith('~$') and path.suffix.lower() not in {'.pem','.key','.pyc'}
   and path.name not in {'.DS_Store','Thumbs.db'} and path != MANIFEST)
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT.parent/'AI_agent_week4_implementation.zip');args=parser.parse_args()
 target=args.output.resolve()
 if target.is_relative_to(ROOT):raise SystemExit('Choose a ZIP output outside the source tree.')
 files=sorted(p for p in ROOT.rglob('*') if include(p))
 head=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True).stdout.strip()
 manifest={'createdAt':datetime.now(timezone.utc).isoformat(),'originalGitHead':head,'readOnlyAgent':True,
   'note':'Snapshot includes original files plus uncommitted implementation and exploratory evidence. This manifest excludes itself.',
   'files':[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
 MANIFEST.write_text(json.dumps(manifest,indent=2));files.append(MANIFEST);target.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
  for path in files:archive.write(path,Path('AI_agent_week4')/path.relative_to(ROOT))
 with zipfile.ZipFile(target) as archive:
  assert archive.testzip() is None
  assert 'AI_agent_week4/README.md' in archive.namelist()
 print(json.dumps({'path':str(target),'files':len(files),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}))
if __name__=='__main__':main()
