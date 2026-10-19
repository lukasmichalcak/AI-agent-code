import asyncio
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from .config import Settings
from .domain import PlanRequest, ChatRequest
from .tools import LiveTools, FixtureTools, asdict
from .controller import Controller
from .model import Ollama

settings=Settings()
app=FastAPI(title='Thesis read-only interoperability router',version='0.1.0')
app.add_middleware(CORSMiddleware,allow_origins=['http://127.0.0.1:5173','http://localhost:5173'],allow_methods=['GET','POST'],allow_headers=['Content-Type'])
budget=asyncio.Semaphore(2)

def controller():
    if settings.tool_mode=='fixture':
        path=Path(__file__).resolve().parents[2]/'evaluation/demo-fixture.json'
        fixture=json.loads(path.read_text())
        # Demo snapshots are refreshed only in explicitly synthetic UI mode.
        from .domain import now
        for c in fixture['candidates']: c['quotedAt']=now();c.pop('expiresAt',None)
        tools=FixtureTools(fixture)
    elif settings.tool_mode=='live': tools=LiveTools(settings)
    else: raise ValueError('TOOL_MODE must be live or fixture')
    return Controller(settings,tools,Ollama(settings))

@app.middleware('http')
async def local_boundary(request: Request,call_next):
    host=request.headers.get('host','').split(':')[0]
    if host not in ['127.0.0.1','localhost','testserver']:
        return __import__('starlette.responses',fromlist=['JSONResponse']).JSONResponse({'detail':'Local host required'},status_code=403)
    origin=request.headers.get('origin')
    if request.method=='POST' and origin and origin not in ['http://127.0.0.1:5173','http://localhost:5173']:
        return __import__('starlette.responses',fromlist=['JSONResponse']).JSONResponse({'detail':'Unapproved browser origin'},status_code=403)
    if int(request.headers.get('content-length','0'))>100000:
        return __import__('starlette.responses',fromlist=['JSONResponse']).JSONResponse({'detail':'Request too large'},status_code=413)
    return await call_next(request)

@app.get('/api/health')
async def health():
    return {'status':'ok','readOnly':True,'toolMode':settings.tool_mode,'model':settings.model,'executionEnabled':False}

@app.post('/api/plan')
async def plan(request: PlanRequest, http_request: Request):
    async with budget:
        result=await cancellable(controller().plan(request.intent,request.wallets,request.mode),http_request)
        return asdict(result)

@app.post('/api/chat')
async def chat(request: ChatRequest, http_request: Request):
    async with budget:
        return asdict(await cancellable(controller().chat(request),http_request))

async def cancellable(coroutine,request):
    task=asyncio.create_task(coroutine)
    try:
        while not task.done():
            await asyncio.sleep(.2)
            if await request.is_disconnected():
                task.cancel()
                raise HTTPException(499,'Client disconnected; planning cancelled')
        return await task
    finally:
        if not task.done():
            task.cancel()
            try: await task
            except asyncio.CancelledError: pass
