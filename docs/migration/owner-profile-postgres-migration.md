# Owner Profile Postgres Migration

## Scope

Migrated only `/api/owner-profile` behind the storage adapter.

Firebase Auth remains unchanged. Firestore `ownerProfiles` documents are not deleted or imported.

## Firebase Mode

`DREAM_DB_PROVIDER=firebase` remains the default. In Firebase mode, the route delegates to `src/lib/storage/firebase/ownerProfiles.ts`, which continues to read and merge-write `ownerProfiles/{ownerUid}` with the existing response shape:

- `GET`: `{ ok: true, profile: { ownerUid, displayName, updatedAt } }`
- missing profile: `displayName: ''`, `updatedAt: null`
- `PATCH`: `{ ok: true, displayName }`

## Postgres Mode

When `DREAM_DB_PROVIDER=postgres`, the route delegates to `src/lib/storage/postgres/ownerProfiles.ts` and uses only the `owners` table.

Mapping:

- `Owner.uid` stores `ownerUid`
- `Owner.displayName` stores `displayName`
- `Owner.email` stores `email` when supplied
- `Owner.metadata` stores extra profile fields supplied in PATCH bodies
- `Owner.updatedAt` is returned as an ISO string

Postgres mode uses `upsert` so the owner row is created when the profile is first saved.

## Not Migrated

This pass does not touch:

- dreamers
- dreams
- hits or hit memory
- backtests
- fell-before
- playlists
- admin routes
- Firebase Auth
- Firestore `ownerProfiles`

## Test Plan

Firebase mode:

1. Ensure `DREAM_DB_PROVIDER` is unset or `firebase`.
2. `GET /api/owner-profile?ownerUid=<uid>` should read Firestore.
3. `PATCH /api/owner-profile` with `{ "ownerUid": "<uid>", "displayName": "Name" }` should merge-write Firestore and return the same response shape.

Postgres mode:

1. Set `DREAM_DB_PROVIDER=postgres`.
2. `GET /api/owner-profile?ownerUid=<uid>` should return defaults when no owner row exists.
3. `PATCH /api/owner-profile` should upsert `owners.uid`, `owners.display_name`, optional `owners.email`, and optional `owners.metadata`.
4. A later `GET` should return the saved `displayName` and `updatedAt`.
