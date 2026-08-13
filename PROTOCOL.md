# The Predictive Engine — Mobile Team Protocol

Hand this file to the team building `/play`. They never implement game logic. Their app is a renderer over this Socket.IO contract.

Copy the TypeScript source of truth from [`packages/shared/src`](packages/shared/src) into their repo (or add this repo as a workspace dependency). If a payload changes, their compiler should break — not the live event.

Correct answers live **only** on the server (`apps/server/src/answer-key.ts`). They are not in this package.

---

## Connect

```ts
import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@engine/shared";

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  "http://localhost:3001", // mock / local
  { transports: ["websocket", "polling"] },
);
```

Mock server for local UI work:

```
npm run mock            # keyboard-driven phase stepper
npm run mock -- --bots  # also casts random votes whenever voting opens
```

Keys in the mock terminal: `n` next phase · `r` reveal (answer key) · `v` random votes · `p` grant top-3 powers · `b` back · `s` dump snapshot · `q` quit.

---

## Identity and reconnection

Clusters start at **0**. The host sets `N` in the lobby (`hostSetClusterCount`, 2–40) before Round 0. Until then phones see a waiting screen and the projector shows only the hub. Each cluster has exactly one live phone. The join grid and projector orbs follow `snapshot.clusterCount`.

1. On first join, the server returns a `token`. Persist it in `localStorage` keyed by cluster number.
2. On reload, emit `join` with the same `clusterNumber` **and** `token`.
3. If the phone died and the socket is gone, you may rejoin **without** the token; the server reissues the same token.
4. If another socket is still live for that cluster, join without a token is rejected (`cluster_in_use`). Join **with** the token steals the session (phone swap).
5. After `join` succeeds, the ack includes a full `snapshot` plus a private `view`. The server also pushes a fresh `snapshot` / `clusterView` on every state change — render from those, do not keep a parallel game model.

```ts
socket.emit(
  "join",
  {
    role: "cluster",
    clusterNumber: 7,
    token: localStorage.getItem("engine.token.7") ?? undefined,
  },
  (ack) => {
    if (!ack.ok) {
      // ack.error: invalid_cluster | cluster_in_use | bad_token | missing_cluster_number
      return;
    }
    localStorage.setItem(`engine.token.${ack.clusterNumber}`, ack.token!);
    render(ack.view!);
  },
);
```

---

## Screens the mobile app must handle

Drive the UI from `snapshot.phase` (and `roundId` / `questionIndex`). Do not invent extra states.

| `phase` | What to show |
|---|---|
| `lobby` | Cluster number + waiting. Show `snapshot.connectedCount` / `snapshot.clusterCount`. |
| `clue` | `snapshot.clue` (title, body, optional media). No voting yet. |
| `voting_open` | `snapshot.question` — options + wager (Low 0.5 / High 1.5). Submit with `submitVote`. Allow changing the vote until lock. |
| `voting_locked` | “Locked in” using `view.pendingVote`. Wait. |
| `reveal` | Host-marked correct option + `view.lastResult` (right/wrong, α, y). Weights have **not** changed yet. |
| `weight_update` | Result of the round’s two updates. Read `snapshot.clusters[i].visualWeight` and your own `weight`. R0 is calibration: weights snap back to 1 (`weightsUpdated.discarded === true`). |
| `mic_moment` | After R2. No scoring. Idle / “listen to the stage”. |
| `power_grant` | After R3. If `view.canClaimPower`, let them pick Insurance / Amplify / Foresight via `claimPower`. Otherwise “waiting”. |
| `active_query` | After R5 (final scored round). Top 3 are on stage. No vote. |
| `freeze` | Weights locked. Banner. |
| `final_inference_open` | Question id `final`, options A/B/C, **no wager**. |
| `final_inference_locked` | Locked final vote. |
| `ensemble` | `snapshot.ensemble` confidence bars. |
| `final_reveal` | Volunteer’s real environment vs the engine pick. |
| `debrief` | End card. |

R5 is the last scored round. There is no R6.

---

## Client → server

Every event takes a payload and an acknowledgement callback. Always wait for the ack.

### `join`

```ts
{ role: "cluster" | "stage" | "host"; clusterNumber?: number; token?: string; hostPassword?: string }
```

Ack: `JoinAck` (`ok: true` includes `snapshot`, and `view` + `token` for clusters).

### `submitVote`

```ts
{ questionId: string; optionId: string; wager?: 0.5 | 1.5 | null }
```

- Scored questions (`r0-q1` … `r5-q2`): `wager` **must** be `0.5` or `1.5`.
- Final inference (`final`): omit wager or pass `null`. A wager is rejected (`wager_not_allowed`).
- `questionId` must match `snapshot.question.id`.
- `optionId` is `"a"` | `"b"` | `"c"` | `"d"` matching `question.options`.
- Replacing a vote before lock is allowed; after `voting_locked` the server returns `voting_closed`.

