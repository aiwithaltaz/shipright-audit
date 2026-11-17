import { createServer } from 'node:http';

const shell = (title, body) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body { font-family: Arial, sans-serif; margin: 24px; } nav a { margin-right: 12px; } label { display: block; margin: 8px 0; }</style></head>
<body>${body}</body>
</html>`;
const appNav = '<nav aria-label="App"><a href="/app">Home</a><a href="/app/projects">Projects</a><a href="/app/settings">Settings</a></nav>';
const PAGES = {
  '/': shell('Weekplan', '<nav><a href="/pricing">Pricing</a><a href="/login">Sign in</a></nav><h1>Plan your week in ten minutes</h1><p>A calm planner for small teams.</p>'),
  '/pricing': shell('Pricing', '<nav><a href="/">Weekplan</a><a href="/login">Sign in</a></nav><h1>Pricing</h1><p>Free for teams of three. 8 dollars a seat after that.</p>'),
  '/login': shell('Sign in', `<h1>Sign in</h1><form><label>Email <input type="email"></label><label>Password <input type="password"></label><button type="button">Continue</button></form>
<script>if (location.search.includes('auto')) setTimeout(() => { document.cookie = 'sr_in=1; path=/; max-age=3600'; location.href = '/app'; }, 1000);</script>`),
  '/app': shell('Home', appNav + '<h1>This week</h1><p>3 projects, 12 tasks due.</p>'),
  '/app/projects': shell('Projects', appNav + '<h1>Projects</h1><ul><li>Garden plan</li><li>Budget review</li><li>Trip notes</li></ul>'),
  '/app/settings': shell('Settings', appNav + '<h1>Settings</h1><p>Language: English</p>'),
};

export function startLandingApp() {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/';
    const signedIn = /(^|;\s*)sr_in=1/.test(req.headers.cookie || '');
    if (path.startsWith('/app') && !signedIn) { res.writeHead(302, { location: '/login' }); return res.end(); }
    if (!PAGES[path]) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGES[path]);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}/`, stop: () => server.close() })));
}
