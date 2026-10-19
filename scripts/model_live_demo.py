"""One real local-model + live SDK planning run. Does not sign or submit."""
import asyncio,json,sys
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from router.config import Settings
from router.domain import Intent,Wallet,ChatRequest
from router.controller import Controller
from router.model import Ollama
from router.tools import LiveTools,asdict
async def main():
 settings=Settings();settings.trace_dir=str(ROOT/'evaluation/results/live-model-traces')
 row=json.loads((ROOT/'evaluation/scenarios.json').read_text())['scenarios'][1]
 ctl=Controller(settings,LiveTools(settings),Ollama(settings));wallets=[Wallet.model_validate(w) for w in row['wallets']]
 # Use the real user intent, with exact form fields, to isolate planning/tool use from NLP.
 intent=Intent.model_validate(row['structuredInput'])
 outcome=await ctl.plan(intent,wallets,'two-role')
 result={'readOnly':True,'inputTrack':'structured-form + model planner','fixtureToolsUsed':False,'model':settings.model,'outcome':asdict(outcome)}
 stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
 path=ROOT/f'evaluation/results/model-live-paraspell-{stamp}.json';path.write_text(json.dumps(result,indent=2))
 (ROOT/'evaluation/results/model-live-paraspell.json').write_text(json.dumps(result,indent=2))
 print('Live model/ParaSpell:',outcome.status,'selected',outcome.selectedId,'trace',outcome.traceId,flush=True)
 return 0 if outcome.status=='ready' else 1
if __name__=='__main__':sys.exit(asyncio.run(main()))
