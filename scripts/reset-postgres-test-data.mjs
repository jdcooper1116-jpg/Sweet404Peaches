#!/usr/bin/env node
/**
 * scripts/reset-postgres-test-data.mjs
 *
 * Safely wipes Sweet404Peaches test data from the Railway Postgres database.
 *
 * USAGE:
 *   node scripts/reset-postgres-test-data.mjs \
 *     --ownerUid=<firebase-auth-uid> \
 *     --confirm=CONFIRM_RESET_SWEET404_POSTGRES \
 *     [--dry-run] \
 *     [--include-dreamers]
 *
 * SAFETY GUARDS:
 *   - Requires the exact confirmation phrase CONFIRM_RESET_SWEET404_POSTGRES
 *   - Requires DATABASE_URL to be set
 *   - Requires explicit --ownerUid (or --all for all owners)
 *   - Defaults to keeping owners and dreamers rows
 *   - Dry-run by default; use --confirm to actually delete
 *   - Never deletes _prisma_migrations, source code, or Firebase Auth data
 *   - Deletes in foreign-key-safe order (child rows before parent rows)
 *   - Prints row counts before and after each table
 *
 * npm script:
 *   "reset:postgres:test-data": "node scripts/reset-postgres-test-data.mjs"
 *
 * NEVER run this in production unless you intend to wipe all data.
 */

import { PrismaPg }   from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// ── Constants ─────────────────────────────────────────────────────────────────

const REQUIRED_CONFIRM_PHRASE = 'CONFIRM_RESET_SWEET404_POSTGRES';

/** Delete order: children before parents (respects foreign keys). */
const DELETE_ORDER = [
  'personalHitMapping',   // depends on: owners
  'personalHitEvent',     // depends on: owners
  'dreamHit',             // depends on: active_dream_windows, dream_entries, owners
  'backtestSummary',      // depends on: backtest_dreams, owners
  'backtestHit',          // depends on: backtest_dreams, owners
  'backtestResult',       // depends on: backtest_windows, owners
  'backtestWindow',       // depends on: backtest_dreams, owners
  'backtestDream',        // depends on: owners
  'activeDreamWindow',    // depends on: dream_entries, owners
  'dreamCandidate',       // depends on: dream_entries, dream_terms, owners
  'dreamTerm',            // depends on: dream_entries, owners
  'dreamEntry',           // depends on: owners
  'termNumberMapping',    // depends on: owners
];

/** Optional tables — delete only if the Prisma model exists. */
const OPTIONAL_TABLES = [
  'engineRequestLog',
  'auditLog',
];

/** Dreamer-related — only deleted when --include-dreamers is passed. */
const DREAMER_TABLES = ['dreamer'];

const PRISMA_MAP = {
  personalHitMapping:  'personal_hit_mappings',
  personalHitEvent:    'personal_hit_events',
  dreamHit:            'dream_hits',
  backtestSummary:     'backtest_summaries',
  backtestHit:         'backtest_hits',
  backtestResult:      'backtest_results',
  backtestWindow:      'backtest_windows',
  backtestDream:       'backtest_dreams',
  activeDreamWindow:   'active_dream_windows',
  dreamCandidate:      'dream_candidates',
  dreamTerm:           'dream_terms',
  dreamEntry:          'dream_entries',
  termNumberMapping:   'term_number_mappings',
  engineRequestLog:    'engine_request_logs',
  auditLog:            'audit_logs',
  dreamer:             'dreamers',
};

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  let ownerUid        = null;
  let all              = false;
  let confirm         = null;
  let dryRun           = false;
  let includeDreamers  = false;
  let help             = false;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h')               { help = true; }
    else if (arg === '--dry-run')                        { dryRun = true; }
    else if (arg === '--all')                            { all = true; }
    else if (arg === '--include-dreamers')               { includeDreamers = true; }
    else if (arg.startsWith('--ownerUid='))             { ownerUid = arg.split('=').slice(1).join('='); }
    else if (arg.startsWith('--confirm='))              { confirm  = arg.split('=').slice(1).join('='); }
    else { console.error(`Unknown argument: ${arg}`); process.exit(1); }
  }

  return { ownerUid, all, confirm, dryRun, includeDreamers, help };
}

