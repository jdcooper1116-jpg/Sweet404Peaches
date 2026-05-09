# Railway Postgres Migration Inventory

First-pass inventory for moving Sweet404Peaches dream, active-window, hit-memory, fell-before, dictionary, and backtest persistence from Firestore to Railway Postgres.

Scope notes:
- This is an inventory only. No runtime behavior has been changed.
- Firebase Auth should remain Firebase.
- Existing dreamer attribution, fell-before, active window, backtest, dictionary repair, and owner-self fallback behavior must be preserved during migration.
- Current app uses Next App Router route handlers under `src/app/api/**`.

## Collection Decision Summary

| Firestore collection | Current purpose | Migration decision |
| --- | --- | --- |
| `dreamEntries` | Live dream journal records and parsed term mappings. | Move to Postgres. Core relational dream data. |
| `dreamers` | Dreamer profiles per owner. | Move to Postgres. Keep Firebase Auth UID as external owner key. |
| `activeDreamWindows` | Per dream, term, number, game, active date window; high-read operational set. | Move to Postgres first. Likely quota driver. |
| `dreamHits` | Live detected hit events from active windows/results refresh. | Move to Postgres first. Likely quota driver. |
| `backtestDreams` | Historical dream intake records. | Move to Postgres. |
| `backtestWindows` | Backtest window metadata by backtest dream. | Move to Postgres. Could be merged into `backtest_dreams` plus child rows. |
| `backtestResults` | Historical lottery result rows attached to backtest dreams. | Move to Postgres. High-volume when pasted/imported. |
| `backtestHits` | Event-level replay hits. | Move to Postgres first with hit memory. High-volume writes. |
| `backtestSummaries` | Per-backtest aggregate summary. | Move to Postgres, derived/rebuildable but useful to store. |
| `personalHitEvents` | Idempotent event ledger for fell-before evidence. | Move to Postgres first. Critical constraint table. |
| `personalHitMappings` | Aggregated fell-before memory rows. | Move to Postgres first. Critical user-facing aggregate. |
| `termNumberMappings` | Universal dictionary rows. | Move to Postgres first or second. Needs canonical uniqueness. |
| `dreamHitPromotions` | Idempotency registry for promoting `dreamHits`. | Retire after Postgres if `personal_hit_events` has canonical unique constraints. |
| `ownerProfiles` | Owner display name/email and owner-self fallback display. | Can remain Firebase initially or move later. Firebase Auth stays; profile can be mirrored in Postgres if needed for joins. |
| `lotteryResults`, `pinnedPlays`, `statePlaylistCandidates`, `statePlaylistHits` | Adjacent operational data used by refresh/playlists. | Not primary scope, but several dream/hit routes touch them. Consider moving with active-window intelligence if quota remains. |

## Direct Firestore Touch Points

