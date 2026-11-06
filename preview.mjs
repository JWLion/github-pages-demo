import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3002);
const assets = new Map([
  ['/index.html', 'text/html; charset=utf-8'],
  ['/styles.css', 'text/css; charset=utf-8'],
  ['/app.js', 'text/javascript; charset=utf-8'],
  ['/config.js', 'text/javascript; charset=utf-8'],
  ['/sample_plan.js', 'text/javascript; charset=utf-8'],
  ['/lesson_template.js', 'text/javascript; charset=utf-8'],
  ['/context_stage.js', 'text/javascript; charset=utf-8'],
  ['/proposal_stage.js', 'text/javascript; charset=utf-8']
]);

http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const name = pathname === '/' ? '/index.html' : pathname;
  const type = assets.get(name);
  if (!['GET', 'HEAD'].includes(request.method) || !type) {
    response.writeHead(404, { 'content-type':'text/plain; charset=utf-8' });
    response.end('찾을 수 없습니다.');
    return;
  }
  try {
    const bytes = await readFile(path.join(root, name.slice(1)));
    response.writeHead(200, { 'content-type':type, 'cache-control':'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(500, { 'content-type':'text/plain; charset=utf-8' });
    response.end('파일을 읽지 못했습니다.');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`수업연구실 체험판: http://127.0.0.1:${port}/`);
  console.log('종료하려면 이 창에서 Ctrl+C를 누르세요.');
});
