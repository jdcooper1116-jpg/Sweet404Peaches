# Hit Evidence Service Skeleton Plan

## Scope

This pass adds pure helper modules only:

- `src/lib/evidence/hitEvidenceTypes.ts`
- `src/lib/evidence/hitEvidenceKeys.ts`
- `src/lib/evidence/hitEvidenceService.ts`
- `src/lib/evidence/hitEvidenceCards.ts`

No routes call these helpers yet. No storage adapters, Prisma schema, or database writes were changed.

## Helper Coverage

Implemented helpers:

- `buildBacktestHitSourceContextId`
- `buildLiveHitSourceContextId`
- `buildCanonicalHitEventKey`
- `normalizeHitType`
- `sortedDigits`
- `buildBoxedKey`
- `choosePrimaryHitType`
- `groupHitCardsByCanonicalIdentity`
- `validateHitEvidenceInput`
- `resolveHitDreamer`

## Design Notes

`personal_hit_events` remains the future canonical event ledger. These helpers only prepare stable identities, validation, attribution resolution, and card grouping behavior.

`owner-self` is allowed as an explicit virtual scope or as a final fallback only when `allowOwnerSelfFallback` is true. A real dreamer id from explicit payload, dream entry, backtest dream, or active window wins before owner-self fallback.

`normalizeHitType("both")` resolves to `exact` by default because exact supersedes box for one real draw card unless analytics explicitly need separate exact and box rows.

All number helpers operate on strings. They do not parse integers.

## Documented Examples

These examples are covered by the pure helper behavior and should become automated tests when a test runner is added.

```ts
sortedDigits("028") === "028";
buildBoxedKey("0019") === "0019";
buildBoxedKey("820") === buildBoxedKey("028");
choosePrimaryHitType(["box", "exact"]) === "exact";

buildBacktestHitSourceContextId({
  backtestDreamId: "bt-1",
  normalizedTerm: "sunshine",
  numberText: "028",
  gameType: "cash3",
  state: "GA",
  drawDate: "2026-05-09",
  drawTime: "midday",
  normalizedResult: "028",
  hitType: "exact",
}) === buildBacktestHitSourceContextId({
  backtestDreamId: "bt-1",
  normalizedTerm: "sunshine",
  numberText: "028",
  gameType: "cash3",
  state: "GA",
  drawDate: "2026-05-09",
  drawTime: "midday",
  normalizedResult: "028",
  hitType: "exact",
});

validateHitEvidenceInput({ dreamerId: "Sunshine" }).ok === false;
validateHitEvidenceInput({ ownerUid: "owner-1" }).ok === false;

resolveHitDreamer({
  explicit: { dreamerId: "owner-self" },
})?.dreamerId === "owner-self";

resolveHitDreamer({
  explicit: { dreamerId: "Sunshine", dreamerName: "Sunshine" },
  activeWindow: { dreamerId: "owner-self" },
})?.dreamerId === "Sunshine";
```

Card grouping example:

```ts
groupHitCardsByCanonicalIdentity([
  { ...sameRealDraw, hitType: "box" },
  { ...sameRealDraw, hitType: "exact" },
])[0].hitType === "exact";
```

## Next Step

Before wiring any route, add storage functions and service tests around idempotent backtest replay writes. The safest first runtime integration remains `/api/backtest/save-engine-replay-hits`, after this service owns event identity and aggregate behavior.

Still not migrated:

- `/api/backtest/save-engine-replay-hits`
- `/api/dreams/refresh`
- `/api/fell-before`
- hit-memory writes
- Prisma schema changes
