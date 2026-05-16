# Postgres Test Data Reset

**Script:** `scripts/reset-postgres-test-data.mjs`  
**Purpose:** Safely wipe Sweet404Peaches test data from Railway Postgres so you can start a clean test cycle.

---

## Quick Start

```bash
# 1. Preview what would be deleted (safe — no changes made)
node scripts/reset-postgres-test-data.mjs \
  --ownerUid=FJSPGNIj8WZXpustwDHZk97UpIk1 \
  --confirm=CONFIRM_RESET_SWEET404_POSTGRES \
  --dry-run

# 2. Actually delete (after reviewing dry-run output)
node scripts/reset-postgres-test-data.mjs \
  --ownerUid=FJSPGNIj8WZXpustwDHZk97UpIk1 \
  --confirm=CONFIRM_RESET_SWEET404_POSTGRES

# 3. Also wipe dreamers
node scripts/reset-postgres-test-data.mjs \
  --ownerUid=FJSPGNIj8WZXpustwDHZk97UpIk1 \
  --confirm=CONFIRM_RESET_SWEET404_POSTGRES \
  --include-dreamers

# Or via npm
npm run reset:postgres:test-data -- \
  --ownerUid=FJSPGNIj8WZXpustwDHZk97UpIk1 \
  --confirm=CONFIRM_RESET_SWEET404_POSTGRES \
  --dry-run
```

---

## Safety Requirements

| Requirement | Detail |
|---|---|
| `DATABASE_URL` must be set | Script exits immediately if not found |
| `--confirm=CONFIRM_RESET_SWEET404_POSTGRES` | Exact phrase required for live deletes |
| `--ownerUid=<uid>` or `--all` | One is required |
| `--dry-run` | Shows counts without deleting |
| Live Firebase Auth | Never touched — this script only writes to Postgres |
| `_prisma_migrations` | Never deleted |
| `owners` table | Never deleted (Prisma cascade would remove everything anyway) |
| `dreamers` | Kept by default; deleted only with `--include-dreamers` |

---

## Tables Deleted (in dependency-safe order)

| Table | Prisma model | Kept by default? |
|---|---|---|
| `personal_hit_mappings` | `personalHitMapping` | ❌ deleted |
| `personal_hit_events` | `personalHitEvent` | ❌ deleted |
| `dream_hits` | `dreamHit` | ❌ deleted |
| `backtest_summaries` | `backtestSummary` | ❌ deleted |
| `backtest_hits` | `backtestHit` | ❌ deleted |
| `backtest_results` | `backtestResult` | ❌ deleted |
| `backtest_windows` | `backtestWindow` | ❌ deleted |
| `backtest_dreams` | `backtestDream` | ❌ deleted |
| `active_dream_windows` | `activeDreamWindow` | ❌ deleted |
| `dream_candidates` | `dreamCandidate` | ❌ deleted |
| `dream_terms` | `dreamTerm` | ❌ deleted |
| `dream_entries` | `dreamEntry` | ❌ deleted |
| `term_number_mappings` | `termNumberMapping` | ❌ deleted |
| `engine_request_logs` | `engineRequestLog` | ❌ deleted (if exists) |
| `audit_logs` | `auditLog` | ❌ deleted (if exists) |
| `dreamers` | `dreamer` | ✅ **KEPT** (unless `--include-dreamers`) |
| `owners` | `owner` | ✅ **ALWAYS KEPT** |
| `_prisma_migrations` | — | ✅ **ALWAYS KEPT** |

---

## Flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `--ownerUid=<uid>` | Yes (or `--all`) | — | Scope deletes to one owner |
| `--all` | — | off | Delete data for ALL owners |
| `--confirm=<phrase>` | Yes for live | — | Must be exact phrase |
| `--dry-run` | — | off | Print counts without deleting |
| `--include-dreamers` | — | off | Also delete dreamers rows |
| `--help` | — | — | Show usage |

---

## After Reset — Recommended Fresh Test Workflow

1. **Reset Postgres:** run this script in live mode
2. **Verify empty:** run in dry-run mode — all counts should be 0
3. **Upload fresh dreams:** use the Build Dream page (`/dreams/build`)
4. **Upload backtest dreams:** use Historical Dream Intake (`/backtesting/intake`)
5. **Run replay:** use Replay Lab (`/backtesting/replay`) for each backtest dream
6. **Trigger refresh:** POST to `/api/dreams/refresh` or click Refresh on Dashboard
7. **Check fell-before:** visit As They Fell Before, select owner-self or specific dreamer

---

## What This Does NOT Reset

- Firebase Auth (users, sessions, tokens)
- Firestore data (personalHitMappings, dreamHits, etc. in old Firebase collections)
- Vercel environment variables
- Railway Postgres schema / migrations
- Source code
- Prisma schema

If you also need to clear Firestore test data, use the existing `/api/admin/reset` route (Firebase mode only, requires ADMIN auth).

---

## Example Output (dry-run)

```
══════════════════════════════════════════════════════════
  Sweet404Peaches — Postgres Test Data Reset
══════════════════════════════════════════════════════════
  Mode:             🔍 DRY RUN (no changes)
  Scope:            ownerUid = FJSPGNIj8WZXpustwDHZk97UpIk1
  Include dreamers: no (default)
══════════════════════════════════════════════════════════

  Counting rows before reset…

          5 rows  personal_hit_mappings
         65 rows  personal_hit_events
          0 rows  dream_hits
          2 rows  backtest_summaries
        712 rows  backtest_hits
        712 rows  backtest_results
          2 rows  backtest_windows
          2 rows  backtest_dreams
         59 rows  active_dream_windows
         59 rows  dream_candidates
          7 rows  dream_terms
          1 rows  dream_entries
         59 rows  term_number_mappings

    ─────────────────────────────────────
       1683 total rows to delete

  ✅ Dry run complete. No data was deleted.
  To actually delete, re-run without --dry-run and with:
  --confirm=CONFIRM_RESET_SWEET404_POSTGRES
```
