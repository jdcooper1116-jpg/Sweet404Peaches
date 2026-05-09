# Remaining Route Migration Inventory

Fresh-start Railway Postgres remains the target. Firebase Auth stays in place. Do not bulk-import old Firestore data; recreate clean operational data through Postgres-backed routes.

## Already Migrated Or Adapter-Backed

These routes are already behind the storage adapter or have Postgres helper coverage:

| Route/helper | Status |
| --- | --- |
| `/api/dreamers` | Adapter-backed; Postgres dreamer storage implemented. |
| `/api/dreams/save-entry` | Adapter-backed; Postgres writes `dream_entries`, `dream_terms`, `dream_candidates`, `active_dream_windows`, and intake `term_number_mappings`. |
| `/api/dreams/entries` | Adapter-backed; Postgres dream entry list implemented. |
| `/api/dreams/latest` | Adapter-backed; Postgres latest dream read implemented. |
| `/api/dreams/windows` | Adapter-backed; Postgres active-window reads implemented. |
| `/api/dreams/window-groups` | Adapter-backed; Postgres active-window group reads implemented. |
| `/api/dictionary/terms` | Adapter-backed; Postgres `term_number_mappings` read/write implemented. `includeHits` enrichment is Firebase-only until hit memory migrates. |
| `/api/backtest/save-dream-intake` | Adapter-backed; Postgres writes `backtest_dreams`, `backtest_windows`, and historical intake `term_number_mappings`. |
| `/api/backtest/list-dreams` | Adapter-backed; Postgres backtest dream list implemented. |
| `/api/backtest/dream-detail` | Adapter-backed read-only; Postgres reads `backtest_dreams`, `backtest_hits`, and `backtest_summaries`, safely returning empty hits/null summary. |
| `backtest_results` helpers | Postgres helper coverage exists for `bulkCreateBacktestResults` and `listBacktestResultsForDream`; no active route was migrated for these helpers. |

## Remaining Direct Firestore Touchpoints