| File | Collections read | Collections written/deleted | Volume | Migration decision | Notes |
| --- | --- | --- | --- | --- | --- |
| `src/lib/firebase/firestore.ts` | `ownerProfiles`, `dreamers`, `dreamEntries`, `activeDreamWindows`, `lotteryResults`, `dreamHits`, `personalHitMappings`, `termNumberMappings`, `pinnedPlays`, `backtestDreams`, `backtestResults`, `backtestHits`, `backtestSummaries`, dynamic reset collections | Same plus deletes/resets; `backtestWindows` writes | High | Move dream/hit/backtest/dictionary functions to Postgres; keep Firebase Auth/config | Legacy client Firestore helper and backtest helper. Contains cascades, resets, owner display migration, owner-self normalization, hit scanning, backtest replay persistence. |
| `src/lib/engine/dreamRefresh.ts` | `activeDreamWindows`, `dreamHits`, `personalHitEvents` | `dreamHits`, `personalHitEvents`, `personalHitMappings`, `activeDreamWindows` updates | High | Migrate first | Main refresh pipeline. Reads all active windows for owner/date, detects hits, writes event ledger and aggregates, updates window counters. |
| `src/lib/intelligence/hitClassification.ts` | `backtestDreams`, `dreamEntries`, `activeDreamWindows` | None | Low | Move lookup reads to Postgres with canonical ID helpers retained | Provides canonical IDs and source lookup helpers for hit attribution. |
| `src/lib/firebase/admin.ts` | Admin SDK setup/owner UID resolution | None directly | Low | Keep Firebase Admin for Auth/admin setup initially | Not a data migration target by itself. |
| `src/lib/firebase/config.ts` | Client Firestore config | None directly | Low | Keep while legacy client Firestore helper remains; eventually remove Firestore client usage | Do not remove Firebase Auth. |
| `src/app/api/dreamers/route.ts` | `dreamers` | `dreamers` | Low | Move to Postgres | Profile list/create. Cacheable, low volume. |
| `src/app/api/dreams/entries/route.ts` | `dreamEntries` | None | Medium | Move to Postgres | Journal list; capped to 1000. |
| `src/app/api/dreams/latest/route.ts` | `dreamEntries` | None | Medium | Move to Postgres | Called by forecast/daily/chat/dashboard contexts. |
| `src/app/api/dreams/save-entry/route.ts` | None | `dreamEntries`, `activeDreamWindows`, `termNumberMappings` | Medium on use, write-amplified | Move to Postgres | One dream creates many active-window and dictionary rows. Preserves provided dreamer attribution; defaults `dreamerId` to `owner-self` and does not hardcode `dreamerName`. |
| `src/app/api/dreams/windows/route.ts` | `activeDreamWindows` | None | High | Move first | Active-window list for dashboards. Broad owner query plus active date filter likely contributes to quota/index pressure. |
| `src/app/api/dreams/window-groups/route.ts` | `dreamers`, `activeDreamWindows` | None | High | Move first | Queries per dreamer with caps and owner-self fallback. High read fan-out. |
| `src/app/api/dreams/hits/route.ts` | `dreamHits` | None | Medium | Move with hit tables | Capped hit browser. |
| `src/app/api/dreams/refresh/route.ts` | Indirect via `refreshAllActiveWindows`: `activeDreamWindows`, `dreamHits`, `personalHitEvents` | Indirect writes to `dreamHits`, `personalHitEvents`, `personalHitMappings`, `activeDreamWindows`; also calls `/api/admin/promote-hits` | High | Move first | Cron/manual refresh route. Major quota risk because it scans active windows and can write multiple collections. |
| `src/app/api/backtest/list-dreams/route.ts` | `backtestDreams`, `ownerProfiles`, `dreamers` | None | Medium | Move to Postgres | Resolves missing dreamer names; owner-self displays from owner profile. |
| `src/app/api/backtest/dream-detail/route.ts` | `backtestDreams`, `backtestHits`, `backtestSummaries` | None | Medium/High for large dreams | Move with backtest hits | Reads up to 2000 hits for one dream. |
| `src/app/api/backtest/save-dream-intake/route.ts` | None | `backtestDreams`, `backtestWindows`, `termNumberMappings` | Medium write-amplified | Move to Postgres | Defaults missing dreamer to `owner-self`; writes dreamer-scoped dictionary rows. |
| `src/app/api/backtest/save-engine-replay-hits/route.ts` | `backtestDreams`, `personalHitEvents` | `backtestHits`, `personalHitEvents`, `personalHitMappings`, `backtestSummaries`, `backtestDreams`, `backtestWindows` | High | Move first | Critical idempotent hit-memory path. Resolves dreamer from body then `backtestDreams`, finally `owner-self`. |
| `src/app/api/backtest/engine-replay/route.ts` | None | None | High external engine, no Firestore | No Firestore migration needed | Calls Railway lottery engine and returns mapped hits. Persistence happens in save route. |
| `src/app/api/backtest/route.ts` | None active; comments mention future hook | None | High external engine, no Firestore | No Firestore migration needed | All-states engine bridge only. |
| `src/app/api/fell-before/route.ts` | `personalHitMappings` | None | High user-facing read | Move first | Fell-before browse/targeted lookup. Uses targeted term/number queries to avoid capped misses. |
| `src/app/api/fell-before/events/route.ts` | `backtestHits`, `dreamHits`, `personalHitEvents` | None | Medium, can spike | Move with hit events | Evidence drilldown. Runs several parallel collection queries and dedups semantically. |
| `src/app/api/dictionary/terms/route.ts` | `termNumberMappings`, optionally `personalHitMappings` | `termNumberMappings` | Medium/High | Move early | Dictionary page reads may include 500 hit-memory rows. Applies owner-self fallback in expanded legacy docs. |
| `src/app/api/playlists/evidence-backed/route.ts` | `dreamers`, `activeDreamWindows`, `personalHitEvents` | None | High | Move after active windows/events | Active-window intelligence route. Per-dreamer active-window fan-out plus per-term event lookups. |
| `src/app/api/admin/promote-hits/route.ts` | `dreamHits`, `dreamHitPromotions`, `dreamers`, `ownerProfiles` | `personalHitMappings`, `personalHitEvents`, `dreamHitPromotions` | High when run | Migrate first or retire after event constraints | Promotion path can duplicate effort with `dreamRefresh.ts`; must preserve idempotency and dreamer name resolution. |
| `src/app/api/admin/repair-hit-memory/route.ts` | `activeDreamWindows`, `dreamHits`, `dreamHitPromotions`, `dreamers`, `ownerProfiles` | `termNumberMappings`, `personalHitMappings`, `dreamHitPromotions` | High admin | Migrate/replace with SQL repair job | Backfills dictionary and hit memory. Owner-self/profile fallback. |
| `src/app/api/admin/repair-backtest-memory/route.ts` | `backtestHits`, `personalHitEvents`, `dreamers`, `ownerProfiles` | `personalHitEvents`, `personalHitMappings` | High admin | Migrate/replace with SQL repair job | Promotes backtest hits with event idempotency. |
| `src/app/api/admin/rebuild-hit-memory/route.ts` | `personalHitEvents`, `backtestHits`, `dreamHits`, `personalHitMappings` | `personalHitMappings` | High admin | Migrate/replace with SQL aggregate rebuild | Rebuilds aggregates from event ledgers. Reads same collections twice for term variants. |
| `src/app/api/admin/audit-hit-counts/route.ts` | `personalHitMappings` | Optional `personalHitMappings` repair/deprecation | Medium admin | Migrate/replace with SQL audit | Detects duplicate semantic aggregate rows. |
| `src/app/api/admin/audit-dreamer-attribution/route.ts` | `backtestDreams`, `backtestHits`, `personalHitEvents`, `personalHitMappings`, `dreamHits`, `termNumberMappings` | None | Medium/High admin | Migrate/replace with SQL audit | Per-backtest targeted attribution audit. |
| `src/app/api/admin/repair-dreamer-attribution/route.ts` | `backtestDreams`, `backtestHits`, `personalHitEvents`, `personalHitMappings` | `backtestHits`, `personalHitEvents`, `personalHitMappings`, `termNumberMappings` | High admin | Migrate/replace with SQL repair | Corrects misattributed backtest rows and shadows bad aggregates. High dreamer attribution sensitivity. |
| `src/app/api/admin/repair-dictionary/route.ts` | `dreamEntries`, `backtestDreams`, `personalHitMappings` | `termNumberMappings` | High admin | Migrate/replace with SQL repair | Rebuilds dictionary from source dreams and hit memory. |
| `src/app/api/admin/reset/route.ts` | Target collections by owner | Deletes target collections; updates `backtestDreams` statuses | High/destructive admin | Reimplement carefully after Postgres schema | Non-destructive migration work should not run this. Preserves dictionaries except factory scope. |
| `src/app/api/admin/save-playlist-candidates/route.ts` | `activeDreamWindows`, `personalHitEvents` | `statePlaylistCandidates`, `statePlaylistHits` | Medium/High admin | Move later if playlists migrate | Adjacent active-window intelligence. |
| `src/app/api/admin/playlist-hits/route.ts` | `statePlaylistHits`, `statePlaylistCandidates`, `personalHitEvents` | `statePlaylistHits` | Medium admin | Move later if playlists migrate | Playlist hit backfill. |
| `src/app/api/owner-profile/route.ts` | `ownerProfiles` | `ownerProfiles` | Low | Can remain Firebase initially | Supports owner-self display fallback. |
| `src/app/api/pinned-plays/route.ts` | `pinnedPlays` | `pinnedPlays` | Low/Medium | Out of first-pass dream/hit scope | Adjacent recommendations data. |
| `src/app/dreams/new/NewDreamPageClient.tsx` | Indirect client helper reads `dreamers` through `listDreamers` | None | Low | Replace with API/Postgres query eventually | Only current source file importing `@/lib/firebase/firestore` directly outside helper. |

