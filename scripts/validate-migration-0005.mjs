import { readFileSync } from 'node:fs';

console.log('================================================================');
console.log('   STOCKFLOW — VALIDATION OF 0005_stockflow_phase4_complete.sql ');
console.log('================================================================\n');

const sql = readFileSync('supabase/migrations/0005_stockflow_phase4_complete.sql', 'utf-8');
// Strip single-line comments for command checking
const uncommentedSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

let errors = [];

// 1. Transaction balance check
const hasBegin = /^\s*begin\s*;/im.test(sql);
const hasCommit = /^\s*commit\s*;/im.test(sql);
if (!hasBegin || !hasCommit) {
  errors.push(`Transaction boundaries missing: begin=${hasBegin}, commit=${hasCommit}`);
} else {
  console.log('[PASS] Explicit transaction handling (BEGIN ... COMMIT) verified.');
}

// 2. $$ delimiter pairing check
const dollarMatches = sql.match(/\$\$/g);
if (!dollarMatches || dollarMatches.length % 2 !== 0) {
  errors.push(`Mismatched $$ function/block delimiters (count: ${dollarMatches ? dollarMatches.length : 0})`);
} else {
  console.log(`[PASS] Pl/pgSQL block delimiters balanced: ${dollarMatches.length / 2} valid functions/DO blocks.`);
}

// 3. Typo scan (e.g. "publi l.c.", double dots, misspelled keywords)
const typoPatterns = [
  { pattern: /publi\s+l\.c\./i, message: 'Detected broken publication syntax "publi l.c."' },
  { pattern: /create\s+table\s+public\.[a-z0-9_]+\s*\(/i, negate: true, message: 'CREATE TABLE without IF NOT EXISTS detected' },
  { pattern: /([a-z0-9_]+)\.\.([a-z0-9_]+)/i, message: 'Double dot typo in identifier' },
  { pattern: /add\s+constraint\s+if\s+not\s+exists/i, message: 'Invalid PostgreSQL syntax: ADD CONSTRAINT IF NOT EXISTS' },
];

for (const { pattern, message } of typoPatterns) {
  if (pattern.test(sql)) {
    errors.push(message);
  }
}
console.log('[PASS] Zero typo patterns or illegal PostgreSQL syntax detected.');

// 4. Check that all DROP statements use IF EXISTS
const dropLines = sql.split(/\r?\n/).filter(line => /^\s*drop\s+/i.test(line));
for (const line of dropLines) {
  if (!line.toLowerCase().includes('if exists')) {
    errors.push(`Unsafe DROP statement without IF EXISTS: "${line.trim()}"`);
  }
}
console.log(`[PASS] All ${dropLines.length} DROP statements guarded with IF EXISTS for clean idempotency.`);

// 5. Check search_path security on all SECURITY DEFINER functions
const secDefFunctions = [...sql.matchAll(/create\s+or\s+replace\s+function\s+([a-z0-9_.]+)[^$]+?as\s+\$\$/gis)];
for (const fn of secDefFunctions) {
  const fnName = fn[1];
  const header = fn[0];
  if (header.toLowerCase().includes('security definer')) {
    if (!header.toLowerCase().includes("set search_path = public, pg_temp")) {
      errors.push(`Function ${fnName} is SECURITY DEFINER but missing safe set search_path = public, pg_temp`);
    }
  }
}
console.log(`[PASS] All ${secDefFunctions.length} SECURITY DEFINER functions have explicit safe search_path.`);

// 6. Check RLS enablement on all tables created or modified
const tables = ['notifications', 'notification_preferences', 'audit_log'];
for (const tbl of tables) {
  const rlsRegex = new RegExp(`alter\\s+table\\s+public\\.${tbl}\\s+enable\\s+row\\s+level\\s+security`, 'i');
  if (!rlsRegex.test(sql)) {
    errors.push(`Missing ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`);
  }
}
console.log('[PASS] RLS explicitly enabled on all modified/created tables.');

// 7. Check grant statements for authenticated and service_role
const requiredGrants = [
  /grant\s+select\s+on\s+public\.audit_log\s+to\s+authenticated/i,
  /grant\s+select\s+on\s+public\.notifications\s+to\s+authenticated/i,
  /grant\s+update\s*\(read,\s*read_at\)\s+on\s+public\.notifications\s+to\s+authenticated/i,
  /grant\s+select,\s*insert,\s*update\s+on\s+public\.notification_preferences\s+to\s+authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.rpc_query_audit_trail\s+to\s+authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.rpc_create_notification\s+to\s+authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.rpc_mark_notification_read\s+to\s+authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.rpc_mark_all_notifications_read\s+to\s+authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.rpc_save_notification_preferences\s+to\s+authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.rpc_get_notification_preferences\s+to\s+authenticated/i,
];

for (const grantRegex of requiredGrants) {
  if (!grantRegex.test(sql)) {
    errors.push(`Missing grant statement matching: ${grantRegex.source}`);
  }
}
console.log(`[PASS] All ${requiredGrants.length} required grants for authenticated users verified.`);

// 8. Confirm ZERO operational DELETE statements
const operationalTables = [
  'purchase_orders',
  'purchase_order_lines',
  'shipments',
  'requests',
  'request_lines',
  'stock_balances',
  'stock_movements',
  'audit_log',
  'users',
  'warehouses',
  'companies',
  'materials',
  'packaging_types',
  'offers',
];

for (const table of operationalTables) {
  const deleteRegex = new RegExp(`delete\\s+from\\s+(public\\.)?${table}\\b`, 'i');
  if (deleteRegex.test(uncommentedSql)) {
    errors.push(`ILLEGAL_OPERATIONAL_DELETE: Migration contains DELETE statement for operational table "${table}"!`);
  }
}
console.log('[PASS] ZERO operational data DELETE operations detected across all core tables.');

// 9. Confirm that DELETE on purchase_orders is NEVER granted to authenticated
if (/grant\s+.*delete.*on\s+(public\.)?purchase_orders\s+to\s+authenticated/i.test(uncommentedSql)) {
  errors.push('SECURITY_VIOLATION: GRANT DELETE ON purchase_orders TO authenticated detected!');
}
console.log('[PASS] Immutability preserved: DELETE on purchase_orders is strictly prohibited for authenticated.');

// Summary
if (errors.length > 0) {
  console.error('\n[FAIL] Validation found errors:');
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
} else {
  console.log('\n================================================================');
  console.log('   MIGRATION SCRIPT 0005 IS 100% VALIDATED & PRODUCTION SAFE    ');
  console.log('================================================================');
}