function printUsage() {
  console.log(`
Usage:
  node scripts/reset-postgres-test-data.mjs \\
    --ownerUid=<uid> \\
    --confirm=CONFIRM_RESET_SWEET404_POSTGRES \\
    [--dry-run] \\
    [--include-dreamers]

Options:
  --ownerUid=<uid>       Delete data for this specific owner UID (required unless --all)
  --all                  Delete data for ALL owners (use with extreme caution)
  --confirm=<phrase>     Must be exactly: CONFIRM_RESET_SWEET404_POSTGRES
  --dry-run              Show counts and delete plan without actually deleting
  --include-dreamers     Also delete dreamers rows (kept by default)
  --help                 Show this help

Tables deleted (in dependency-safe order):
  personal_hit_mappings, personal_hit_events, dream_hits,
  backtest_summaries, backtest_hits, backtest_results, backtest_windows,
  backtest_dreams, active_dream_windows, dream_candidates, dream_terms,
  dream_entries, term_number_mappings
  [+ engine_request_logs, audit_logs if they exist]
  [+ dreamers if --include-dreamers]

Tables NEVER deleted:
  owners, _prisma_migrations
  `);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { ownerUid, all, confirm, dryRun, includeDreamers, help } = parseArgs(process.argv);

  if (help) { printUsage(); process.exit(0); }

  // Guard: DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('\n❌ DATABASE_URL is not set. Aborting.\n');
    process.exit(1);
  }

  // Guard: need ownerUid or --all
  if (!ownerUid && !all) {
    console.error('\n❌ Either --ownerUid=<uid> or --all is required.\n');
    printUsage();
    process.exit(1);
  }

  // Guard: confirmation phrase
  if (!dryRun && confirm !== REQUIRED_CONFIRM_PHRASE) {
    console.error(`
❌ Live reset requires --confirm=${REQUIRED_CONFIRM_PHRASE}

To preview what would be deleted (safe):
  node scripts/reset-postgres-test-data.mjs --ownerUid=... --dry-run

To actually delete:
  node scripts/reset-postgres-test-data.mjs --ownerUid=... --confirm=${REQUIRED_CONFIRM_PHRASE}
`);
    process.exit(1);
  }

  // ── Connect ────────────────────────────────────────────────────────────────
  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma  = new PrismaClient({ adapter });

  try {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  Sweet404Peaches — Postgres Test Data Reset');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  Mode:             ${dryRun ? '🔍 DRY RUN (no changes)' : '🔥 LIVE RESET'}`);
    console.log(`  Scope:            ${all ? 'ALL OWNERS' : `ownerUid = ${ownerUid}`}`);
    console.log(`  Include dreamers: ${includeDreamers ? 'YES' : 'no (default)'}`);
    console.log('══════════════════════════════════════════════════════════\n');

    // Build the where clause for all deletes
    const where = all ? {} : { where: { ownerUid: ownerUid } };
    const whereOrAll = (field = 'ownerUid') => all ? {} : { where: { [field]: ownerUid } };

    // ── Count phase ──────────────────────────────────────────────────────────
    console.log('  Counting rows before reset…\n');

    const allTables = [
      ...DELETE_ORDER,
      ...(includeDreamers ? DREAMER_TABLES : []),
      ...OPTIONAL_TABLES,
    ];

    const counts = {};
    for (const model of allTables) {
      try {
        const client = prisma[model];
        if (!client) { counts[model] = -1; continue; } // model doesn't exist
        const cnt = await client.count(where);
        counts[model] = cnt;
        const table = PRISMA_MAP[model] ?? model;
        console.log(`    ${String(cnt).padStart(7)} rows  ${table}`);
      } catch {
        counts[model] = -1;
        console.log(`    (skipped — table may not exist: ${model})`);
      }
    }

    const totalRows = Object.values(counts).filter(n => n > 0).reduce((a, b) => a + b, 0);
    console.log(`\n    ─────────────────────────────────────`);
    console.log(`    ${String(totalRows).padStart(7)} total rows to delete`);
    console.log();

    if (dryRun) {
      console.log('  ✅ Dry run complete. No data was deleted.');
      console.log('  To actually delete, re-run without --dry-run and with:');
      console.log(`  --confirm=${REQUIRED_CONFIRM_PHRASE}\n`);
      return;
    }

    // ── Delete phase ─────────────────────────────────────────────────────────
    console.log('  Deleting in dependency-safe order…\n');

    const deleted = {};
    const deleteOrder = [
      ...DELETE_ORDER,
      ...(includeDreamers ? DREAMER_TABLES : []),
      ...OPTIONAL_TABLES,
    ];

    for (const model of deleteOrder) {
      if (counts[model] === -1) continue; // table doesn't exist
      if (counts[model] === 0) {
        deleted[model] = 0;
        continue;
      }
      try {
        const client = prisma[model];
        if (!client) continue;
        const result = await client.deleteMany(where);
        deleted[model] = result.count;
        const table = PRISMA_MAP[model] ?? model;
        console.log(`    ✓ deleted ${String(result.count).padStart(6)} rows  ${table}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`    ✗ failed  ${(PRISMA_MAP[model] ?? model)}: ${msg}`);
      }
    }

    // ── Verify ────────────────────────────────────────────────────────────────
    console.log('\n  Verifying counts after reset…\n');
    let remaining = 0;
    for (const model of deleteOrder) {
      if (counts[model] === -1 || counts[model] === 0) continue;
      try {
        const client = prisma[model];
        if (!client) continue;
        const cnt = await client.count(where);
        remaining += cnt;
        const table = PRISMA_MAP[model] ?? model;
        if (cnt > 0) console.log(`    ⚠  ${String(cnt).padStart(6)} rows remain  ${table}`);
      } catch { /* non-fatal */ }
    }

    console.log();
    if (remaining === 0) {
      console.log('  ✅ Reset complete. All targeted rows deleted.');
    } else {
      console.log(`  ⚠  Reset complete with ${remaining} row(s) remaining (may be due to cascade or FK constraints).`);
    }
    console.log();

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('\n❌ Reset failed:', err);
  process.exit(1);
});
