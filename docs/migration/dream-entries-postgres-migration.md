# Dream Entries Postgres Migration

Dream intake, dream list, and latest dream reads are now routed through the storage adapter.

## Routes Migrated

Migrated behind `src/lib/storage/dreamEntries`:

- `POST /api/dreams/save-entry`
- `GET /api/dreams/entries`
- `GET /api/dreams/latest`

Not migrated:

- `/api/dreams/windows`
- `/api/dreams/window-groups`
- `/api/dreams/refresh`
- `/api/dreams/hits`
- `/api/fell-before`
- `/api/backtest`
- personal hit events
- personal hit mappings
- dream hits
- dictionaries outside of save-entry term-number rows
- admin repair routes
- playlists

## Owner-Self Handling

`owner-self` is treated as a virtual dreamer scope, not as a real `Dreamer` table primary key.

For owner/self dreams, Postgres stores `dreamerId = "owner-self"` on owner-scoped records:

- `dream_entries`
- `dream_terms`
- `dream_candidates`
- `active_dream_windows`
- `term_number_mappings`

Queries must pair `ownerUid + dreamerId`. The migration does not create a global `Dreamer` row with id `owner-self`.

## Tables Written In Postgres Mode

`POST /api/dreams/save-entry` writes inside a Prisma transaction:

- `owners`, using `Owner.uid = ownerUid` if the owner row does not already exist
- `dream_entries`
- `dream_terms`
- `dream_candidates`
- `active_dream_windows`
- `term_number_mappings`

Numbers are stored as strings/text so leading zeros are preserved. Active window dates keep the existing rule: `activeWindowStart = dreamDate`, `activeWindowEnd = dreamDate + 6 days`.

Large pasted dreambook-style entries are bulk inserted. The Postgres adapter deduplicates candidate numbers, active windows, and term-number mappings in memory, then uses `createMany(..., skipDuplicates: true)` in chunks for:

- `dream_candidates`
- `active_dream_windows`
- `term_number_mappings`

`dream_terms` are created first and fetched back so candidate rows can reference the correct term IDs. The save still runs in a single transaction to avoid partially saved dreams, with a 20 second transaction timeout as a backup guard.

## Firebase Mode

`DREAM_DB_PROVIDER` defaults to `firebase`.

In firebase mode, these routes still write and read the existing Firestore collections through Firebase Admin:

- `dreamEntries`
- `activeDreamWindows`
- `termNumberMappings`

The route response envelopes remain unchanged.

## Postgres Mode

When `DREAM_DB_PROVIDER=postgres`, these routes use Prisma through `src/lib/storage/postgres/dreamEntries.ts`.

The Postgres implementation preserves:

- raw dream text
- cleaned text
- dream date
- parsed term mappings
- all candidate numbers as strings
- owner/dreamer scoping
- active window date logic
- latest/list sorting by `dreamDate` desc, then upload time desc

## Testing

Firebase mode:

1. Keep `DREAM_DB_PROVIDER=firebase`.
2. Save a dream through `/api/dreams/save-entry`.
3. Confirm `/api/dreams/entries` and `/api/dreams/latest` return the same response shapes as before.

Postgres mode:

1. Set `DREAM_DB_PROVIDER=postgres` in a non-production environment.
2. Use a Firebase Auth UID as `ownerUid`.
3. Save an owner-self dream with `dreamerId = "owner-self"`.
4. Confirm no `Dreamer` row with id `owner-self` is created.
5. Confirm rows exist in `dream_entries`, `dream_terms`, `dream_candidates`, `active_dream_windows`, and `term_number_mappings`.
6. Confirm `/api/dreams/entries?ownerUid=...&dreamerId=owner-self` and `/api/dreams/latest?ownerUid=...&dreamerId=owner-self` return only that owner's scoped records.

## Guardrails

- Do not bulk-import old Firestore dream data.
- Do not enable Postgres mode in production until this route set has been tested against Railway.
- Do not migrate hit detection or refresh behavior in this pass.
- Do not delete Firestore data.
