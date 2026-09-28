#!/usr/bin/env node
// Random seed packs for divergent ideation (see STUDIO.md §1b).
// Usage: node tools/ideation/seeds.mjs [packs=5] > seeds.json
// Each pack mixes external randomness (random Wikipedia articles, dictionary words)
// with forced constraints so ideation agents can't fall back to trained defaults.
import { readFileSync } from "node:fs";

const packs = Number(process.argv[2] ?? 5);
const pick = (arr, n) => Array.from({ length: n }, () => arr[Math.floor(Math.random() * arr.length)]);

const words = readFileSync("/usr/share/dict/words", "utf8")
  .split("\n")
  .filter((w) => w.length >= 5 && w.length <= 12 && /^[a-z]+$/.test(w));

// Deliberately broad, odd lenses. Selection is random; the lists are only a floor.
const lenses = [
  "a mechanic that only exists because of the player's body in the world, not a power-up",
  "the map itself is a character with opinions",
  "progression removes abilities as often as it grants them",
  "enemies are not hostile by default",
  "the world changes on a timescale the player can feel over the whole game",
  "every traversal ability has a cost that shapes the world",
  "the protagonist is not the most important thing in the world",
  "the economy is based on something other than currency",
  "death is a mechanic, not a punishment",
  "sound, silence or rhythm is physical in the world",
  "the player can build or leave marks that persist",
  "a second body, shadow, echo or companion the player controls indirectly",
  "gravity, scale or orientation is not fixed",
  "the setting is mundane at a scale that makes it strange",
  "cooperation with enemies is required",
  "information is the main reward, not power",
];
const moods = ["tender", "absurd", "dread", "melancholy", "wonder", "petty", "sacred", "feverish", "bureaucratic", "cozy-eerie", "grief", "mischief"];
const bans = [
  "No music, instruments or songs as the core theme.",
  "No fallen kingdoms, plagues, infections or corrupted gods.",
  "No insects or moths as the protagonist.",
  "No light-versus-dark themes.",
  "No amnesiac protagonist.",
  "No ancient precursor civilisation.",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function randomArticle(attempt = 0) {
  try {
    const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary", {
      headers: { "user-agent": "opusvania-ideation/0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    return { title: d.title, extract: (d.extract ?? "").slice(0, 400) };
  } catch {
    if (attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return randomArticle(attempt + 1);
    }
    return { title: pick(words, 1)[0], extract: "(offline fallback: random word)" };
  }
}

const out = [];
for (let i = 0; i < packs; i++) {
  out.push({
    pack: i + 1,
    wikipedia: [await randomArticle(), await randomArticle(), await randomArticle()],
    words: pick(words, 6),
    lens: pick(lenses, 1)[0],
    mood: pick(moods, 1)[0],
  });
}
console.log(JSON.stringify({ bans, packs: out }, null, 2));
