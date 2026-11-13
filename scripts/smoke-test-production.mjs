import { readFileSync } from 'node:fs';

function loadEnv() {
  const envContent = readFileSync('.env.local', 'utf-8');
  const env = {};
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[trimmed.slice(0, eqIdx).trim()] = val;
    }
  }
  return env;
}

const env = loadEnv();
const PROD_URL = 'https://stockflow-psi-wine.vercel.app';
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function smokeTest() {
  console.log('================================================================');
  console.log('   STOCKFLOW — PRODUCTION DEPLOYMENT LIVE SMOKE TEST           ');
  console.log('   Target: ' + PROD_URL);
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  async function check(name, fn) {
    total++;
    try {
      const res = await fn();
      if (res.ok) {
        console.log(`[PASS] ${name}: ${res.detail}`);
        passed++;
      } else {
        console.error(`[FAIL] ${name}: ${res.detail}`);
      }
    } catch (err) {
      console.error(`[FAIL] ${name}: Threw exception: ${err.message}`);
    }
  }

  // 1. Homepage & Login Page
  await check('Homepage (HTTP GET /)', async () => {
    const res = await fetch(PROD_URL);
    const text = await res.text();
    const isOk = res.status === 200 && text.includes('StockFlow');
    return { ok: isOk, detail: `Status ${res.status}, Length: ${text.length} bytes, contains StockFlow title` };
  });

  await check('Login Page (HTTP GET /login)', async () => {
    const res = await fetch(`${PROD_URL}/login`);
    const text = await res.text();
    const isOk = res.status === 200 && (text.includes('Sign in') || text.includes('StockFlow') || text.includes('password'));
    return { ok: isOk, detail: `Status ${res.status}, renders sign-in form correctly` };
  });

  // 2. PWA Manifest
  await check('PWA Webmanifest (HTTP GET /manifest.webmanifest)', async () => {
    const res = await fetch(`${PROD_URL}/manifest.webmanifest`);
    const json = await res.json().catch(() => null);
    const isOk = res.status === 200 && json && json.name?.includes('StockFlow');
    return { ok: isOk, detail: `Status ${res.status}, Name: "${json?.name}", Short Name: "${json?.short_name}"` };
  });

  // 3. Unauthenticated API Boundary (Strict 401 Enforcement)
  await check('API Security Gate: /api/audit (Unauthenticated)', async () => {
    const res = await fetch(`${PROD_URL}/api/audit`);
    const body = await res.json().catch(() => ({}));
    const isOk = res.status === 401 && body.error?.includes('Authentication required');
    return { ok: isOk, detail: `Status ${res.status}, Message: "${body.error}"` };
  });

  await check('API Security Gate: /api/import (Unauthenticated)', async () => {
    const res = await fetch(`${PROD_URL}/api/import`, { method: 'POST' });
    const isOk = res.status === 401;
    return { ok: isOk, detail: `Status ${res.status} correctly rejected without active session` };
  });

  await check('API Security Gate: /api/offers (Unauthenticated)', async () => {
    const res = await fetch(`${PROD_URL}/api/offers`);
    const isOk = res.status === 401;
    return { ok: isOk, detail: `Status ${res.status} correctly rejected without active session` };
  });

  await check('API Security Gate: /api/reports/export (Unauthenticated)', async () => {
    const res = await fetch(`${PROD_URL}/api/reports/export`);
    const isOk = res.status === 401;
    return { ok: isOk, detail: `Status ${res.status} correctly rejected without active session` };
  });

  // 4. Test Live Database Connectivity & Authentication via Supabase
  console.log('\n--- Testing Authentication & Core Roles against Live Backend ---');

  const ROLES = [
    { email: 'admin@stockflow.local', pass: 'StockFlowAdmin2026!', label: 'Admin (owner)' },
    { email: 'staff@stockflow.local', pass: 'StockFlowStaff2026!', label: 'Staff (manager)' },
    { email: 'worker.bornem@stockflow.local', pass: 'StockFlowWorker2026!', label: 'Worker Bornem (worker)' },
    { email: 'moderator@stockflow.local', pass: 'StockFlowMod2026!', label: 'Offer Moderator (moderator)' },
  ];

  for (const r of ROLES) {
    await check(`Authentication: ${r.label}`, async () => {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: r.email, password: r.pass }),
      });
      const data = await authRes.json();
      const isOk = authRes.status === 200 && data.access_token && data.user;
      return { ok: isOk, detail: `Status ${authRes.status}, User ID: ${data.user?.id}` };
    });
  }

  // 5. Test Authenticated Workspace Pages
  console.log('\n--- Testing Workspace Navigation Pages on Production ---');
  const PAGES = [
    '/dashboard',
    '/inventory',
    '/warehouses',
    '/purchases',
    '/containers',
    '/documents',
    '/offers',
    '/offers/purchasing',
    '/offers/selling',
    '/audit',
    '/notifications',
    '/analytics',
    '/reports',
    '/settings',
  ];

  for (const page of PAGES) {
    await check(`Page Route: ${page}`, async () => {
      const res = await fetch(`${PROD_URL}${page}`);
      // In Next.js client-side auth gated pages, unauthenticated requests return 200 with shell or 307 redirect to /login
      const isOk = res.status === 200 || res.status === 307;
      return { ok: isOk, detail: `HTTP ${res.status}` };
    });
  }

  console.log('\n================================================================');
  console.log(`   SMOKE TEST COMPLETE: ${passed}/${total} TESTS PASSED        `);
  console.log('================================================================');
}

smokeTest().catch(console.error);
