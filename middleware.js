const SESSION_COOKIE = 'pp_session';
const USER_COOKIE = 'pp_user';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

const USERS = {
  JM: { label: 'Josh', envVar: 'JM_PASSWORD' },
  KM: { label: 'Kerry', envVar: 'KM_PASSWORD' },
};

async function hashToken(username, password) {
  const data = new TextEncoder().encode('pool-and-paddle:' + username + ':' + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + '='));
  return match ? match.substring(name.length + 1) : null;
}

function getPasswordForUser(username) {
  const user = USERS[username];
  if (!user) return null;
  return process.env[user.envVar] || null;
}

async function validateSession(request) {
  const session = getCookie(request, SESSION_COOKIE);
  if (!session) return null;

  const sep = session.indexOf(':');
  if (sep === -1) return null;

  const username = session.substring(0, sep);
  const token = session.substring(sep + 1);
  const password = getPasswordForUser(username);
  if (!password) return null;

  const expected = await hashToken(username, password);
  return token === expected ? username : null;
}

function loginPage(error = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Pool & Paddle</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏊</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;800&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;
      background:#F5F8F6;
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
    }
    .card{
      background:#fff;
      border:1px solid #E2E8E5;
      border-radius:16px;
      padding:48px 40px;
      max-width:400px;
      width:100%;
      text-align:center;
      box-shadow:0 4px 24px rgba(0,0,0,0.06);
    }
    .logo{margin-bottom:8px}
    .logo svg{width:120px;height:auto}
    .subtitle{
      font-size:14px;
      color:#999;
      font-weight:500;
      margin-bottom:32px;
      letter-spacing:0.5px;
    }
    form{text-align:left}
    label{
      display:block;
      font-size:13px;
      font-weight:600;
      color:#333;
      margin-bottom:8px;
    }
    .user-toggle{
      display:flex;
      gap:8px;
      margin-bottom:20px;
    }
    .user-btn{
      flex:1;
      padding:12px;
      border:1.5px solid #E2E8E5;
      border-radius:10px;
      background:#F7FAF8;
      font-family:inherit;
      font-size:14px;
      font-weight:600;
      color:#666;
      cursor:pointer;
      transition:all 0.2s;
      text-align:center;
    }
    .user-btn:hover{
      border-color:#2EAF7B;
      color:#2EAF7B;
    }
    .user-btn.active{
      border-color:#2EAF7B;
      background:#EDF9F3;
      color:#2EAF7B;
    }
    input[type="password"]{
      width:100%;
      padding:12px 16px;
      border:1.5px solid ${error ? '#D94444' : '#E2E8E5'};
      border-radius:10px;
      font-size:15px;
      font-family:inherit;
      outline:none;
      transition:border-color 0.2s, box-shadow 0.2s;
      background:#F7FAF8;
      color:#333;
    }
    input[type="password"]:focus{
      border-color:#2EAF7B;
      box-shadow:0 0 0 3px rgba(46,175,123,0.1);
    }
    .error{
      color:#D94444;
      font-size:13px;
      font-weight:500;
      margin-top:8px;
      ${error ? '' : 'display:none;'}
    }
    button[type="submit"]{
      width:100%;
      margin-top:20px;
      padding:13px;
      background:#2EAF7B;
      color:#fff;
      border:none;
      border-radius:10px;
      font-size:15px;
      font-weight:600;
      font-family:inherit;
      cursor:pointer;
      transition:background 0.2s;
      letter-spacing:0.3px;
    }
    button[type="submit"]:hover{background:#238C62}
    button[type="submit"]:active{transform:scale(0.98)}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="220" height="200" viewBox="0 0 220 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(82,68) rotate(-35)">
          <rect x="-22" y="-44" width="44" height="52" rx="18" fill="#333"/>
          <circle cx="-8" cy="-32" r="2.3" fill="#F5F8F6"/><circle cx="6" cy="-32" r="2.3" fill="#F5F8F6"/>
          <circle cx="-12" cy="-20" r="2.3" fill="#F5F8F6"/><circle cx="0" cy="-20" r="2.3" fill="#F5F8F6"/><circle cx="12" cy="-20" r="2.3" fill="#F5F8F6"/>
          <circle cx="-8" cy="-8" r="2.3" fill="#F5F8F6"/><circle cx="6" cy="-8" r="2.3" fill="#F5F8F6"/>
          <rect x="-5" y="8" width="10" height="28" rx="3.5" fill="#333"/>
          <rect x="-6" y="30" width="12" height="7" rx="2" fill="#2EAF7B"/>
        </g>
        <g transform="translate(138,68) rotate(35)">
          <rect x="-22" y="-44" width="44" height="52" rx="18" fill="#333"/>
          <circle cx="-8" cy="-32" r="2.3" fill="#F5F8F6"/><circle cx="6" cy="-32" r="2.3" fill="#F5F8F6"/>
          <circle cx="-12" cy="-20" r="2.3" fill="#F5F8F6"/><circle cx="0" cy="-20" r="2.3" fill="#F5F8F6"/><circle cx="12" cy="-20" r="2.3" fill="#F5F8F6"/>
          <circle cx="-8" cy="-8" r="2.3" fill="#F5F8F6"/><circle cx="6" cy="-8" r="2.3" fill="#F5F8F6"/>
          <rect x="-5" y="8" width="10" height="28" rx="3.5" fill="#333"/>
          <rect x="-6" y="30" width="12" height="7" rx="2" fill="#2EAF7B"/>
        </g>
        <path d="M22 102 Q48 92 74 102 Q96 110 110 102 Q124 94 146 102 Q168 110 198 102" stroke="#93E9BE" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <path d="M18 116 Q46 107 74 116 Q96 124 114 116 Q132 108 156 116 Q174 122 202 116" stroke="#2EAF7B" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="0.7"/>
        <path d="M28 129 Q52 122 76 129 Q94 134 110 129 Q128 122 150 129 Q164 134 186 129" stroke="#93E9BE" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.4"/>
        <text x="110" y="166" text-anchor="middle" font-family="'Plus Jakarta Sans',sans-serif" font-weight="800" font-size="22" fill="#333" letter-spacing="-0.5">POOL &amp; PADDLE</text>
        <text x="110" y="186" text-anchor="middle" font-family="'Plus Jakarta Sans',sans-serif" font-weight="600" font-size="10.5" fill="#2EAF7B" letter-spacing="4">BEACH SIDE</text>
      </svg>
    </div>
    <p class="subtitle">Sign in to continue</p>
    <form method="POST" action="/admin/login">
      <label>Who's signing in?</label>
      <div class="user-toggle">
        <button type="button" class="user-btn active" data-user="JM" onclick="selectUser(this)">Josh</button>
        <button type="button" class="user-btn" data-user="KM" onclick="selectUser(this)">Kerry</button>
      </div>
      <input type="hidden" name="user" id="userField" value="JM">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Enter your password" required autofocus>
      <p class="error">Incorrect password. Please try again.</p>
      <button type="submit">Sign In</button>
    </form>
  </div>
  <script>
    function selectUser(btn) {
      document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('userField').value = btn.dataset.user;
    }
  </script>
</body>
</html>`;
}

export default async function middleware(request) {
  const url = new URL(request.url);

  // ── Only handle /admin/* and /api/* ────────────────────────
  // Everything else (/, /coming-soon.html, /assets/*) passes through

  // ── Logout ─────────────────────────────────────────────────
  if (url.pathname === '/admin/logout') {
    return new Response(null, {
      status: 302,
      headers: new Headers([
        ['Location', '/admin/login'],
        ['Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`],
        ['Set-Cookie', `${USER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`],
      ]),
    });
  }

  // ── Login page ─────────────────────────────────────────────
  if (url.pathname === '/admin/login') {
    if (request.method === 'POST') {
      const body = await request.formData();
      const username = body.get('user');
      const submitted = body.get('password');
      const password = getPasswordForUser(username);

      if (password && submitted === password) {
        const token = await hashToken(username, password);
        return new Response(null, {
          status: 302,
          headers: new Headers([
            ['Location', '/admin'],
            ['Set-Cookie', `${SESSION_COOKIE}=${username}:${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`],
            ['Set-Cookie', `${USER_COOKIE}=${username}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`],
          ]),
        });
      }

      // Wrong password or invalid user
      return new Response(loginPage(true), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // GET /admin/login — if already authenticated, redirect to /admin
    const validUser = await validateSession(request);
    if (validUser) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/admin' },
      });
    }

    return new Response(loginPage(false), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── API protection ─────────────────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    // No passwords configured — allow through (local dev)
    if (!process.env.JM_PASSWORD && !process.env.KM_PASSWORD) return;

    const validUser = await validateSession(request);
    if (validUser) return; // authenticated

    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Admin auth check ───────────────────────────────────────
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    // No passwords configured — allow through (local dev)
    if (!process.env.JM_PASSWORD && !process.env.KM_PASSWORD) return;

    const validUser = await validateSession(request);
    if (validUser) return; // authenticated — continue to origin

    // Not authenticated — redirect to login
    return new Response(null, {
      status: 302,
      headers: { Location: '/admin/login' },
    });
  }

  // Everything else passes through (/, /coming-soon.html, etc.)
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
};
