# Full Railway Postgres Migration Audit

**Date:** May 9, 2026  
**Branch:** feature/railway-postgres-dream-db  
**Status:** Clean working tree, no uncommitted changes  

## Executive Summary

The Sweet404Peaches Railway/Postgres migration is in excellent shape for the next implementation step. All migration documentation exists and is consistent. The storage adapter layer is properly implemented with Firebase defaults and loud failures for unsupported Postgres operations. No premature wiring of hit-evidence functions has occurred. The Prisma schema fully supports the hit-evidence architecture contract. Build and type checks pass cleanly.

**Recommendation:** Proceed with careful Postgres-mode wiring of `/api/backtest/save-engine-replay-hits` using `persistBacktestReplayEvidence`, preserving Firebase mode unchanged.

## Current Migration Status

### Completed Migrations
- Railway Postgres foundation with Prisma
- Storage adapter layer (Firebase default, Postgres implemented for intended areas)
- Fresh-start Railway data strategy
- Dreamers routes migrated (`/api/dreamers`)
- Dream entries migrated (`/api/dreams/save-entry`, `/api/dreams/entries`, `/api/dreams/latest`)
- Active window read routes migrated (`/api/dreams/windows`, `/api/dreams/window-groups`)
- Dictionary routes migrated (`/api/dictionary/terms`)
- Backtest intake migrated (`/api/backtest/save-dream-intake`, `/api/backtest/list-dreams`, `/api/backtest/dream-detail`)
- Owner profile migrated (`/api/owner-profile`)
- New Dream page no longer imports Firestore directly for dreamers

### Hit-Evidence Progress
- Hit Evidence Architecture Contract created
- Pure hit-evidence helpers created under `src/lib/evidence`
- Postgres hit-evidence storage functions created
- Backtest hit-evidence orchestrator created (`persistBacktestReplayEvidence`)
- **NOT wired to any routes yet**

### Remaining High-Risk Routes
- `/api/backtest/save-engine-replay-hits` - Direct Firestore writes to hit evidence collections
- `/api/dreams/refresh` - Direct Firestore refresh logic
- `/api/fell-before` - Direct Firestore reads of personal hit mappings
- `/api/fell-before/events` - Direct Firestore reads
- `/api/dreams/hits` - Direct Firestore reads of dream hits
- Playlist routes - Direct Firestore operations
- Admin repair/rebuild/promote/audit routes - Expected direct Firestore usage

## What is Safe and Working

### Storage Adapter
- `DREAM_DB_PROVIDER` defaults to `firebase`
- Firebase mode fully supported
- Postgres mode implemented only for migrated areas
- Unsupported Postgres functions fail loudly with clear error messages
- No hit-memory routes prematurely wired

### Route Safety
All migrated routes use the storage adapter and are Postgres-safe:

| Route | Uses Adapter | Direct Firestore | Writes Hit Evidence | Postgres-Safe | Risk | Notes |
|-------|--------------|------------------|---------------------|---------------|------|-------|
| `/api/dreamers` | ✅ | ❌ | ❌ | ✅ | safe | Dreamer CRUD |
| `/api/dreams/save-entry` | ✅ | ❌ | ❌ | ✅ | safe | Dream entries + windows + mappings |
| `/api/dreams/entries` | ✅ | ❌ | ❌ | ✅ | safe | Dream entry reads |
| `/api/dreams/latest` | ✅ | ❌ | ❌ | ✅ | safe | Latest dream reads |
| `/api/dreams/windows` | ✅ | ❌ | ❌ | ✅ | safe | Active window reads |
| `/api/dreams/window-groups` | ✅ | ❌ | ❌ | ✅ | safe | Window grouping reads |
| `/api/dictionary/terms` | ✅ | ❌ | ❌ | ✅ | safe | Dictionary CRUD |
| `/api/backtest/save-dream-intake` | ✅ | ❌ | ❌ | ✅ | safe | Backtest intake |
| `/api/backtest/list-dreams` | ✅ | ❌ | ❌ | ✅ | safe | Backtest reads |
| `/api/backtest/dream-detail` | ✅ | ❌ | ❌ | ✅ | safe | Backtest detail reads |
| `/api/owner-profile` | ✅ | ❌ | ❌ | ✅ | safe | Profile CRUD |

### Hit-Evidence Safety
- No API routes import `persistBacktestReplayEvidence`
- No engine files import `persistBacktestReplayEvidence`
- No route currently writes Postgres hit evidence through the new orchestrator
- `owner-self` remains virtual (not hardcoded)
- Missing `dreamerId` is not silently defaulted to `owner-self`
- Leading zeros preserved as strings (no dangerous `Number()` coercions found)
- Exact/box/both logic follows contract
- Backtest orchestrator uses deterministic `sourceContextId`
- Storage functions are idempotent through unique constraints and `createMany` `skipDuplicates`
- `personal_hit_events` treated as event truth
- `personal_hit_mappings` treated as rebuildable aggregate memory

### Prisma Schema
All required tables exist and support the hit-evidence contract:

- ✅ `Owner`
- ✅ `Dreamer`
- ✅ `DreamEntry`
- ✅ `DreamTerm`
- ✅ `DreamCandidate`
- ✅ `ActiveDreamWindow`
- ✅ `TermNumberMapping`
- ✅ `BacktestDream`
- ✅ `BacktestWindow`
- ✅ `BacktestResult`
- ✅ `BacktestHit`
- ✅ `BacktestSummary`
- ✅ `DreamHit`
- ✅ `PersonalHitEvent`
- ✅ `PersonalHitMapping`

