import { writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';

async function main() {
  console.log('================================================================');
  console.log('   STOCKFLOW — GITHUB ACTIONS BACKUP ARTIFACT VERIFICATION     ');
  console.log('================================================================\n');

  // 1. Get GitHub token from git credential
  const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n', encoding: 'utf-8' });
  const passLine = creds.split(/\r?\n/).find(l => l.startsWith('password='));
  const token = passLine.replace('password=', '').trim();

  // 2. Determine target run ID
  let runId = process.argv[2];
  if (!runId) {
    const runsRes = await fetch('https://api.github.com/repos/shujahatk/WAREHOUSE/actions/runs?per_page=5', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'StockFlow-Disaster-Recovery-Verifier',
      },
    });
    const runsData = await runsRes.json();
    const backupRuns = (runsData.workflow_runs || []).filter(r => r.name.includes('Backup'));
    if (backupRuns.length > 0) {
      runId = backupRuns[0].id.toString();
    } else {
      runId = '43431902449';
    }
  }

  console.log(`[1/4] Querying GitHub API for Run ${runId} artifacts...`);
  const res = await fetch(`https://api.github.com/repos/shujahatk/WAREHOUSE/actions/runs/${runId}/artifacts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'StockFlow-Disaster-Recovery-Verifier',
    },
  });

  const data = await res.json();
  if (!data.artifacts || data.artifacts.length === 0) {
    throw new Error(`No artifacts found for run ${runId}`);
  }

  const artifact = data.artifacts[0];
  console.log(`      Found Artifact:   ${artifact.name}`);
  console.log(`      Artifact ID:      ${artifact.id}`);
  console.log(`      ZIP Archive Size: ${artifact.size_in_bytes} bytes`);
  console.log(`      Created At:       ${artifact.created_at}`);

  // 3. Download the raw ZIP archive
  console.log('\n[2/4] Downloading raw ZIP archive from GitHub Actions API...');
  const dlRes = await fetch(artifact.archive_download_url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'StockFlow-Disaster-Recovery-Verifier',
    },
  });

  if (!dlRes.ok) {
    throw new Error(`Failed to download artifact: HTTP ${dlRes.status}`);
  }

  const zipBuffer = Buffer.from(await dlRes.arrayBuffer());
  const tempDir = path.join(process.cwd(), '.temp-artifact-verify');
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  const zipFilePath = path.join(tempDir, `${artifact.name}.zip`);
  writeFileSync(zipFilePath, zipBuffer);

  // Compute ZIP archive SHA-256
  const zipSha256 = createHash('sha256').update(zipBuffer).digest('hex');
  console.log(`      ✓ Raw ZIP Downloaded: ${zipBuffer.length} bytes`);
  console.log(`      ✓ Raw ZIP SHA-256:    ${zipSha256}`);

  // 4. Extract the ZIP archive using tar or PowerShell Expand-Archive
  console.log('\n[3/4] Extracting backup file from ZIP archive...');
  execSync(`tar -xf "${zipFilePath}" -C "${tempDir}"`);

  // Find extracted JSON file
  const extractedFiles = execSync(`dir /b "${tempDir}\\*.json"`, { encoding: 'utf-8' }).trim().split(/\r?\n/);
  const jsonFileName = extractedFiles[0];
  const jsonFilePath = path.join(tempDir, jsonFileName);

  console.log(`      ✓ Extracted File:     ${jsonFileName}`);
  const jsonContent = readFileSync(jsonFilePath, 'utf-8');
  const fileSha256 = createHash('sha256').update(jsonContent, 'utf-8').digest('hex');
  console.log(`      ✓ File Size:          ${jsonContent.length} bytes`);
  console.log(`      ✓ File SHA-256:       ${fileSha256}`);

  // 5. Verify Internal Checksum
  console.log('\n[4/4] Verifying Internal Manifest Cryptographic Checksum...');
  const manifest = JSON.parse(jsonContent);
  const dataString = JSON.stringify(manifest.tables);
  const internalComputedSha256 = `sha256:${createHash('sha256').update(dataString).digest('hex')}`;

  console.log(`      Manifest Declared Checksum: ${manifest.checksum}`);
  console.log(`      Recomputed Data Checksum:   ${internalComputedSha256}`);
  const isMatch = manifest.checksum === internalComputedSha256;
  console.log(`      Internal Integrity Match:   ${isMatch ? 'PASS (100% MATCH)' : 'FAIL'}`);
  console.log(`      Tables in Backup:           ${Object.keys(manifest.tables).length}`);
  console.log(`      Warehouses Restorable:      ${manifest.tables.warehouses?.length}`);
  console.log(`      Users Restorable:           ${manifest.tables.users?.length}`);
  console.log(`      Packaging Types Restorable: ${manifest.tables.packaging_types?.length}`);

  // Cleanup
  rmSync(tempDir, { recursive: true, force: true });
  console.log('\n[CLEANUP] Verification staging directory cleaned up successfully.');

  console.log('\n================================================================');
  console.log('   CHECKSUM DISTINCTION SUMMARY                                 ');
  console.log('================================================================');
  console.log(`1. GitHub ZIP Archive SHA-256:       ${zipSha256}`);
  console.log(`2. Extracted JSON File SHA-256:      ${fileSha256}`);
  console.log(`3. Internal Data Checksum:           ${internalComputedSha256}`);
  console.log('================================================================');
}

main().catch(console.error);