## Likely Firebase Quota Exhaustion Contributors

Highest-risk routes and modules:
- `src/app/api/dreams/refresh/route.ts` plus `src/lib/engine/dreamRefresh.ts`: scans active windows, reads existing hits/events, writes `dreamHits`, `personalHitEvents`, `personalHitMappings`, and updates windows.
- `src/app/api/dreams/window-groups/route.ts`: loops over every dreamer and runs a separate `activeDreamWindows` query per dreamer.
- `src/app/api/playlists/evidence-backed/route.ts`: reads active windows per dreamer, then runs per-term `personalHitEvents` lookups.
- `src/app/api/backtest/save-engine-replay-hits/route.ts`: writes event-level and aggregate hit memory in batches.
- `src/app/api/admin/rebuild-hit-memory/route.ts`, `repair-dreamer-attribution`, `repair-hit-memory`, `repair-backtest-memory`, and `repair-dictionary`: intentionally broad admin scans and bulk writes.
- `src/app/api/backtest/dream-detail/route.ts`: capped at 2000 `backtestHits` for one dream.
- `src/app/api/fell-before/events/route.ts`: multiple parallel queries across `backtestHits`, `dreamHits`, and `personalHitEvents`.
- `src/app/api/dictionary/terms/route.ts`: dictionary load can also read up to 500 `personalHitMappings`.

