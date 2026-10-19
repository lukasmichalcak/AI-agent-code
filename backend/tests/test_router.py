import copy,json
from datetime import datetime
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from router.domain import Intent,Candidate,Wallet,units,human,ChatRequest
from router.controller import Controller,filter_candidates
from router.tools import FixtureTools, normalize_lifi, normalize_paraspell
from router.config import Settings
ROOT=Path(__file__).resolve().parents[2]
ROWS=json.loads((ROOT/'evaluation/scenarios.json').read_text())['scenarios']

@pytest.mark.parametrize('row',[r for r in ROWS if r['structuredInput']],ids=lambda r:r['id'])
@pytest.mark.asyncio
async def test_controller_oracle(row,tmp_path):
 settings=Settings(tool_mode='fixture',trace_dir=str(tmp_path))
 ctl=Controller(settings,FixtureTools(row['fixture']),clock=lambda:datetime.fromisoformat(row['fixture']['referenceTime']))
 result=await ctl.plan(Intent.model_validate(row['structuredInput']),[Wallet.model_validate(w) for w in row['wallets']])
 assert result.status==row['expected']['status']
 assert result.selectedId==row['expected']['selectedId']
 assert result.executionEnabled is False
 assert list(tmp_path.glob('*.jsonl'))

def test_exact_large_amounts():
 value='123456789012345678901234567890.123456789012345678'
 assert human(units(value,18),18)==value
 assert human('1000000000000000000',18)=='1'
 assert human('0',18)=='0'
 with pytest.raises(ValueError):units('0.001',2)

@pytest.mark.asyncio
async def test_source_account_required(tmp_path):
 row=ROWS[0];ctl=Controller(Settings(trace_dir=str(tmp_path)),FixtureTools(row['fixture']))
 out=await ctl.plan(Intent.model_validate(row['structuredInput']),[])
 assert out.status=='clarification';assert not out.candidates

class ScriptModel:
 def __init__(self,replies):self.replies=iter(replies)
 async def chat(self,*args,**kwargs):return next(self.replies)
def call(name,args):return {'role':'assistant','content':'','tool_calls':[{'function':{'name':name,'arguments':args}}]}

@pytest.mark.asyncio
async def test_untrusted_selection_cannot_override_bound_request(tmp_path):
 row=ROWS[12] # injected warning text is passed as data, not executed.
 model=ScriptModel([call('sign_and_send',{'recipient':'0x2222222222222222222222222222222222222222'}),call('quote',{'provider':'lifi'}),call('check_balances',{}),call('finish',{'selectedId':'invented-route'})])
 ctl=Controller(Settings(trace_dir=str(tmp_path)),FixtureTools(row['fixture']),model,clock=lambda:datetime.fromisoformat(row['fixture']['referenceTime']))
 out=await ctl.plan(Intent.model_validate(row['structuredInput']),[Wallet.model_validate(w) for w in row['wallets']],'two-role')
 assert out.selectedId is None;assert out.status=='unavailable'
 assert any(e['error']=='unsafe_or_unknown_selection' for e in out.errors)
 assert out.intent.recipient==row['structuredInput']['recipient']
 assert any(e['tool']=='sign_and_send' for e in out.errors)

@pytest.mark.asyncio
async def test_agent_tool_budget(tmp_path):
 row=ROWS[0];model=ScriptModel([{'role':'assistant','tool_calls':[{'function':{'name':'discover','arguments':{'provider':'lifi'}}}]*13}])
 ctl=Controller(Settings(trace_dir=str(tmp_path)),FixtureTools(row['fixture']),model)
 out=await ctl.plan(Intent.model_validate(row['structuredInput']),[Wallet.model_validate(w) for w in row['wallets']],'single-agent')
 assert out.status=='unavailable';assert any('budget' in e.get('message','') for e in out.errors)

@pytest.mark.asyncio
async def test_interpreter_missing_identity_is_clarification(tmp_path):
 model=ScriptModel([{'role':'assistant','content':json.dumps({'status':'clarification','clarification':'Which USDC contract and recipient?'})}])
 ctl=Controller(Settings(trace_dir=str(tmp_path)),FixtureTools({'providers':[]}),model)
 out=await ctl.chat(ChatRequest(message='Send USDC to Base'))
 assert out.status=='clarification';assert not out.candidates

@pytest.mark.asyncio
async def test_successful_two_role_contract_with_scripted_model(tmp_path):
 row=ROWS[0]
 model=ScriptModel([{'role':'assistant','content':json.dumps({'status':'intent','sourceChain':'BaseSepolia','destinationChain':'ArbitrumSepolia','sourceKind':'native','destinationKind':'native','amount':'0.1','recipient':row['structuredInput']['recipient']})},call('quote',{'provider':'lifi'}),call('check_balances',{}),call('finish',{'selectedId':'lifi-cheap'})])
 ctl=Controller(Settings(trace_dir=str(tmp_path)),FixtureTools(row['fixture']),model,clock=lambda:datetime.fromisoformat(row['fixture']['referenceTime']))
 out=await ctl.chat(ChatRequest(message=row['utterance'],wallets=[Wallet.model_validate(w) for w in row['wallets']]))
 assert out.status=='ready';assert out.selectedId=='lifi-cheap'


