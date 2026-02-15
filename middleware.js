const COOKIE_NAME = 'pp_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

async function hashToken(password) {
  const data = new TextEncoder().encode('pool-and-paddle:' + password);
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
    button{
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
    button:hover{background:#238C62}
    button:active{transform:scale(0.98)}
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
    <p class="subtitle">Enter password to continue</p>
    <form method="POST" action="/login">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Enter your password" required autofocus>
      <p class="error">Incorrect password. Please try again.</p>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const password = process.env.SITE_PASSWORD;

  // No password configured — allow everything through (local dev / misconfigured)
  if (!password) return;

  // ── Logout ──────────────────────────────────────────────
  if (url.pathname === '/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/login',
        'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  // ── Login page ──────────────────────────────────────────
  if (url.pathname === '/login') {
    if (request.method === 'POST') {
      const body = await request.formData();
      const submitted = body.get('password');

      if (submitted === password) {
        const token = await hashToken(password);
        return new Response(null, {
          status: 302,
          headers: {
            Location: '/',
            'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          },
        });
      }

      // Wrong password
      return new Response(loginPage(true), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // GET /login — if already authenticated, redirect home
    const existing = getCookie(request, COOKIE_NAME);
    if (existing) {
      const expected = await hashToken(password);
      if (existing === expected) {
        return new Response(null, {
          status: 302,
          headers: { Location: '/' },
        });
      }
    }

    return new Response(loginPage(false), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── Auth check for all other routes ─────────────────────
  const token = getCookie(request, COOKIE_NAME);
  if (token) {
    const expected = await hashToken(password);
    if (token === expected) return; // authenticated — continue to origin
  }

  // Not authenticated — redirect to login
  return new Response(null, {
    status: 302,
    headers: { Location: '/login' },
  });
}

export const config = {
  matcher: ['/((?!_vercel).*)'],
};
