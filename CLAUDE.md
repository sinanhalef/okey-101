# 101 Okey

Contemporary, minimal 101 Okey. Web first (React), iOS/Android later via Expo sharing the engine.
Rules spec: `docs/rules-tr.md` (Turkish, authoritative). UI is Turkish only for now;
all strings live in `packages/shared/src/i18n/tr.ts` (add `en.ts` with the same keys later).

## Layout (npm workspaces)
- `packages/engine` — pure TS rules engine, zero deps. `applyAction(match, action, {now, seat})` mutates and validates.
  Tests: `npm test` (vitest). Every rule section + K1–K10 has a spec in `packages/engine/test`.
- `packages/shared` — Firestore doc shapes, callable request/response types, `t()` + Turkish strings.
- `functions` — Firebase Functions v2 (europe-west1). Server-authoritative: engine runs only here.
  Built with esbuild into `functions/lib/index.js` (engine/shared are bundled in; only firebase-admin/functions are deps).
- `apps/web` — React 18 + Vite. Anonymous auth with **session** persistence, so every browser tab is a separate guest.
- `scripts/e2e-bots.ts` — 4 bots play a match through the emulated functions (`--bots 3 --turn 120` seats 3 bots and waits for you).
- `scripts/dev-set-rack.ts` — emulator-only hack to give a seat specific tiles.

## Firestore
- `tables/{id}`: public doc (`status`, `code`, `seats`, `settings`, `viewJson` = JSON of `PublicMatchView`).
- `tables/{id}/hands/{uid}`: that player's rack (`json`), readable only by the owner.
- `tables/{id}/secret/state`: full `MatchState` JSON, no client access.
Views are JSON strings because Firestore forbids nested arrays.

## Commands
- `npm test` — engine tests. `npm run typecheck` — all workspaces.
- Local: `firebase emulators:start --only auth,functions,firestore` (ports 9199/5101/8180) and
  `cd apps/web && VITE_USE_EMULATORS=1 npx vite`. Bots: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 npx tsx scripts/e2e-bots.ts 5 --bots 3 --turn 120`.
- Deploy: `npm run build -w @okey101/web && firebase deploy --only firestore:rules,functions,hosting`.
- Prod: https://okey101-ce391.web.app (project `okey101-ce391`, Blaze).

## Rule decisions & assumptions
See the "Assumptions" list in the plan/README section of the last implementation summary; key ones:
side-take failure → tile returned, +101 (0 with K10), player draws from deck and continues; last deck tile drawer
discards anything penalty-free and the hand ends; işlek penalty applies to everyone; okey steal from own/team meld
is free; unflipped okey on table is not stealable; unused stolen okey is reverted at discard (K8 off);
timeout discards the lowest non-işlek non-okey tile; K9 "İŞLEK!" button shows after every discard until the next draw.