## Owner-Self Fallback Logic To Preserve

- `owner-self` is used as the fallback `dreamerId` for owner dreams in live dream save, backtest intake, dictionary rows, hit rows, and legacy expansion.
- Display names are resolved from:
  - explicit `dreamerName` on the row,
  - `dreamers/{dreamerId}` when `dreamerId` is not `owner-self`,
  - `ownerProfiles/{ownerUid}.displayName` for `owner-self`,
  - final string fallback such as `Owner / Self`, `Sweet404Peaches`, or the `dreamerId`.
- `src/app/api/dreams/window-groups/route.ts` and `src/app/api/playlists/evidence-backed/route.ts` inject an `owner-self` pseudo-dreamer when no dreamer document exists.
- `src/app/api/dictionary/terms/route.ts` expands legacy dictionary docs and assigns `owner-self` before in-memory dreamer filtering. A direct SQL filter must reproduce this legacy fallback or explicitly backfill first.
- `src/app/api/backtest/save-engine-replay-hits/route.ts` resolves dreamer scope from request body, then `backtestDreams`, then `owner-self`. This order is important.
- `src/app/api/admin/promote-hits/route.ts`, `repair-hit-memory`, and `repair-backtest-memory` resolve missing dreamer names via dreamer docs and owner profiles.

## Dreamer Attribution Risks

- Backtest hit-memory rows can be misattributed to `owner-self` if replay save callers omit `dreamerId` and `backtestDreams` lookup fails.
- Existing repair routes imply known historical issues where `personalHitEvents`, `personalHitMappings`, and `backtestHits` used `owner-self` for rows that belonged to selected dreamers.
- `dreamHits` and older routes use mixed field names: `dreamEntryId`, `sourceDreamEntryId`, `activeWindowId`, `dreamWindowId`, `number`, `candidate`, `candidateNumber`, `winningNumber`, `normalizedResult`.
- `src/app/api/dreams/hits/route.ts` filters by `dreamEntryId`, but some hit records use `sourceDreamEntryId`; migration should normalize this.
- Dictionary rows have at least two shapes: flat rows and parsed shape arrays. Migration should either expand to canonical rows or preserve a JSON source payload plus canonical child rows.
- Some code hardcodes display fallback strings (`Sweet404Peaches`, `Owner / Self`) while newer code avoids hardcoding dreamer names. Postgres should store stable `dreamer_id` and treat display name as denormalized/cache only.
- Aggregate `personalHitMappings` can drift because several routes write it. `personalHitEvents` should become the source of truth, with SQL aggregates rebuilt deterministically.

## Routes To Migrate First

1. `src/lib/engine/dreamRefresh.ts` and `src/app/api/dreams/refresh/route.ts`.
2. `src/app/api/dreams/windows/route.ts` and `src/app/api/dreams/window-groups/route.ts`.
3. `src/app/api/backtest/save-engine-replay-hits/route.ts`.
4. `src/app/api/fell-before/route.ts` and `src/app/api/fell-before/events/route.ts`.
5. `src/app/api/dictionary/terms/route.ts`.
6. Admin repair/audit routes that operate on the migrated tables: `promote-hits`, `repair-hit-memory`, `repair-backtest-memory`, `rebuild-hit-memory`, `audit-hit-counts`, `audit-dreamer-attribution`, `repair-dreamer-attribution`, `repair-dictionary`.
7. Backtest intake/detail/list routes.
8. Live dream intake/list/latest and dreamer profile routes.

## Postgres Indexes And Constraints Needed

Owners/auth:
- Keep Firebase Auth UID as `owner_uid text not null`.
- Add `owners(owner_uid primary key, display_name, email, created_at, updated_at)` if owner profile moves to Postgres.