### `claimPower`

```ts
{ power: "insurance" | "amplify" | "foresight" }
```

Only during `power_grant`, only if `view.canClaimPower` (top 3 after R3, one power per cluster).

### `usePower`

```ts
{ power: "foresight" }
```

Only Foresight is activated by the client, and only while `voting_open` or `final_inference_open`. Ack includes `split: { optionId, label, count }[]` — the current room-wide vote counts. Insurance and Amplify are **passive**: they apply automatically on the next matching answer at weight-update time. Calling `usePower` with those names returns `passive_power`.

Host-only events (`hostAdvance`, `hostBack`, `hostReveal`, `hostGrantPowers`, `hostSetWeight`, `hostKick`, `hostSetClusterCount`, `hostReset`) are not used by the mobile app. `hostSetClusterCount` is lobby-only.

---

## Server → client

Listen to all of these. Prefer `clusterView` as the source of truth on the phone.

| Event | When | UI |
|---|---|---|
| `snapshot` | Any mutation | Public room state. Safe to render for everyone. |
| `clusterView` | Any mutation, **only to that cluster’s socket** | Private: `pendingVote`, `lastResult`, `power`, `canClaimPower`, `token`. |
| `voteProgress` | Each vote | `{ lockedCount, connectedCount, clusterCount }` — “12 / N locked in”. |
| `revealResult` | Host marks the answer | `{ questionId, correctOptionId, yourResult }`. `yourResult` is filled on the cluster socket, `null` on stage/host. |
| `weightsUpdated` | Entering `weight_update` | `{ roundId, discarded, clusters }`. Animate orb size from `visualWeight` (0–1 vs the heaviest cluster). |
| `powersGranted` | Claim or host grant | `{ grants: { clusterNumber, power }[] }` |
| `ensembleResult` | Entering `ensemble` | `{ bars: { optionId, label, score, pct }[] }` |
| `error` | Kick, takeover, etc. | Show the message. On takeover, return to the join screen. |

---

## Weight math (for display copy, not for you to recompute)

On each scored question in a round, at the `weight_update` step:

```
w_new = w_old * exp(α * y)
```

- `α` is the cluster’s wager (`0.5` or `1.5`).
- `y` is `+1` if they hit the host-marked option, `-1` otherwise (no vote counts as wrong).
- **Insurance:** next wrong answer uses `y = 0` (weight unchanged), then the power is spent.
- **Amplify:** next correct answer uses `α' = 2α`, then the power is spent.
- R0 applies the formula then **discards** — every cluster returns to weight `1`.
- After `freeze`, `frozenWeight` is what the ensemble uses even if a host override later edits live weight.
- Ensemble bar for option X = Σ `frozenWeight` of clusters that voted X. `pct` is that score over the total.

Do **not** recompute weights on the client. Display `clusterView.snapshot.clusters` and `lastResult`.

---

## `GameSnapshot` / `ClusterView` fields

See [`packages/shared/src/types.ts`](packages/shared/src/types.ts). The important ones for mobile:

```ts
snapshot.phase
snapshot.roundId            // "R0" … "R5" or null
snapshot.questionIndex      // 1 | 2 | null
snapshot.question           // prompt, options, media, wagerRequired
snapshot.clue
snapshot.connectedCount
snapshot.lockedCount
snapshot.weightsFrozen
snapshot.ensemble
snapshot.clusters[].number | connected | weight | visualWeight | hasVoted | power

view.pendingVote            // { optionId, wager, submittedAt } | null
view.lastResult             // correctness + α + y + weightBefore/After
view.power                  // { type, used } | null
view.canClaimPower
view.token
```

Question ids: `r0-q1`, `r0-q2`, … `r5-q2`, and `final`.

---

## Minimal client loop

```ts
function onView(view: ClusterView) {
  localStorage.setItem(`engine.token.${view.clusterNumber}`, view.token);
  switch (view.snapshot.phase) {
    case "voting_open":
    case "final_inference_open":
      showQuestion(view.snapshot.question!, view.snapshot.phase === "voting_open");
      break;
    case "power_grant":
      if (view.canClaimPower) showPowerPicker();
      else showWaiting("Top 3 are picking power-ups");
      break;
    default:
      showPhase(view.snapshot.phase, view);
  }
}

socket.on("clusterView", onView);
socket.on("error", ({ message }) => showError(message));
```

---

## Non-goals for the mobile team

- Do not advance phases, mark answers, or edit weights.
- Do not connect as `role: "host"` or `role: "stage"`.
- Do not hard-code the round order beyond switching on `phase`.
- Placeholder media paths (`/media/...`) will be replaced; render whatever `media.src` the snapshot gives you.
