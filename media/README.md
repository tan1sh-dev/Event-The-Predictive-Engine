# Round media

Clue assets served at `/media/<filename>` by Vite (dev) and the Express server (prod).

| File | Round | In repo |
|---|---|---|
| `r0-ravi-kishan.mp4` | R0 — viral clip (Ravi Kishan) | yes |
| `r1-purchases.png` | R1 — last purchases | yes |
| `r2-sip.mov` | R2 — SIP video | yes |
| `r3-search.png` | R3 — 1 A.M. search history | yes |
| `r4-lie.png` | R4 — two truths, one lie | yes |
| `r5-tabs.png` | R5 — PhysioTracker pitch vs crashing server | still needed |
| `final-latent.png` | Final inference — three environments (A \| B \| C) | yes |
| `env-a-decoy.png` | Final panel A — "cozy gamer" decoy (comfort, no maker hardware) | yes |
| `env-b-real.png` | Final panel B — the volunteer's real deep-work den (correct answer) | yes |
| `env-c-decoy.png` | Final panel C — "staged builder" decoy (hardware, but no vibe/comfort) | yes |

Until a file lands, the projector falls back to the clue text from the round config.

Final round: `final-latent.png` is a stitched A \| B \| C strip built from the three panels by `assets/compose_final.py`. All three are the same cozy 2 AM dual-monitor RGB desk (same lamp, posters, desk mat, gaming PC, headphones) so the differences stay subtle. The answer requires combining two traits learned during training:

- Trait 1 — the volunteer is a hardware builder (R1: ESP32, breadboard, copper wires, soldering iron).
- Trait 2 — the volunteer depends on music and comfort (R3 + the R4 truth: on-screen playlist, snacks, caffeine, genuine lived-in mess).

Each decoy is missing exactly one trait, so only B satisfies both:
- Panel A: has music + comfort (game on screen, controller, energy drinks, noodles, headphones) but NO maker hardware — fails Trait 1.
- Panel B: hardware + music + comfort, genuinely lived-in — the real setup, matching `ANSWER_KEY.final = "b"` in `apps/server/src/answer-key.ts`.
- Panel C: has a tidy ESP32/breadboard kit and dev screens but is staged and sterile — no music, no food/drink, immaculately clean — fails Trait 2 (and the R5 "curated grinder, not staged" read).

Do not commit volunteer-identifying photos if this repo is public. The files above are designed mockups.
