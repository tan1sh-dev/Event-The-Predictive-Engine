import type { FinalEnvironment, Question, RoundConfig } from "./types.ts";

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
    title: "Viral clip",
    theme: "Warm-up — watch the clip, then vote; weights discarded",
    calibration: true,
    clue: {
      title: "Viral clip",
      body: [
        "Watch the clip on the projector.",
        "",
        "Practice round — weights do not carry forward.",
      ].join("\n"),
      media: {
        type: "video",
        src: "/media/r0-ravi-kishan.mp4",
        caption: "Viral clip",
        autoplay: false,
      },
    },
    questions: [
      q("R0", 1, "Who is this famous internet personality?", [
        "Arjun Kapoor",
        "Ravi Kishan",
        "Puneeth Superstar",
        "Rehman Dakait",
      ]),
      q("R0", 2, "Which is the viral song he sung?", [
        "Tum Hi Ho",
        "Zara Zara",
        "Koteshwaraay Shiva Koteshwaraay",
        "Hanuman Chalisa",
      ]),
    ],
  },
  {
    id: "R1",
    title: "Their Last Purchases",
    theme: "Lifestyle read from a projected purchase history",
    calibration: false,
    clue: {
      title: "Last purchases",
      body: [
        "A mix of fitness, tech, skincare, and late-night food:",
        "",
        "• ESP32 microcontroller",
        "• ChatGPT Plus / Claude Premium subscription",
        "• USB-C to USB-A cable",
        "• 100-pack of copper wires",
        "• Elite gym membership renewal",
        "• Premium hair/skin serum",
        "• Late-night Blinkit order — Buldak spicy Korean noodles",
        "• Zomato order from California Burrito",
      ].join("\n"),
      media: { type: "image", src: "/media/r1-purchases.png", caption: "Personal ledger · last 7 days" },
    },
    questions: [
      q(
        "R1",
        1,
        "Looking at this mix of fitness, tech, skincare, and late-night food, what does their overall spending footprint suggest about how they manage daily college life?",
        [
          "They build routines meant to run on their own, but end up reacting to whatever's urgent instead of following the plan.",
          "They try to keep up long-term routines like the gym and skincare, while also relying on fast, easy options like late-night food orders.",
          "The recurring purchases look like discipline, but nothing proves they're actually keeping up the routine day to day.",
          "Spending is balanced enough across categories that no single habit really stands out.",
        ],
        {
          explanation:
            "The gym membership and skincare purchases are renewals, showing proof of a real routine. The late-night food orders show that the student still occasionally leans on convenience while being disciplined.",
        },
      ),
    ],
  },
  {
    id: "R2",
    title: "The Vibe Check",
    theme: "SIP video clue — academic habits and reliability",
    calibration: false,
    clue: {
      title: "Voice note",
      body: [
        "Played at 1:30 AM.",
        "",
        'Volunteer: "Hey bro, I know it\'s important to learn it, but don\'t waste time starting that lab code from scratch. I found a random solution online that passes the two basic sample tests on the assignment sheet."',
        "",
        'The other person: "Oh wait really? Do you know how it works?"',
        "",
        'Volunteer: "Dude I honestly have zero clue how the code works, but it showed \'Output: Success\' once on my screen, so I\'m submitting it right now and going to sleep."',
      ].join("\n"),
      media: { type: "video", src: "/media/r2-sip.mov", caption: "SIP video · 1:30 AM", autoplay: false },
    },
    questions: [
      q(
        "R2",
        1,
        "A professor is choosing this student for a last-minute team project, where the team has very little time and needs someone who can contribute quickly. Based only on what you heard in the voice note, which role would suit this student best?",
        [
          "The person who takes an unfinished solution and gets it into a presentable state before the deadline.",
          "The person who handles the final testing and decides whether the team's solution is reliable enough to submit.",
          "The person who searches for workable approaches when the team is stuck and needs a result quickly.",
          "The person who understands the solution well enough to modify it when the requirements suddenly change.",
        ],
        {
          explanation:
            "Because the voice note shows they are good at quickly finding a workable solution when they're stuck, even without fully understanding it.",
        },
      ),
    ],
  },
  {
    id: "R3",
    title: "The Reality Check",
    theme: "Search / lifestyle data — which signals actually shift the profile",
    calibration: false,
    clue: {
      title: "Search history",
      body: [
        "Recent mobile search history, timestamped at 1 A.M.:",
        "",
        "• how to fix posture after 14 hours sitting",
        "• how much electricity is my gaming PC secretly eating",
        "• can I pull an all nighter and finish my entire syllabus",
        "• best playlist for pretending I'm productive",
        "• dominos cheese burst near me open late",
        "• C pointers explained like I'm five before I lose my mind",
      ].join("\n"),
      media: {
        type: "screenshot",
        src: "/media/r3-search.png",
        caption: "1 A.M. searches",
      },
    },
    questions: [
      q(
        "R3",
        1,
        "Your model is currently using all six searches. You can permanently remove ONE before making the prediction. Which removal would change the profile the least?",
        [
          "Remove the C pointers search",
          "Remove the electricity search",
          "Remove the playlist search",
          "Remove the Domino's search",
        ],
        {
          explanation:
            "Because the Domino's search mainly tells us about a one-time food preference/convenience choice, while the other searches give us more information about the student's technical interests, study habits, productivity, or lifestyle.",
        },
      ),
      q(
        "R3",
        2,
        "Based on these searches, what's their approach when the workload piles up?",
        [
          "Stays ahead of deadlines — plans early so nothing turns into a last-minute scramble.",
          "Locks in on priorities, ditching comfort and fun until the important stuff is done.",
          "Grinds hard when it counts, but still finds small ways to make it comfortable or fun.",
          "Takes the path of least resistance — picks convenience over effort whenever possible.",
        ],
        {
          explanation:
            "Because they balance serious work with comfort and convenience, instead of focusing only on one side.",
        },
      ),
    ],
  },
  {
    id: "R4",
    title: "Is There a Lie?",
    theme: "Two truths, one lie — spot the fabricated fact",
    calibration: false,
    clue: {
      title: "Two truths, one lie",
      body: [
        "Three stated facts from the mystery volunteer. Two are absolute facts. One is a complete fabrication.",
        "",
        '1. "I managed an 8.2 CGPA last semester despite not even solving previous-year papers."',
        '2. "I haven\'t used a calendar or planner for my academic deadlines since the first week of the semester."',
        '3. "I can work anywhere; I never waste time setting up a comfortable vibe or putting on some music, I just sit in silence and grind."',
      ].join("\n"),
      media: { type: "image", src: "/media/r4-lie.png", caption: "Three claims · find the lie" },
    },
    questions: [
      q("R4", 1, "Which one of these statements is the lie?", [
        "Fact 1 is the lie",
        "Fact 2 is the lie",
        "Fact 3 is the lie",
        "None of them are lies",
      ], {
        explanation:
          "Fact 3 is the lie, because it directly contradicts the search history we analyzed in Round 3, where they explicitly looked for the \"best playlist for pretending I'm productive\".",
      }),
      q(
        "R4",
        2,
        "Why do you think they chose to lie about that specifically, instead of something else on this list?",
        [
          "Needing a \"vibe\" to focus feels weak — doesn't match the grindset image they're selling.",
          "\"I work in silence\" = a clean excuse to skip group sessions and needy teammates.",
          "Lying here fakes an unshakeable attention span — zero distractions, ever.",
          "Simplest lie to pick since no one can actually verify someone's study environment.",
        ],
        {
          explanation:
            "Their history of prioritizing gym routines and premium skincare proves they care deeply about projecting a flawless, high-achieving image to the outside world. Admitting they actually need study playlists and a curated \"vibe\" to function ruins that illusion, so they lie to sound like a gritty, highly disciplined engineering student.",
        },
      ),
    ],
  },
  {
    id: "R5",
    title: "The Ambition Trap",
    theme: "Adversarial data — pitch deck vs a crashing server. Final scored round.",
    calibration: false,
    clue: {
      title: "Open tabs",
      body: [
        "Watch the screen recording on the projector. Click to play — it will not start on its own.",
        "",
        "Tab 1 — The Big Pitch: A polished Canva presentation titled \"PhysioTracker AI – Pitch Deck (Final Draft)\" with sleek mockups and a projected ₹10 crore valuation slide.",
        "",
        'Tab 2 — The High Hopes: A Google search for "how to apply for Shark Tank India as a college student".',
        "",
        "Tab 3 — The Broken Reality: An active VS Code / terminal screen filled with red error text:",
        "FATAL ERROR: Server crashed. Database connection failed.",
      ].join("\n"),
      media: {
        type: "video",
        src: "/media/r5-tabs.mp4",
        caption: "Screen recording · pitch deck vs crashing server",
        autoplay: false,
      },
    },
    questions: [
      q(
        "R5",
        1,
        "If you scanned their brain right now, how is their mental effort actually divided?",
        [
          "90% Shark Tank daydream, 10% pretending the red error isn't there.",
          "50% polishing slides, 50% actually trying to fix the crash.",
          "70% funding anxiety, 30% quietly realizing they can't code their way out.",
          "100% coding — the deck's just there to look busy while the fix loads.",
        ],
        {
          explanation:
            "Valuation slide + Shark Tank search show the funding fantasy is running loud. But a fatal DB crash sitting untouched means the panic isn't \"let me fix this,\" it's \"oh no, I don't know how.\"",
        },
      ),
      q(
        "R5",
        2,
        "Based on their habits and this browser window, who are they really?",
        [
          "The Pragmatic Builder — messy process, real results, doesn't care how it looks.",
          "The Aesthetic Creator — the deck matters more than the database.",
          "The Chaotic Explorer — no strategy, just chasing whatever's loud that hour.",
          "The Curated Grinder — real effort, real struggle, but only the polished parts go on display.",
        ],
        {
          explanation:
            "Same person from R3/R4: grinds hard, but manages the optics (playlist for the vibe of productivity, Canva decks over debugging). The backstage is on fire; the front stage is a ₹10 Cr pitch.",
        },
      ),
    ],
  },
];

export const FINAL_ENVIRONMENTS: FinalEnvironment[] = [
  { optionId: "a", letter: "A", src: "/media/env-a-decoy.png", caption: "Image A" },
  { optionId: "b", letter: "B", src: "/media/env-b-real.png", caption: "Image B" },
  { optionId: "c", letter: "C", src: "/media/env-c-decoy.png", caption: "Image C" },
];

export const FINAL_CLUE: RoundConfig["clue"] = {
  title: "Latent space",
  body: "Three candidate deep-work environments. One is the volunteer's real setup. Two are decoys. Images stay on the projector for the full 90 seconds while phones vote.",
  media: {
    type: "image",
    src: "/media/final-latent.png",
    caption: "Three candidate environments — one real, two decoys",
  },
};

export const FINAL_QUESTION: Question = q(
  "FINAL",
  1,
  "Which AI-generated deep-work environment is the volunteer's real one?",
  ["Environment A", "Environment B", "Environment C"],
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
  const question = getRound(roundId).questions[questionIndex - 1];
  if (!question) {
    throw new Error(`No question ${questionIndex} in ${roundId}`);
  }
  return question;
}
