import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const worker=fileURLToPath(new URL('../worker.mjs',import.meta.url));
async function query(chainId) {
 let balanceCalls=0;
 const server=createServer(async(req,res)=>{
  let body='';for await(const c of req)body+=c;
  const answer=r=>{if(r.method==='eth_getBalance')balanceCalls++;return {jsonrpc:'2.0',id:r.id,result:r.method==='eth_chainId' ? '0x'+chainId.toString(16) : '0x16345785d8a0000'}};
  const data=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Array.isArray(data)?data.map(answer):answer(data)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const request={operation:'balance',provider:'evm',asset:{chain:{ecosystem:'evm',chainId:84532},kind:'native',symbol:'ETH',decimals:18},address:'0x1111111111111111111111111111111111111111'};
  const value=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[worker,JSON.stringify(request)],{env:{...process.env,RPC_84532:`http://127.0.0.1:${server.address().port}`}});
   let output='';child.stdout.on('data',c=>output+=c);child.on('error',reject);child.on('exit',()=>{try{resolve(JSON.parse(output))}catch(e){reject(e)}});
  });
  return {value,balanceCalls};
 } finally {await new Promise(resolve=>server.close(resolve))}
}
test('worker refuses a balance from a different RPC network',async()=>{
 const {value,balanceCalls}=await query(1);assert.equal(value.ok,false);assert.match(value.error.message,/RPC chain ID/);assert.equal(balanceCalls,0);
});
test('worker returns exact balance units after verifying the network',async()=>{
 const {value}=await query(84532);assert.equal(value.ok,true);assert.equal(value.result.amountBaseUnits,'100000000000000000');
});
