// Local dev server — runs index.html + /api/* without Vercel login
// Usage: node server.js   (reads ANTHROPIC_API_KEY from .env.local)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env and .env.local
for (const name of ['.env', '.env.local']) {
  try {
    const env = fs.readFileSync(path.join(__dirname, name), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
      if (m) process.env[m[1].toUpperCase()] = m[2].trim();
    }
  } catch {}
}

const PORT = 3000;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };

// Dynamically import API handlers (ESM)
async function getHandler(name) {
  const mod = await import(`./api/${name}.js?t=${Date.now()}`);
  return mod.default;
}

function mockRes(raw) {
  const headers = {};
  let statusCode = 200;
  const chunks = [];
  return {
    status(code) { statusCode = code; return this; },
    setHeader(k, v) { headers[k] = v; },
    json(obj) { this.end(JSON.stringify(obj)); },
    end(body = '') {
      raw.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
      raw.end(typeof body === 'string' ? body : JSON.stringify(body));
    },
  };
}

async function parseBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API routes
  const apiMatch = url.pathname.match(/^\/api\/([a-z-]+)$/);
  if (apiMatch) {
    try {
      const handler = await getHandler(apiMatch[1]);
      const body = req.method === 'POST' ? await parseBody(req) : {};
      const mockReq = { method: req.method, query: Object.fromEntries(url.searchParams), body, headers: req.headers };
      await handler(mockReq, mockRes(res));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // Static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  사케 다이어리 로컬 서버 가동 중`);
  console.log(`  http://localhost:${PORT}\n`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('  ⚠️  GEMINI_API_KEY가 .env.local에 없어요. AI 검색이 작동하지 않습니다.\n');
  } else {
    console.log('  ✓ GEMINI_API_KEY 로드됨\n');
  }
});
