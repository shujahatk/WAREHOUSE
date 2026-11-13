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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function authenticate(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Auth failed for ${email}`);
  const data = await res.json();
  return data.access_token;
}

async function testBucket() {
  console.log('Testing Storage bucket creation via Admin...');
  const adminToken = await authenticate('admin@stockflow.local', 'StockFlowAdmin2026!');

  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'stockflow-files',
      name: 'stockflow-files',
      public: false,
      file_size_limit: 10485760, // 10MB
      allowed_mime_types: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
      ],
    }),
  });

  console.log('Create bucket status:', res.status);
  const body = await res.text();
  console.log('Body:', body);
}

testBucket().catch(console.error);
