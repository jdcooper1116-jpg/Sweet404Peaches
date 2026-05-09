# New Dream Page Dreamer Fetch Cleanup

## Scope

Updated only `src/app/dreams/new/NewDreamPageClient.tsx`.

## Firebase Dependency Removed

The New Dream page no longer imports `listDreamers` from `@/lib/firebase/firestore` in the browser bundle. It now loads dreamers through:

`GET /api/dreamers?ownerUid=<ownerUid>`

## Why `/api/dreamers`

`/api/dreamers` is already storage-adapter backed. Keeping the New Dream page behind that route means dreamer selection works in both modes:

- `DREAM_DB_PROVIDER=firebase`: `/api/dreamers` reads the existing Firebase-backed storage adapter.
- `DREAM_DB_PROVIDER=postgres`: `/api/dreamers` reads Railway Postgres through Prisma.

The client component no longer needs to know which database provider is active.

## Behavior Preserved

The page still:

- shows the owner-self option as `Me / Owner Journal`
- keeps `owner-self` as the default selected dreamer
- preserves URL query dreamer preselection
- preserves the selected dreamer detail card
- treats dreamer loading failures as non-critical and logs them
- keeps the same save-entry request path and payload behavior

## Intentionally Not Changed

This pass does not touch:

- `/api/dreamers`
- `/api/dreams/save-entry`
- dream entries
- active windows
- dictionary terms
- hits or hit memory
- fell-before
- backtests
- playlists
- admin routes
- database schema or storage adapter implementations
