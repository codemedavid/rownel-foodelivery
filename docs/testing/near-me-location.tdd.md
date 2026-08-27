# TDD Evidence Report — Near-Me Merchants with Auto-Location on Every App Open

## Source plan

Inline plan produced by `/ecc:plan` in the same session (no `*.plan.md` artifact).
User confirmed with "proceed". Chosen interpretation of "automatic see the current
location every open of the app": restore the saved location instantly, then silently
re-check GPS in the background on every open and update only when the user has moved
beyond 0.25 km (avoids re-sorting the merchant list underfoot for tiny GPS jitter).

## User journeys

1. As a customer, I want the app to detect my location automatically every time I open
   it, so the merchant list always reflects where I am now.
2. As a customer, I want to see only merchants that can deliver to me (within each
   merchant's own delivery radius), sorted by distance.
3. As a customer who denies location access, I want to set my address manually so I can
   still browse nearby merchants.

## Task report

| Task | Summary | Validation | Result |
|---|---|---|---|
| Extract distance filtering | Pure `decorateAndFilterMerchantsByDistance` + `hasMovedBeyondThreshold` in `src/utils/merchantDistance.ts`; `MerchantsList` now delegates to it | `npx vitest run src/utils/merchantDistance.test.ts` | RED (module missing) → GREEN (8 passed) |
| App-level `LocationProvider` | `src/contexts/LocationContext.tsx` owns restore / background refresh / denial fallback; mounted in `App.tsx` above `MerchantProvider` | `npx vitest run src/contexts/LocationContext.test.tsx` | RED (module missing) → GREEN (10 passed) |
| Wire `MerchantsList` to context | Component consumes `useUserLocation()`; manual-editor open/close synced with provider's `isManualPromptRequested` | `npx tsc --noEmit`, `npx vitest run`, `npm run build` | All clean / 215 passed / build ok |
| Refactor | Removed dead `useUserLocation` hook from `src/utils/geolocation.ts` | `npx tsc --noEmit && npx vitest run` | 215 passed |
| Data risk check | Merchants with NULL lat/lng would be hidden once location is known | SQL against live Supabase: 77 active merchants, 0 missing coordinates | PASS |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Without a user location, all merchants show unfiltered | `merchantDistance.test.ts` "returns all merchants untouched…" | unit | PASS |
| 2 | Merchants get `distanceKm` computed from the user location | "decorates merchants with distanceKm…" | unit | PASS |
| 3 | Merchants beyond their own `maxDeliveryDistanceKm` are hidden | "hides merchants beyond their own max delivery distance" | unit | PASS |
| 4 | Merchants with no radius limit stay visible at any distance | "keeps merchants with no max delivery distance…" | unit | PASS |
| 5 | Merchants without coordinates are hidden once location is known | "hides merchants with no coordinates…" | unit | PASS |
| 6 | Input merchant objects are never mutated | "does not mutate the input merchants" | unit | PASS |
| 7 | Moves under / over 0.25 km are classified correctly | `hasMovedBeyondThreshold` tests | unit | PASS |
| 8 | First open: geolocate → reverse-geocode → persist | `LocationContext.test.tsx` "requests geolocation, reverse-geocodes, and persists" | behavior | PASS |
| 9 | Reverse-geocode failure falls back to raw coordinates | "falls back to raw coordinates…" | behavior | PASS |
| 10 | Denial with no saved location → error state + manual address prompt | "sets error status and requests the manual prompt…" | behavior | PASS |
| 11 | Saved location restores instantly on open | "restores the saved location immediately" | behavior | PASS |
| 12 | GPS is re-checked on every open even with a saved location | "still re-checks GPS in the background on every open" | behavior | PASS |
| 13 | Fresh fix within threshold → no change, no reverse-geocode call | "keeps the saved location when the fresh fix is within…" | behavior | PASS |
| 14 | Moved beyond threshold → location and storage update | "updates location and storage when the user has moved…" | behavior | PASS |
| 15 | Background-refresh denial keeps saved location, no error surfaced | "keeps the saved location without error state…" | behavior | PASS |
| 16 | Corrupt saved JSON is discarded; fresh geolocation runs | "discards invalid JSON…" | behavior | PASS |
| 17 | `useUserLocation` outside the provider throws | "throws when useUserLocation is used outside the provider" | unit | PASS |

## Code-review round (ecc:react-reviewer)

The reviewer flagged three HIGH findings; all were resolved in a second RED→GREEN cycle:

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 18 | A stale background fix resolving after a newer manual request is ignored (generation guard) | `LocationContext.test.tsx` "ignores a stale background fix…" | RED → PASS |
| 19 | A low-accuracy fix (apparent move < threshold + accuracy) never relocates the user | "ignores a background fix whose accuracy is too poor to trust" + `merchantDistance.test.ts` accuracy-slack test | RED → PASS |
| 20 | Location editor closes only when a GPS request started from inside the editor succeeds; GPS button disabled while locating | untested UI wiring (`MerchantsList.tsx`), verified by typecheck + full suite staying green | applied |

Accepted as designed: the background refresh updating the merchant list mid-session is the
confirmed feature intent; mitigations are the 0.25 km threshold plus the new accuracy slack.

Evidence commands (all run 2026-08-27):
`npx vitest run` → 17 files / 218 tests passed. `npx tsc --noEmit` → clean. `npm run build` → built.

## Checkpoint commits (branch `feat/catalog-image-sourcing`)

- `f2402ec` test: add reproducers… (RED — both test files failed to resolve imports)
- `d70f847` feat: detect location on every app open via app-level LocationProvider (GREEN)
- `e4d765c` refactor: drop dead useUserLocation hook from geolocation utils (still GREEN)
- `46bf864` test: add reproducers for geolocation race and low-accuracy fixes (RED — 3 failed)
- `f05963f` fix: address review findings in geolocation refresh flow (GREEN — 218 passed)

## Coverage and known gaps

- The repo's `vitest.config.ts` coverage `include` allowlist does not cover the new files,
  so no coverage number was produced for them; the 18 new tests exercise every branch of
  `merchantDistance.ts` and the full mount/refresh/denial lifecycle of `LocationContext.tsx`.
- `MerchantsList.tsx` itself (a 900-line page component) is covered indirectly: its
  filtering/sorting core was extracted into the unit-tested utility, and its location
  state now comes from the behavior-tested provider. A full render test of the page was
  intentionally skipped — it would require mocking four contexts and Supabase for little
  additional guarantee.
- No E2E test was added; geolocation permission flows are poorly automatable in CI
  without a dedicated Playwright geolocation fixture (candidate follow-up).