def test_real_saved_paraspell_response_normalization():
 saved=json.loads((ROOT/'sdk-live-demo/paraspell-result.json').read_text())
 intent=Intent.model_validate(ROWS[1]['structuredInput'])
 info=saved['steps']['transferInfo'];info['destination']['receivedCurrency']['receivedAmount']=saved['steps']['transferInfo']['receivedAmountBaseUnits']
 c=normalize_paraspell({'info':info,'dryRun':saved['steps']['dryRun']},intent)
 assert c.expectedOutput.amount=='0.9996831873'
 assert [f.amount.amount for f in c.fees]==['0.0315345638','0.0003168127']
 assert c.totalUserCostUsd is None and not c.feeComplete


def test_lifi_normalizer_rejects_changed_amount_and_decimals():
 i=Intent.model_validate(ROWS[0]['structuredInput'])
 def token(chain):return {'chainId':chain,'address':'0x'+'0'*40,'symbol':'ETH','decimals':18}
 raw={'id':'x','action':{'fromToken':token(84532),'toToken':token(421614),'fromAmount':'100000000000000000','fromChainId':84532},'estimate':{'toAmount':'99000000000000000','toAmountMin':'98000000000000000','feeCosts':[],'gasCosts':[]}}
 c=normalize_lifi(raw,i);assert c.expectedOutput.amount=='0.099';assert c.minimumOutput.amount=='0.098'
 raw['action']['fromAmount']='200000000000000000'
 with pytest.raises(ValueError,match='amount'):normalize_lifi(raw,i)
 raw['action']['fromAmount']='100000000000000000';raw['action']['toToken']['decimals']=6
 with pytest.raises(ValueError,match='identity or decimals'):normalize_lifi(raw,i)


def test_api_validation_and_no_execution_endpoint(monkeypatch,tmp_path):
 from router import api
 monkeypatch.setattr(api.settings,'tool_mode','fixture');monkeypatch.setattr(api.settings,'trace_dir',str(tmp_path))
 client=TestClient(api.app)
 assert client.get('/api/health').json()['executionEnabled'] is False
 assert client.post('/api/sign',json={}).status_code==404
 assert client.post('/api/plan',json={'intent':{}}).status_code==422
 assert client.post('/api/chat',json={'message':'test'},headers={'Origin':'https://evil.example'}).status_code==403
 assert client.post('/api/plan',json={'intent':ROWS[0]['structuredInput'],'wallets':ROWS[0]['wallets']}).json()['status']=='ready'

@pytest.mark.parametrize('source,dest,kind',[('Base Sepolia','ArbitrumSepolia','native'),('AssetHubPaseo','PeoplePaseo','substrate')])
def test_flat_extraction_preserves_canonical_chain_and_asset(source,dest,kind):
 from router.extraction import Extraction
 address=ROWS[1]['wallets'][0]['address'] if kind=='substrate' else ROWS[0]['wallets'][0]['address']
 result=Extraction(status='intent',sourceChain=source,destinationChain=dest,sourceKind='native',destinationKind='native',amount='1',recipient=address,maximumFeeUsd='0.20').interpretation('original request')
 assert result.intent.sourceAsset.kind==kind
 assert result.intent.naturalLanguage=='original request'
 assert result.intent.constraints.maximumFeeUsd=='0.20'

def test_flat_extraction_does_not_invent_contract_or_missing_recipient():
 from router.extraction import Extraction
 out=Extraction(status='intent',sourceChain='Arbitrum',destinationChain='Base',sourceKind='erc20',destinationKind='erc20',amount='1').interpretation('Send USDC')
 assert out.intent is None
 assert 'token contract' in out.clarification and 'recipient' in out.clarification

def test_flat_extraction_keeps_model_refusal_distinct():
 from router.extraction import Extraction
 out=Extraction(status='clarification',clarification='Which destination?').interpretation('Send PAS')
 assert out.clarification=='Which destination?'

def test_wormhole_millisecond_eta_and_exact_quote_identity():
 from router.tools import normalize_wormhole
 i=Intent.model_validate(ROWS[17]['structuredInput'])
 q={'sourceToken':{'chain':'BaseSepolia','address':'native'},'outputToken':{'chain':'ArbitrumSepolia','address':i.destinationAsset.address},'sourceBaseUnits':'100000000000000000','sourceDecimals':18,'outputBaseUnits':'100000000000000000','outputDecimals':18,'route':'ManualTokenBridge','eta':1024005}
 c=normalize_wormhole({'quotes':[q]},i)[0]
 assert c.estimatedDurationSeconds==1025 and c.raw['eta']==1024005
 assert c.totalUserCostUsd is None and not c.feeComplete
 q['outputToken']['address']='0x2222222222222222222222222222222222222222'
 with pytest.raises(ValueError,match='token identity'):normalize_wormhole({'quotes':[q]},i)

@pytest.mark.asyncio
async def test_single_agent_extraction_tool_uses_same_flat_contract(tmp_path):
 row=ROWS[0]
 model=ScriptModel([call('interpret_intent',{'status':'intent','sourceChain':'BaseSepolia','destinationChain':'ArbitrumSepolia','sourceKind':'native','destinationKind':'native','amount':'0.1','recipient':row['structuredInput']['recipient']}),call('quote',{'provider':'lifi'}),call('check_balances',{}),call('finish',{'selectedId':'lifi-cheap'})])
 ctl=Controller(Settings(trace_dir=str(tmp_path)),FixtureTools(row['fixture']),model,clock=lambda:datetime.fromisoformat(row['fixture']['referenceTime']))
 out=await ctl.chat(ChatRequest(message=row['utterance'],wallets=[Wallet.model_validate(w) for w in row['wallets']],mode='single-agent'))
 assert out.status=='ready'
 assert out.intent.amount=='0.1'
