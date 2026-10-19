import time
import httpx
from .config import Settings

class Ollama:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def chat(self, messages, trace, role, tools=None, schema=None):
        body = {'model': self.settings.model, 'messages': messages, 'stream': False,
                'think': False, 'keep_alive': '10m',
                'options': {'temperature': 0, 'seed': self.settings.seed,
                            'num_ctx': self.settings.context, 'num_predict': 2048}}
        if tools:
            body['tools'] = tools
        if schema:
            body['format'] = schema
        started = time.perf_counter()
        trace.add('model_request', role=role, payload=body)
        try:
            async with httpx.AsyncClient(trust_env=False, timeout=180) as client:
                response = await client.post(self.settings.ollama_url + '/api/chat', json=body)
                response.raise_for_status()
                result = response.json()
            message = result['message']
            trace.add('model_response', role=role, latencySeconds=time.perf_counter()-started,
                      response=result)
            return message
        except Exception as error:
            trace.add('model_error', role=role, error=type(error).__name__, detail=str(error))
            raise
