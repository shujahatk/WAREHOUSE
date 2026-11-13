import { readFileSync } from 'node:fs';

const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const testLogins = [
  ['owner@example.com', 'owner-pass-1'],
  ['admin@stockflow.local', 'Admin123!'],
  ['manager@stockflow.local', 'Manager123!'],
  ['worker.bornem@stockflow.local', 'Worker123!'],
];

async function main() {
  for (const [email, password] of testLogins) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    console.log(`SignIn ${email}: ${res.status}`, data.error_description || data.msg || (data.access_token ? 'SUCCESS' : data));
  }
}

main().catch(console.error);

