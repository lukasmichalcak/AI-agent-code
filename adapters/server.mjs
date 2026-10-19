import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateRequest } from './chains.mjs';
const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));
let active = 0;
const reply = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const server = createServer(async (req, res) => {
  // Not a browser API: no CORS, and requests with browser Origin are rejected.
  if (req.headers.origin) return reply(res, 403, { error: 'Backend-only adapter endpoint' });
  if (req.url === '/health' && req.method === 'GET') return reply(res, 200, { status: 'ok', readOnly: true, versions: { paraspell: '14.4.0', wormhole: '6.1.5' } });
  if (req.method !== 'POST' || req.url !== '/call') return reply(res, 404, { error: 'Not found' });
  if (active >= 4) return reply(res, 429, { error: 'Adapter concurrency budget exceeded' });
  let body = '';
  try {
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 65536) return reply(res, 413, { error: 'Body too large' }); }
    const data = JSON.parse(body); validateRequest(data);
    active++;
    const child = spawn(process.execPath, [worker, JSON.stringify(data)], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let output = '', settled = false;
    const finish = (status, value) => { if (settled) return; settled = true; clearTimeout(timer); active--; child.kill('SIGKILL'); if (!res.destroyed) reply(res, status, value); };
    const timer = setTimeout(() => finish(504, { error: 'SDK timeout; worker terminated' }), Number(process.env.ADAPTER_TIMEOUT_MS ?? 45000));
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 2000000) finish(502, { error: 'Response budget exceeded' }); });
    child.stderr.on('data', () => {}); // SDK log chatter never contaminates the JSON response.
    child.on('error', () => finish(502, { error: 'Could not launch SDK worker' }));
    child.on('exit', () => { try { const value = JSON.parse(output); finish(value.ok ? 200 : 502, value); } catch { finish(502, { error: 'Invalid SDK worker response' }); } });
    res.on('close', () => { if (!res.writableEnded) finish(499, { error: 'Caller disconnected' }); });
  } catch(error) { reply(res, 400, { error: String(error.message) }); }
});
server.listen(Number(process.env.ADAPTER_PORT ?? 8787), '127.0.0.1', () => console.log('Read-only SDK adapters: http://127.0.0.1:8787'));
