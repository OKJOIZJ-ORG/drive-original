import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
const matrixPath = 'qa/candidate-rc11-package/qualification-matrix.md';
const reviewPath = 'qa/candidate-rc11-package/qualification-review.json';
const resultsPath = 'qa/candidate-contract-completion-rc11/results.json';
const run = JSON.parse(fs.readFileSync(path.join(root, resultsPath)));
assert.equal(run.failed, 0); assert.equal(run.passed, 28);
assert.equal(hash(run.producer.path), run.producer.sha256);
const closures = {
  'QA-ST-02': { clauses: ['offline like/unlike/viewed edits preserved locally', 'remote unchanged while transport is offline', 'reconnect merges concurrent writer and unlike tombstone', 'independent readback confirms own writer; other writer unchanged'], text: 'E15 fixed actual app+synthetic transport: offline like/unlike/viewed edits survive failed transport with remote writes0; reconnect confirms merged concurrent writer, viewed union and unlike tombstone in own document, other writer unchanged. Contract acceptance; actual two-device experience remains QA-ST-01/G5.' },
  'QA-MU-05': { clauses: ['earlier per-file confirmed result survives later expiry', 'origin ledger survives account switch', 'remaining items reject and new account recovery does not replay origin operations'], text: 'E15 actual canonical controller+synthetic provider proves partial batch expiry and account-switch cases: per-file fulfilled/rejected and origin confirmed/uncertain ledgers preserved, remaining items fenced, new-account recovery writes0. E8 retains separate actual restricted integration; normal gallery write route stays locked.' },
  'QA-MU-07': { clauses: ['same-name siblings are distinguished by exact ID', 'shortcut target is never followed for mutation', 'shared-drive supportsAllDrives and verified parents used', 'zero sibling/target modifications'], text: 'E15 fixed canonical controller moves selected same-name shared-drive shortcut ID only, supportsAllDrives=true, verified old/destination parents, one PATCH confirmed by independent GET; sibling and shortcut target unchanged. Retained shortcut fixture separately passes. Normal gallery target discovery/device experience is not implied.' },
  'QA-SE-01': { clauses: ['path/URL injected IDs fail before credential/provider access', 'arbitrary unauthorized ID preserves denial and no-store', 'foreign client/account credential cannot be borrowed', 'ordinary/foreign state write outside capability never transmits'], text: 'E15 injected path/URL IDs400/provider0; arbitrary unauthorized ID preserves synthetic provider403/no-store; actual client-scoped credential/missing-owner and foreign canonical-state capability fixtures reject outside owner. E2 current public private404/E9 retained auth routes corroborate integration. No claim of probing another real account.' },
  'QA-SE-03': { clauses: ['malformed/truncated/oversized media responses fail closed', 'codec failure and bounded original recovery remain explicit', 'Blob/OPFS quota failures remain storage-limited with owned cleanup', 'original state and sibling cache/worker preserved'], text: 'E15 malformed Range/truncated or oversized206 fail closed before unverified bytes; actual app codec/recovery and Blob/OPFS-quota fixtures report bounded/storage-limited failure and release owned lease/reader; state quota writes0 preserves local/remote data; cache reset preserves sibling cache/worker. Originals use synthetic read-only bytes, no remote media mutation. Actual OS endurance remains separate.' },
  'QA-SW-01': { clauses: ['old page lacking retirement capability cannot start Q1 transport', 'new/restarted worker requires correlated requesting owner', 'install/activate retains current cache and removes old owned cache only', 'offline old query resolves canonical installed shell', 'API/media/private/sibling routes cannot mix into shell cache'], text: 'E15 actual old-page capability/restarted-worker correlation fences and install/activate pass: old owned cache removed, current/sibling retained; old-version query offline reload uses canonical cached shell; public-only install and API/media/sibling cache exclusion. E2 actual candidate cold/offline/public-cache proof supplies integration. Mandatory installed physical-device experience remains separate.' },
};
let matrix = fs.readFileSync(path.join(root, matrixPath), 'utf8');
const evidence = '| E15 | `qa/candidate-contract-completion-rc11/contract-completion.mjs`, `qa/candidate-contract-completion-rc11/results.json`: fixed b9d8739 Git bodies loaded through read-only VM helper facade, independent of concurrent AUTH edits. Focused28/28:23 selected retained actual app/SW tests plus5 new offline-merge/partial-expiry/exact-target/injection/SW-lifecycle discriminators. Every source and producer SHA retained. Synthetic providers/IDs/storage only; real network/browser/private reads/real writes0. Does not replay full368 or qualify physical devices, normal mutation UI, hosted logs or live rollback. |';
if (!matrix.includes('| E15 |')) matrix = matrix.replace(/(\| E14 \|[^\n]*\n)/u, `$1${evidence}\n`);
for (const [id, row] of Object.entries(closures)) {
  const expression = new RegExp(`^\\| ${id} \\| ([^|]+) \\| [^|]+ \\|[^\\n]*`, 'mu');
  assert.ok(expression.test(matrix), id);
  matrix = matrix.replace(expression, `| ${id} | $1 | passed | ${row.text} |`);
}
matrix = matrix.replace(/\| QA-SE-02 \|([^|]+)\|[^\n]*/u, '| QA-SE-02 |$1| not-run | E15 actual media trace emits no token/header/resourceKey; E2/E14 fixed public allowlist excludes private evidence/internal files. Current hosted auth/app logs and credential-handling process invocation producers are not audited by this unit; inspect those exact owners before whole-row pass. |');
matrix = matrix.replace(/\| QA-MU-10 \|([^|]+)\|[^\n]*/u, '| QA-MU-10 |$1| not-run | E8 actual restricted restoration/read-only recovery preserves identities and uses no permanent DELETE, but final file is recoverably trashed and2new folders retained. No exact approved pre-state restoration comparison for all remnants is recorded. Securely inspect recovery ledger/pre-state before any further cleanup; general writes remain false. |');
fs.writeFileSync(path.join(root, matrixPath), matrix);
const review = JSON.parse(fs.readFileSync(path.join(root, reviewPath)));
const spec = fs.readFileSync(path.join(root, review.specification.path), 'utf8');
assert.equal(hash(review.specification.path), review.specification.expectedSha256);
const parse = text => [...text.matchAll(/^\| (QA-[A-Z]{2}-\d{2}) \|([^\n]*)/gmu)].map(match => ({ id: match[1], fields: match[2].split('|').map(s => s.trim()), line: text.slice(0, match.index).split('\n').length }));
const expected = parse(spec), actual = parse(matrix);
assert.equal(expected.length, 69); assert.equal(actual.length, 69);
assert.equal(new Set(actual.map(row => row.id)).size, 69);
assert.deepEqual(actual.map(row => row.id).sort(), expected.map(row => row.id).sort());
review.acceptance = actual.map(row => ({ id: row.id, specLine: expected.find(entry => entry.id === row.id).line, matrixLine: row.line, status: row.fields[1], evidenceKeys: [...new Set(row.fields[2].match(/\bE\d+\b/gu) || [])] }));
review.coverage.statusCounts = Object.fromEntries([...new Set(actual.map(row => row.fields[1]))].map(status => [status, actual.filter(row => row.fields[1] === status).length]));
review.matrix.sha256 = hash(matrixPath);
review.scope = 'Full69row fixed rc11 evidence/contract qualification review; owned matrix/report and local QA leaf producers/results only; no product/testfiles/browser/private evidence mutation or commit.';
for (const relative of [run.producer.path, resultsPath]) if (!review.pointers.some(pointer => pointer.path === relative)) review.pointers.push({ path: relative, exists: fs.existsSync(path.join(root, relative)) });
review.fixedBaselineContractCompletion = {
  path: resultsPath, sha256: hash(resultsPath), producer: run.producer,
  candidate: run.candidate, passed: run.passed, failed: run.failed,
  selectedRetainedTests: run.selectedRetainedTests, newDiscriminators: 5,
  sourceScope: run.scope, sourceHashes: run.sources,
  fullSuiteRepeated: false, mutableAuthAccepted: false,
  passingRows: Object.entries(closures).map(([id, row]) => ({ id, source: expected.find(entry => entry.id === id), mappedClauses: row.clauses, cases: run.results.filter(result => result.id === id).map(({ name, source, observation }) => ({ name, source, observation })) })),
  retainedPartial: [
    { id: 'QA-ST-01', tested: 'actual app two continuously foreground VM clients and schedule stops; historical current actual one-device sync', missing: 'required actual two-device like/unlike/viewed bidirectional foreground propagation' },
    { id: 'QA-SE-02', tested: 'actual SW trace privacy and fixed public allowlist/ZIP', missing: 'current auth/app log producer plus credential-handling process args/transport boundary audit' },
    { id: 'QA-MU-10', tested: 'actual restricted historical file restore and recovery final reads; permanent DELETE excluded', missing: 'explicit approved final pre-state comparison for recoverableTrash file and two retained tagged folders' },
  ],
  actualUnimplementedBehaviorFound: [],
  decision: 'No new product defect established by this fixed-baseline unit. SE02/MU10 are evidence gaps, not automatically unimplemented behavior. Current AUTH scope defect belongs to separate coordinator unit.',
};
const fix = 'FixedGit rc11 focused28/28 closes six exact contract rows ST02/MU05/MU07/SE01/SE03/SW01 without blanket live-fault/device requirements; physical ST01, process/log SE02 and explicit residual pre-state MU10 remain scoped gaps.';
if (!review.materialFixes.includes(fix)) review.materialFixes.push(fix);
fs.writeFileSync(path.join(root, reviewPath), JSON.stringify(review, null, 2) + '\n');
console.log(JSON.stringify({ exactIds: actual.length, statusCounts: review.coverage.statusCounts, matrixSha256: review.matrix.sha256, producerMatched: true, specMatched: true }));