Dreamers:
- `dreamers(id primary key, owner_uid, display_name, alias, is_guest, created_at, updated_at)`.
- Index `(owner_uid, display_name)`.
- Optional unique `(owner_uid, lower(display_name))` if duplicate display names should be prevented.

Dream entries:
- `dream_entries(id primary key, owner_uid, dreamer_id, dreamer_name_snapshot, dream_date, raw_text, cleaned_text, source_type, notes, uploaded_at)`.
- Index `(owner_uid, dream_date desc)`.
- Index `(owner_uid, dreamer_id, dream_date desc)`.
- Foreign key `(owner_uid, dreamer_id)` to `dreamers` where possible, with special handling for `owner-self`.

Active dream windows:
- `active_dream_windows(id primary key, owner_uid, dream_entry_id, dreamer_id, dreamer_name_snapshot, term_label, normalized_term, number text, boxed_key, game_type, active_start, active_end, is_active, states_tracked jsonb, last_checked_at, last_hit_count, new_hits_since_last_check)`.
- Index `(owner_uid, is_active, active_end)`.
- Index `(owner_uid, dreamer_id, active_end)`.
- Index `(owner_uid, dream_entry_id)`.
- Index `(owner_uid, normalized_term, number, game_type)`.
- Preserve numbers as text to keep leading zeros.

Hit events:
- `dream_hits` unique semantic key on `(owner_uid, source_dream_entry_id, dreamer_id, number, game_type, state, draw_date, draw_time, hit_type, normalized_result)`.
- `backtest_hits` unique semantic key on `(owner_uid, backtest_dream_id, dreamer_id, normalized_term, number, game_type, state, draw_date, draw_time, hit_type, normalized_result)`.
- Index `(owner_uid, dreamer_id, draw_date desc)`, `(owner_uid, normalized_term)`, `(owner_uid, number, game_type, state)`, `(owner_uid, backtest_dream_id)`.

Personal hit memory:
- `personal_hit_events` should be the idempotency ledger with unique `(owner_uid, dreamer_id, normalized_term, number, game_type, state, draw_date, draw_time, hit_type, source_context_id)`.
- `personal_hit_mappings` should have unique `(owner_uid, dreamer_id, normalized_term, number, game_type, state)`.
- Index `(owner_uid, normalized_term)`, `(owner_uid, term_label)`, `(owner_uid, number)`, `(owner_uid, dreamer_id)`, `(owner_uid, state, game_type)`.
- Consider deriving aggregates from `personal_hit_events` with materialized view or rebuild job rather than many write paths incrementing counters.

Dictionary:
- `term_number_mappings` unique `(owner_uid, dreamer_id, normalized_term, number, game_type)`.
- Index `(owner_uid, dreamer_id)`, `(owner_uid, normalized_term)`, `(owner_uid, number, game_type)`.
- Store `source`, `dream_entry_id`, `backtest_dream_id`, `dream_date`, and `raw_context`/`confidence_basis`.

Backtest:
- `backtest_dreams(id primary key, owner_uid, dreamer_id, dreamer_name_snapshot, dream_date, raw_text, parse_result jsonb, status, replay_source, created_at, updated_at)`.
- `backtest_results(id primary key, owner_uid, backtest_dream_id, state, date, game_type, draw_time, normalized_result, boxed_key, source_type)`.
- `backtest_summaries(backtest_dream_id primary key, owner_uid, total_hits, straight_hits, boxed_hits, unique_states jsonb, best_state, best_term, status, updated_at)`.
- Index `(owner_uid, dreamer_id, dream_date desc)`, `(owner_uid, status)`, `(owner_uid, backtest_dream_id)`.

Audit/repair markers:
- If preserving shadow/deprecation behavior, include boolean columns or metadata JSON for `_suspected_misattributed`, `_shadowed_by_corrected_mapping`, `_deprecated`, `_corrected_to`, and repair source fields.

## Open Migration Questions

- Whether to keep `ownerProfiles` only in Firebase or mirror owner display names in Postgres for attribution joins.
- Whether `backtestWindows` remains a table or becomes columns on `backtest_dreams`.
- Whether `dreamHitPromotions` is retired immediately in favor of `personal_hit_events` unique constraints.
- Whether old dictionary shape-B documents should be migrated as raw JSON only, expanded canonical rows only, or both.
- Whether reset/factory routes should exist against Postgres, and what guardrails they need before reimplementation.
