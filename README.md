# The Predictive Engine

Live AdaBoost audience game for the RVCE Coding Club induction. One Socket.IO server, a projector topology, a host panel, and a cosmic mobile voting UI.

## Layout

```
packages/shared     protocol types, phase sequence, question copy
apps/server         game engine + Socket.IO + mock stepper
apps/web            /play phones · /stage projector · /host control
index.html / .js    live Three.js projector (served at /stage)
stage-cursor.js     projector cursor trail
assets/             projector logos + stage background
media/              round clue images and video
```

## Commands

```
npm install
npm test
npm run mock          # keyboard-driven engine (optional --bots)
npm run dev:all       # server :3001 + Vite :5173
```

| Surface | URL |
|---|---|
| Phones | http://localhost:5173/play |
| Projector | http://localhost:5173/stage |
| Host laptop | http://localhost:5173/host |

Host keys: **N / Space** next phase · **B** back · **R** reveal from answer key.

The room starts at 0 clusters. In the lobby, set the count (2–40) before leaving for Round 0. Phones and the projector rebuild to match.

Host password defaults to `rvce_host`. Override with `HOST_PASSWORD` (copy `.env.example`). Change it before any public deploy.

## Production

```
npm run build         # Vite → apps/web/dist, typecheck server
npm run start -w @engine/server
```

The server serves `apps/web/dist`, `/stage-static`, `/media`, and Socket.IO. Set `PUBLIC_URL` to the public origin so join links are correct. Set `RESTORE=0` for a clean lobby on boot, or delete `apps/server/data/state.json`.

No Dockerfile / Railway config yet — that is still to do.

## Status

Done: engine, protocol, mock server, mobile `/play`, live projector `/stage`, host `/host`, 19 engine tests, R0–R4 clue media.

Left: `media/r5-tabs.png` and `media/final-latent.png`, Railway deploy, 20-cluster dress rehearsal.

## Contributing

Do not push to `main`. Clone, create a branch, then open a pull request.

```
git clone https://github.com/tan1sh-dev/Event-The-Predictive-Engine.git
cd Event-The-Predictive-Engine
git checkout -b yourname/short-description
```

Push that branch and open a PR into `main`. Changes land only after review.
