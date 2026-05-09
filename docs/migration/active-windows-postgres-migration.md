# Active Windows Postgres Migration

Active dream window read routes are now routed through the storage adapter.

## Routes Migrated

Migrated behind `src/lib/storage/dreamWindows`:

- `GET /api/dreams/windows`
- `GET /api/dreams/window-groups`

This migration is read-only. It does not write hits, call the lottery engine, or refresh windows.

## Postgres Mode

When `DREAM_DB_PROVIDER=postgres`, the active-window routes read from:

- `active_dream_windows`

The Postgres adapter uses Prisma and always scopes reads by `ownerUid`. Optional filters also stay owner-scoped:

- `ownerUid + dreamerId`
- `ownerUid + dreamEntryId`
- `ownerUid + gameType`

Numbers are returned as strings from `number_text` as the API-facing `number` field, preserving leading zeros.

## Owner-Self Handling

`owner-self` remains a virtual dreamer scope. The Postgres adapter does not require or create a `Dreamer` row with id `owner-self`.

Owner/self windows are matched by:

- `ownerUid`
- `dreamerId = "owner-self"`

## Firebase Mode

`DREAM_DB_PROVIDER` defaults to `firebase`.

In firebase mode, the routes still read the existing Firestore `activeDreamWindows` collection through Firebase Admin. The response envelopes remain the same:

- `/api/dreams/windows` returns `windows`, counts, filter metadata, and cap fields.
- `/api/dreams/window-groups` returns grouped windows, totals, breakdowns, warnings, and filters.

## Intentionally Not Migrated

These routes and domains remain Firebase/Firestore-backed or untouched:

- `/api/dreams/refresh`
- `/api/dreams/hits`
- `/api/fell-before`
- `/api/backtest`
- dream hits
- personal hit events
- personal hit mappings
- dictionaries
- playlists
- admin repair routes

## Testing

Firebase mode:

1. Keep `DREAM_DB_PROVIDER=firebase`.
2. Call `/api/dreams/windows?ownerUid=...`.
3. Call `/api/dreams/window-groups?ownerUid=...`.
4. Confirm response shapes match the previous route behavior.

Postgres mode:

1. Set `DREAM_DB_PROVIDER=postgres` in a non-production environment.
2. Save a dream through `/api/dreams/save-entry` so `active_dream_windows` rows exist.
3. Call `/api/dreams/windows?ownerUid=...`.
4. Call `/api/dreams/windows?ownerUid=...&dreamerId=owner-self`.
5. Call `/api/dreams/window-groups?ownerUid=...`.
6. Confirm owner-scoped rows are returned and leading-zero numbers remain strings.

## Guardrails

- Do not bulk-import old Firestore active windows.
- Do not enable Postgres mode in production until this read path is smoke-tested against Railway.
- Do not migrate refresh or hit detection behavior in this pass.
- Do not delete Firestore data.