No field gaps, naming mismatches, or limitations found.

### Leading Zero Safety
No dangerous number coercions found around lottery numbers and hit evidence. The codebase explicitly avoids `Number()` and `parseInt()` for lottery data, preserving leading zeros as strings.

### Firebase Direct Usage
Direct Firestore usage is limited to:
- Admin repair/rebuild/promote/audit routes (expected)
- High-risk routes not yet migrated
- Legacy backup files and migration scripts

No unexpected direct Firestore imports in active routes.

## What Remains Risky

### High-Risk Routes
| Route | Risk Level | Issue |
|-------|------------|-------|
| `/api/backtest/save-engine-replay-hits` | high | Direct Firestore writes to `backtestHits`, `personalHitEvents`, `personalHitMappings`, `backtestSummaries` |
| `/api/dreams/refresh` | moderate | Direct Firestore refresh logic |
| `/api/fell-before` | moderate | Direct Firestore reads of `personalHitMappings` |
| `/api/fell-before/events` | moderate | Direct Firestore reads |
| `/api/dreams/hits` | moderate | Direct Firestore reads of `dreamHits` |
| Playlist routes | moderate | Direct Firestore operations |
| Admin routes | expected | Direct Firestore for repair operations |

### Migration Gaps
- No routes currently use Postgres hit-evidence storage
- Live hit detection still uses Firebase `dreamHits`
- Fell-before features still read Firebase `personalHitMappings`

## Inconsistencies Found

None. All migration documentation exists and is consistent. Storage adapter implementation matches the plan. No premature wiring detected.

## Files Reviewed Before Next Implementation

- `docs/migration/hit-evidence-architecture-contract.md`
- `src/lib/evidence/hitEvidenceTypes.ts`
- `src/lib/evidence/backtestHitOrchestrator.ts`
- `src/lib/storage/postgres/hitEvidence.ts`
- `src/lib/storage/postgres/dreamHits.ts`
- `prisma/schema.prisma`
- `src/app/api/backtest/save-engine-replay-hits/route.ts`

## Whether /api/backtest/save-engine-replay-hits is Safe to Wire Next

**Yes, with careful implementation.**

The route currently uses direct Firestore writes. The Postgres hit-evidence system is ready:
- `persistBacktestReplayEvidence` exists and is tested
- Storage functions are idempotent
- Schema supports all required fields
- No other routes are wired yet

**Implementation approach:**
- Add Postgres mode branch inside the route
- Preserve Firebase mode unchanged
- Use `persistBacktestReplayEvidence` for Postgres writes
- Test thoroughly before committing

## Exact Recommendation for Next Implementation Step

Do not wire live refresh yet.  
Do not wire fell-before yet.  

**Next step:** Careful Postgres-mode branch inside `/api/backtest/save-engine-replay-hits` using `persistBacktestReplayEvidence`, while preserving Firebase mode unchanged.

## Pre-Flight Checklist Before Wiring Hit Evidence Route

- [ ] Review `persistBacktestReplayEvidence` implementation
- [ ] Verify Postgres hit-evidence storage functions
- [ ] Test backtest replay with Firebase mode (unchanged)
- [ ] Create test backtest replay with Postgres mode
- [ ] Verify idempotency (re-running same replay doesn't inflate counts)
- [ ] Check leading zero preservation in Postgres writes
- [ ] Verify `sourceContextId` determinism
- [ ] Test error handling and rollback on partial failures
- [ ] Confirm no impact on existing Firebase users
- [ ] Run full build and type checks

## Commands Run and Results

```bash
git status
# On branch feature/railway-postgres-dream-db
# Your branch is up to date with 'origin/feature/railway-postgres-dream-db'.
# nothing to commit, working tree clean

npx prisma validate
# Prisma schema loaded from prisma/schema.prisma.
# The schema at prisma/schema.prisma is valid 🚀

npx prisma generate
# ✔ Generated Prisma Client (v7.8.0) to ./node_modules/@prisma/client in 428ms

npx tsc --noEmit
# (no output - success)

npm run build
# ✓ Compiled successfully in 16.2s
# ✓ Finished TypeScript in 15.5s
# ✓ Collecting page data using 1 worker in 1272ms
# ✓ Generating static pages using 1 worker (40/40) in 1373ms
# ✓ Finalizing page optimization in 5ms
```

## Files Changed

- Created: `docs/migration/full-railway-postgres-migration-audit.md`

## Audit Findings

- ✅ Git/branch safety: Clean
- ✅ Migration docs: All exist and consistent
- ✅ Storage adapter: Properly implemented
- ✅ Routes: Migrated routes safe, high-risk routes identified
- ✅ Hit-evidence: No premature wiring
- ✅ Prisma schema: Complete and correct
- ✅ Leading zeros: No risky coercions
- ✅ Firebase direct usage: Limited to expected areas
- ✅ Build validation: All pass

## Recommended Next Action

Implement Postgres mode in `/api/backtest/save-engine-replay-hits` using `persistBacktestReplayEvidence`.</content>
<parameter name="filePath">/workspaces/Sweet404Peaches/docs/migration/full-railway-postgres-migration-audit.md