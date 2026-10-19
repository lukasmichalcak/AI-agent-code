"""Public-account read-only probes. Record failures without asserting absent routes."""
import asyncio,json,sys,time
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from router.config import Settings
from router.tools import LiveTools,asdict
from router.domain import Intent,Asset
from environment import manifest
async def main():
 tools=LiveTools(Settings());cases=json.loads((ROOT/'evaluation/scenarios.json').read_text())['scenarios']
 out={'timestamp':datetime.now(timezone.utc).isoformat(),'readOnly':True,'manifest':await manifest(Settings()),'checks':[]}
 async def check(name,fn):
  start=time.perf_counter()
  try:
   result=await asyncio.wait_for(fn(),55)
   result=[asdict(x) for x in result] if isinstance(result,list) and result and hasattr(result[0],'model_dump') else result
   row={'name':name,'status':'ok','result':result}
  except Exception as error:row={'name':name,'status':'error','error':type(error).__name__,'detail':str(error)}
  row['seconds']=time.perf_counter()-start;out['checks'].append(row);print(name,row['status'],flush=True)
  (ROOT/'evaluation/results/live-probe.json').write_text(json.dumps(out,indent=2,default=str))
 pas=Intent.model_validate(cases[1]['structuredInput']);evm=Intent.model_validate(cases[0]['structuredInput']);usdc=Intent.model_validate(cases[2]['structuredInput'])
 await check('paraspell_registry',lambda:tools.discover('paraspell',pas))
 await check('paraspell_public_balance',lambda:tools.balance(pas.sourceAsset,pas.recipient))
 await check('paraspell_fee_transferinfo_dryrun',lambda:tools.quote('paraspell',pas,pas.recipient))
 await check('lifi_connections_mainnet',lambda:tools.discover('lifi',usdc))
 await check('lifi_routes_mainnet',lambda:tools.quote('lifi',usdc,usdc.recipient))
 await check('lifi_connections_testnet',lambda:tools.discover('lifi',evm))
 await check('lifi_routes_testnet',lambda:tools.quote('lifi',evm,evm.recipient))
 await check('evm_native_balance',lambda:tools.balance(evm.sourceAsset,evm.recipient))
 await check('wormhole_destination_discovery',lambda:tools.discover('wormhole',evm))
 await check('wormhole_exact_pair_quotes',lambda:tools.quote('wormhole',evm,evm.recipient))
 wrapped=Intent.model_validate(evm.model_dump());wrapped.destinationAsset=Asset(chain=evm.destinationAsset.chain,kind='erc20',address='0x45b677F11c37fc73BA89E78bccB86762a653b6EF',symbol='WETH (Wormhole)',decimals=18);wrapped.constraints.allowWrapped=True
 await check('wormhole_explicit_wrapped_pair_quote',lambda:tools.quote('wormhole',wrapped,wrapped.recipient))
 await check('wormhole_sdk_balance',lambda:tools._adapter({'operation':'balance','provider':'wormhole','asset':asdict(evm.sourceAsset),'address':evm.recipient}))
 print('Saved evaluation/results/live-probe.json')
if __name__=='__main__':asyncio.run(main())
