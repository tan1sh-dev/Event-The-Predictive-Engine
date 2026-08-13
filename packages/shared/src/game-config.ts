import type { Question, RoundConfig } from "./types.ts";

function q(
  roundId: RoundConfig["id"] | "FINAL",
  index: 1 | 2,
  prompt: string,
  options: string[],
  extra: Partial<Question> = {},
): Question {
  return {
    id: roundId === "FINAL" ? "final" : `${roundId.toLowerCase()}-q${index}`,
    roundId,
    index,
    prompt,
    options: options.map((label, i) => ({
      id: String.fromCharCode(97 + i),
      label,
    })),
    wagerRequired: roundId !== "FINAL",
    ...extra,
  };
}

export const ROUNDS: RoundConfig[] = [
  {
    id: "R0",
    title: "Calibration",
    theme: "Practice round — weights are discarded",
    calibration: true,
    clue: {
      title: "Warm-up",
      body: "This round teaches the vote + wager flow. Your cluster's weight will not carry forward.",
    },
    questions: [
      q("R0", 1, "How many students share one phone in a cluster?", [
        "1",
        "3",
        "5",
        "10",
      ]),
      q("R0", 2, "A High Risk wager sets alpha to…", [
        "0.1",
        "0.5",
        "1.0",
        "1.5",
      ]),
    ],
  },
  {
    id: "R1",
    title: "Their Last Purchases",
    theme: "Image clue — lifestyle read from a projected purchase history",
    calibration: false,
    clue: {
      title: "Image clue",
      body: "A projected purchase history (tech, fitness, skincare, late-night food). Anchor your first read on the volunteer's lifestyle.",
      media: { type: "image", src: "/media/r1-purchases.png", caption: "Last purchases" },
    },
    questions: [
      q("R1", 1, "Which lifestyle lane do the purchases point to first?", [
        "Optimiser / biohacker",
        "Campus night-owl",
        "Aesthetic curator",
        "Builder / gadget hoarder",
      ]),
      q("R1", 2, "What should we NOT overweight from this receipt?", [
        "A one-off snack at 1 A.M.",
        "A repeating subscription",
        "A high-ticket tool they already own",
        "A gift clearly bought for someone else",
      ]),
    ],
  },
  {
    id: "R2",
    title: "The Vibe Check",
    theme: "Audio clue — academic habits and reliability",
    calibration: false,
    clue: {
      title: "Audio clue",
      body: "A voice-note clip of the volunteer submitting copied code without understanding it.",
      media: { type: "audio", src: "/media/r2-vibe.mp3", caption: "Voice note" },
    },
    questions: [
      q("R2", 1, "What does the clip say about how they work under deadline?", [
        "They ship first and understand later",
        "They freeze until they fully get it",
        "They delegate and disappear",
        "They rewrite everything from scratch",
      ]),
      q("R2", 2, "Which archetype is this evidence pulling toward?", [
        "The Hustler",
        "The Perfectionist",
        "The Collaborator",
        "The Lurker",
      ]),
    ],
  },
  {
    id: "R3",
    title: "The Reality Check",
    theme: "Search / lifestyle data — which signals actually shift the profile",
    calibration: false,
    clue: {
      title: "Search history",
      body: "A screenshot of 1 A.M. search history. Decide which data points actually move the profile.",
      media: {
        type: "screenshot",
        src: "/media/r3-search.png",
        caption: "1 A.M. searches",
      },
    },
    questions: [
      q("R3", 1, "Which search is the strongest signal (not noise)?", [
        "A meme they opened once",
        "A repeated 'how does X actually work' query",
        "An auto-complete of a classmate's name",
        "A shopping tab they never checked out",
      ]),
      q("R3", 2, "After this data, the profile should shift…", [
        "More ambitious, less disciplined",
        "More anxious, more thorough",
        "More social, less technical",
        "Unchanged — this is all noise",
      ]),
    ],
  },
  {
    id: "R4",
    title: "Imposter Syndrome Test",
    theme: "Two truths, one lie — spot the fabricated fact, then read the two real ones",
    calibration: false,
    clue: {
      title: "Two truths, one lie",
      body: "Three stated facts from the volunteer. One is fabricated.",
    },
    questions: [
      q("R4", 1, "Which statement is the lie?", [
        "Statement 1",
        "Statement 2",
        "Statement 3",
      ]),
      q("R4", 2, "Taken together, the two real facts support which archetype?", [
        "Quiet specialist",
        "Public builder",
        "Reluctant leader",
        "Chaos generalist",
      ]),
    ],
  },
  {
    id: "R5",
    title: "The Ambition Trap",
    theme: "Adversarial data — visionary tabs vs failing CI. Final scored round.",
    calibration: false,
    clue: {
      title: "Conflicting artifacts",
      body: "Browser tabs showing startup / Figma / YC ambition next to a wall of failing GitHub CI runs.",
      media: {
        type: "screenshot",
        src: "/media/r5-tabs.png",
        caption: "Vision vs. CI",
      },
    },
    questions: [
      q("R5", 1, "Which reading of the paradox is more honest?", [
        "Visionary who hasn't shipped yet",
        "Someone performing ambition",
        "A burned-out builder mid-debug",
        "A complete mismatch — ignore the tabs",
      ]),
      q("R5", 2, "Going into the final inference, lock which axis?", [
        "High vision, low follow-through",
        "High craft, low self-promo",
        "High grit, messy process",
        "Still too noisy to call",
      ]),
    ],
  },
];

export const FINAL_QUESTION: Question = q(
  "FINAL",
  1,
  "Which AI-generated deep-work environment is the volunteer's real one?",
  ["Environment A", "Environment B", "Environment C"],
  {
    media: {
      type: "image",
      src: "/media/final-latent.png",
      caption: "Three candidate environments — one real, two decoys",
    },
  },
);

export function getRound(id: RoundConfig["id"]): RoundConfig {
  const round = ROUNDS.find((r) => r.id === id);
  if (!round) throw new Error(`Unknown round ${id}`);
  return round;
}

export function getQuestion(
  roundId: RoundConfig["id"] | "FINAL",
  questionIndex: 1 | 2,
): Question {
  if (roundId === "FINAL") return FINAL_QUESTION;
  return getRound(roundId).questions[questionIndex - 1];
}
