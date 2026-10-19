import asyncio,json,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from router.domain import Intent,Asset
from router.config import Settings
from router.tools import LiveTools,asdict,normalize_wormhole
from router.domain import units
async def main():
 tools=LiveTools(Settings());i=Intent.model_validate(json.loads((ROOT/'evaluation/scenarios.json').read_text())['scenarios'][0]['structuredInput'])
 out=[]
 for name,fn in [('sdk_balance',lambda:tools._adapter({'operation':'balance','provider':'wormhole','asset':asdict(i.sourceAsset),'address':i.recipient})),('wrapped_quote',None)]:
  started=time.perf_counter()
  try:
   if name=='wrapped_quote':
    i.destinationAsset=Asset(chain=i.destinationAsset.chain,kind='erc20',address='0x45b677F11c37fc73BA89E78bccB86762a653b6EF',symbol='WETH (Wormhole)',decimals=18);i.constraints.allowWrapped=True
    raw=await tools._adapter({'operation':'quote','provider':'wormhole','intent':asdict(i),'sender':i.recipient,'amountBaseUnits':units(i.amount,i.sourceAsset.decimals)})
    result={'raw':raw,'candidates':[asdict(c) for c in normalize_wormhole(raw,i)]}
   else:result=await fn()
   row={'name':name,'status':'ok','result':result}
  except Exception as e:row={'name':name,'status':'error','error':str(e)}
  row['seconds']=time.perf_counter()-started;out.append(row);print(name,row['status'],flush=True)
 (ROOT/'evaluation/results/wormhole-probe-final.json').write_text(json.dumps(out,indent=2))
if __name__=='__main__':asyncio.run(main())
