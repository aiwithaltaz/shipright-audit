import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workspace</title>
<style>body { font-family: Arial, sans-serif; margin: 24px; } nav a { margin-right: 12px; } label { display: block; margin: 8px 0; }</style></head>
<body>
<main id="app"><p>Loading</p></main>
<script>
  const app = document.getElementById('app');
  const signIn = () => { app.innerHTML = '<h1>Sign in</h1><form><label>Email <input type="email"></label><label>Password <input type="password"></label><button type="button">Sign in</button></form>'; };
  const home = () => {
    const nav = '<nav><a href="/">Home</a><a href="/projects">Projects</a><a href="/settings">Settings</a></nav>';
    const path = location.pathname;
    if (path === '/projects') app.innerHTML = nav + '<h1>Projects</h1><ul><li><a href="/projects/garden">Garden plan</a></li><li><a href="/projects/budget">Budget 2026</a></li><li><a href="/projects/trip">Trip notes</a></li></ul>';
    else if (path.startsWith('/projects/')) app.innerHTML = nav + '<h1>' + path.split('/').pop() + '</h1><p>Last edited on Monday. Two people can see this project.</p>';
    else if (path === '/settings') app.innerHTML = nav + '<h1>Settings</h1><p>Language: English</p>';
    else app.innerHTML = nav + '<h1>Home</h1><p>Welcome back. 3 projects.</p>';
  };
  async function start() {
    const r = await fetch('/api/auth/refresh', { method: 'POST' });
    if (r.ok) return home();
    signIn();
    if (location.search.includes('auto')) setTimeout(async () => { await fetch('/api/auth/login', { method: 'POST' }); history.replaceState(null, '', '/'); home(); }, 1000);
  }
  start();
</script>
</body>
</html>`;

export function startRotatingApp({ refuseHeadless = false, refreshDelay = 0 } = {}) {
  let valid = null;
  const stats = { refresh_ok: 0, refresh_401: 0, refresh_lost: 0, logins: 0 };
  const issue = res => {
    valid = randomBytes(12).toString('hex');
    res.setHeader('set-cookie', `rt=${valid}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`);
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const sent = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('rt='))?.slice(3) || null;
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      stats.logins++; issue(res); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}');
    }
    if (url.pathname === '/api/auth/refresh' && req.method === 'POST') {
      const headless = refuseHeadless && /headless/i.test(req.headers['user-agent'] || '');
      if (sent && sent === valid && !headless) {
        stats.refresh_ok++; issue(res);
        const answer = () => { if (res.destroyed || req.destroyed) { stats.refresh_lost++; return; } res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); };
        return refreshDelay ? setTimeout(answer, refreshDelay) : answer();
      }
      stats.refresh_401++; res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"token expired"}');
    }
    if (url.pathname.startsWith('/api/') || /\.\w+$/.test(url.pathname)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ server, stats, url: `http://127.0.0.1:${server.address().port}/`, expire: () => { valid = null; }, stop: () => server.close() })));
}