| File | Collections touched | Read/write/delete | Current provider status | Migration risk | Recommended migration phase | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/api/owner-profile/route.ts` | `ownerProfiles` | Read/write | Firestore direct | safe | Phase 1 | Good next candidate. Owner rows already exist in Postgres; profile fields can map to `owners.displayName/email/metadata`. |
| `src/app/api/pinned-plays/route.ts` | `pinnedPlays` | Read/write/delete | Firestore direct | moderate | Phase 2 | Mostly isolated CRUD. Check page expectations and any links to hit evidence before migrating. |
| `src/app/api/dreams/hits/route.ts` | `dreamHits` | Read | Firestore direct | high | Hit-memory phase | Do not migrate before deciding canonical hit event model. |
| `src/app/api/dreams/refresh/route.ts` and `src/lib/engine/dreamRefresh.ts` | `activeDreamWindows`, `dreamHits`, `personalHitEvents`, `personalHitMappings` | Read/write/update | Firestore direct/local Admin SDK | high | Hit-memory phase | Calls refresh logic, writes live hits and memory, updates windows. Avoid until hit memory is designed. |
| `src/app/api/fell-before/route.ts` | `personalHitMappings` | Read | Firestore direct | high | Hit-memory phase | Aggregated memory layer; old Firestore contains duplicates/repairs. |
| `src/app/api/fell-before/events/route.ts` | `backtestHits`, `dreamHits`, `personalHitEvents` | Read | Firestore direct | high | Hit-memory phase | Event-level evidence across multiple legacy collections. |
| `src/app/api/backtest/save-engine-replay-hits/route.ts` | `backtestDreams`, `backtestHits`, `personalHitEvents`, `personalHitMappings`, `backtestSummaries`, `backtestWindows` | Read/write | Firestore direct | high | Hit-memory/replay phase | Writes replay hits, event ledger, aggregates, summaries, and statuses. |
| `src/app/api/backtest/engine-replay/route.ts` | None directly found | No Firestore direct | partial/engine-only | moderate | Phase 3 after result storage | Calls replay engine path; verify it does not persist before migrating. |
| `src/app/api/backtest/route.ts` | None directly found | No Firestore direct | engine bridge | moderate | Phase 3 after result storage | Calls lottery engine; not a Firestore migration target by itself. |
| `src/app/api/playlists/evidence-backed/route.ts` | `dreamers`, `activeDreamWindows`, `personalHitEvents` | Read | Firestore direct | high | After hit-memory phase | Depends on event proof from `personalHitEvents`. |
| `src/app/api/admin/promote-hits/route.ts` | `dreamHits`, `dreamHitPromotions`, `dreamers`, `ownerProfiles`, `personalHitMappings`, `personalHitEvents` | Read/write | Firestore direct | high | Avoid until hit-memory design final | Promotion logic is a source of legacy repaired/misattributed rows. |
| `src/app/api/admin/audit-hit-counts/route.ts` | `personalHitMappings` | Read/write repair | Firestore direct | high | Avoid until hit-memory design final | Broad audit/repair route over aggregate memory. |
| `src/app/api/admin/rebuild-hit-memory/route.ts` | `personalHitEvents`, `backtestHits`, `dreamHits`, `personalHitMappings` | Read/write rebuild | Firestore direct | high | Avoid until hit-memory design final | Rebuilds aggregates from old event/hit ledgers. |
| `src/app/api/admin/repair-backtest-memory/route.ts` | `backtestHits`, `personalHitEvents`, `dreamers`, `ownerProfiles`, `personalHitMappings` | Read/write | Firestore direct | high | Avoid until hit-memory design final | Promotes backtest hits into memory. |
| `src/app/api/admin/repair-hit-memory/route.ts` | `activeDreamWindows`, `termNumberMappings`, `dreamHits`, `dreamHitPromotions`, `dreamers`, `ownerProfiles`, `personalHitMappings` | Read/write | Firestore direct | high | Avoid until hit-memory design final | Mixes dictionary backfill and hit promotion. |
| `src/app/api/admin/repair-dreamer-attribution/route.ts` | `backtestDreams`, `backtestHits`, `personalHitEvents`, `personalHitMappings`, `termNumberMappings` | Read/write/shadow | Firestore direct | high | Avoid until hit-memory design final | Specifically touches misattributed owner-self/shadow rows. |
| `src/app/api/admin/audit-dreamer-attribution/route.ts` | `backtestDreams`, dynamic hit/memory collections, `dreamHits`, `termNumberMappings` | Read/audit | Firestore direct | high | Avoid until hit-memory design final | Attribution audit over legacy data. |
| `src/app/api/admin/repair-dictionary/route.ts` | `dreamEntries`, `backtestDreams`, `personalHitMappings`, `termNumberMappings` | Read/write | Firestore direct | high | After dictionary/hit-memory plan | Dictionary repair uses hit-memory fallback. |
| `src/app/api/admin/reset/route.ts` | `activeDreamWindows`, `dreamHits`, `dreamHitPromotions`, `personalHitEvents`, `personalHitMappings`, `termNumberMappings`, `pinnedPlays`, `backtestDreams`, `backtestHits`, `backtestSummaries`, `dreamers` | Delete/update | Firestore direct | high | Avoid for Postgres until admin reset policy exists | Destructive broad reset. |
| `src/app/api/admin/save-playlist-candidates/route.ts` | `activeDreamWindows`, `statePlaylistCandidates`, `personalHitEvents`, `statePlaylistHits` | Read/write | Firestore direct | high | After hit-memory and playlists design | Depends on windows and event proof. |
| `src/app/api/admin/playlist-hits/route.ts` | `statePlaylistHits`, `statePlaylistCandidates`, `personalHitEvents` | Read/write | Firestore direct | high | After hit-memory and playlists design | Backfills playlist hits from event proof. |
| `src/lib/engine/dreamRefresh.ts` | `activeDreamWindows`, `dreamHits`, `personalHitEvents`, `personalHitMappings` | Read/write/update | Firestore direct | high | Hit-memory phase | Core live hit detection and promotion module. |
| `src/lib/intelligence/hitClassification.ts` | `backtestDreams`, `dreamEntries`, `activeDreamWindows` | Read helpers | Firestore direct | moderate | Phase 3 | Mostly lookup helpers; risky because used by hit writers. |
| `src/lib/firebase/firestore.ts` | Many Firestore collections | Read/write/delete | Legacy client Firestore helper | high | Decommission last | Keep as Firebase adapter/legacy reference until route migration completes. |
| `src/app/dreams/new/NewDreamPageClient.tsx` | imports `@/lib/firebase/firestore` `listDreamers` | Client read helper import | Firestore client direct | safe | Phase 1 | Replace with `/api/dreamers` or storage-backed API; not an API route. |
| `src/app/api/backtest/list-dreams/route.ts` | `ownerProfiles`, `dreamers` | Firebase-only display-name fallback | Adapter-backed route with Firebase fallback | safe | Phase 1 polish | Postgres core list is migrated; Firebase fallback only runs in firebase mode. |
| `src/app/api/dictionary/terms/route.ts` | `personalHitMappings` | Firebase-only optional read for `includeHits=true` | Partially adapter-backed | high for hit enrichment | Hit-memory phase | Postgres terms work; hit enrichment intentionally not migrated. |

## High-Risk Hit Memory Layer

Do not migrate these until the new hit-memory model is finalized:

- `/api/backtest/save-engine-replay-hits`
- `/api/dreams/refresh`
- `/api/dreams/hits`
- `/api/fell-before`
- `/api/fell-before/events`
- `/api/playlists/evidence-backed`
- `/api/admin/promote-hits`
- `/api/admin/audit-hit-counts`
- `/api/admin/rebuild-hit-memory`
- `/api/admin/repair-backtest-memory`
- `/api/admin/repair-hit-memory`
- `/api/admin/repair-dreamer-attribution`
- `/api/admin/audit-dreamer-attribution`
- `/api/admin/save-playlist-candidates`
- `/api/admin/playlist-hits`
- `src/lib/engine/dreamRefresh.ts`

Collections involved:

- `dreamHits`
- `personalHitEvents`
- `personalHitMappings`
- `backtestHits`
- `backtestSummaries`
- `dreamHitPromotions`
- `statePlaylistCandidates`
- `statePlaylistHits`

These collections are where old Firestore data is most likely to contain duplicate memory rows, owner-self attribution mistakes, repaired rows, and shadowed rows.

## Safe Next Candidates

Likely safe before hit-memory migration:

1. `/api/owner-profile`
   - Small owner-scoped profile read/write.
   - Can map to `owners.displayName`, `owners.email`, and `owners.metadata`.

2. `src/app/dreams/new/NewDreamPageClient.tsx`
   - Remove direct client import from `@/lib/firebase/firestore`.
   - Use `/api/dreamers` instead.

3. `/api/pinned-plays`
   - Isolated `pinnedPlays` CRUD, moderate risk.
   - Migrate only after checking whether pinned plays embed hit evidence assumptions.

4. `/api/engine/status`
   - No Firestore direct access found.
   - Could stay as-is; not a storage migration blocker.

5. Backtest result route work, if a route is later identified or added.
   - Postgres helpers for `backtest_results` already exist.
   - Keep separate from replay hit writes.

## Routes To Avoid Until Hit-Memory Design Is Final

- `/api/backtest/save-engine-replay-hits`
- `/api/dreams/refresh`
- `/api/fell-before`
- `/api/fell-before/events`
- `/api/dreams/hits`
- `/api/playlists/evidence-backed`
- admin repair/rebuild/promote/audit hit routes
- playlist evidence/hit routes depending on `personalHitEvents`

## Recommended Migration Order

1. Owner profile.
2. Remove remaining client-side direct Firestore dreamer import from the new dream page.
3. Pinned plays CRUD, if confirmed independent from hit memory.
4. Backtest results route exposure, if needed, using existing Postgres helper coverage.
5. Design the clean Postgres hit-memory model before migrating any hit routes.
6. Implement live hit event writes from clean Postgres windows/results only.
7. Implement backtest replay hit writes and summaries.
8. Implement fell-before reads from the new event/aggregate model.
9. Rebuild playlist evidence from clean Postgres event proof.
10. Revisit admin repair/reset routes last; prefer new narrow admin tools over porting broad Firestore repair scripts.

## Missing Postgres Storage Implementations

Still throwing or intentionally unsupported in `src/lib/storage/postgres/index.ts`:

| Adapter area | Missing functions | Notes |
| --- | --- | --- |
| `dreamHits` | `createDreamHit`, `listDreamHits`, `upsertPersonalHitMapping`, `listPersonalHitMappings`, `deletePersonalHitMappingById` | Core hit-memory layer. Do not migrate until design is final. |
| `backtests` | `listAllBacktestHits`, `runBacktestReplayForDream`, `listSafeBacktestSummariesForDreams`, `saveEngineReplayHits` | Replay/hit-memory/summaries. Avoid until replay result and hit model are defined. |
| `fellBefore` | `listLotteryResults`, `listLotteryResultsByDateRange`, `createLotteryResult`, `bulkCreateLotteryResults`, `deleteLotteryResultById` | Covers lottery result ingestion and fell-before dependencies. Not migrated yet. |

Partially implemented:

- `backtests.bulkCreateBacktestResults` and `backtests.listBacktestResultsForDream` have Postgres helper coverage, but no active route was migrated in the result-storage pass.
- `dictionary` has Postgres term-number mapping support, but `includeHits=true` enrichment remains Firebase-only because `personalHitMappings` is not migrated.

## Inventory Notes

- `src/lib/storage/firebase/**` intentionally touches Firestore; this is the Firebase provider side of the adapter and not itself a migration gap.
- Backup files such as `*.bak`, `*.before-*`, and duplicate Firestore helper backups were not treated as runtime routes, but should eventually be cleaned up separately.
- Firebase Auth remains out of scope for storage migration.
