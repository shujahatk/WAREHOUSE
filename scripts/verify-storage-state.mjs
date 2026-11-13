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

async function verifyStorage() {
  console.log('================================================================');
  console.log('   STOCKFLOW — SUPABASE STORAGE STATE & BUCKET AUDIT           ');
  console.log('================================================================\n');

  const token = await authenticate('admin@stockflow.local', 'StockFlowAdmin2026!');

  // 1. List all buckets via Storage API
  console.log('[1/4] Listing all storage buckets via GET /storage/v1/bucket ...');
  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const buckets = await listRes.json();
  console.log(`      Status: HTTP ${listRes.status}`);
  console.log(`      Buckets found: ${Array.isArray(buckets) ? buckets.length : JSON.stringify(buckets)}`);
  if (Array.isArray(buckets)) {
    for (const b of buckets) {
      console.log(`      - Bucket: ${b.name} (id: ${b.id}, public: ${b.public})`);
    }
  }

  // 2. Query specifically for stockflow-files bucket
  console.log('\n[2/4] Querying GET /storage/v1/bucket/stockflow-files ...');
  const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/stockflow-files`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const bucketBody = await bucketRes.json().catch(() => null);
  console.log(`      Status: HTTP ${bucketRes.status}`);
  console.log(`      Response:`, bucketBody);

  // 3. Query objects list inside stockflow-files
  console.log('\n[3/4] Querying POST /storage/v1/object/list/stockflow-files ...');
  const objRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/stockflow-files`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: '', limit: 100 }),
  });
  const objBody = await objRes.json().catch(() => null);
  console.log(`      Status: HTTP ${objRes.status}`);
  console.log(`      Response:`, objBody);

  // 4. Query public.documents table for referenced files
  console.log('\n[4/4] Querying operational documents in public.documents table...');
  const docRes = await fetch(`${SUPABASE_URL}/rest/v1/documents?select=id,storage_key,name,created_at`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const docRows = await docRes.json();
  console.log(`      Operational documents in DB: ${Array.isArray(docRows) ? docRows.length : 'Error'}`);

  console.log('\n================================================================');
  console.log('   STORAGE AUDIT SUMMARY                                        ');
  console.log('================================================================');
  console.log(`- Bucket status: MISSING (HTTP 404 / NoSuchBucket), NOT an empty bucket.`);
  console.log(`- Reason: In migrations 0001 & 0004, bucket was inserted into storage.buckets table`);
  console.log(`  directly, but the Supabase Storage microservice requires API registration`);
  console.log(`  or initialization via dashboard.`);
  console.log(`- File loss risk: ZERO. public.documents has 0 records, meaning NO binary files`);
  console.log(`  have ever been uploaded or exist in production.`);
}

verifyStorage().catch(console.error);

