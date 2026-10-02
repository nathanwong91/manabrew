import type { Deck } from "@/protocol/deck";
import type { Bracket } from "@/lib/brackets";

export type AiOpponentRef =
  | { kind: "random" }
  | { kind: "preset"; id: string }
  | { kind: "saved"; id: string };

export interface ResolvedAiOpponent {
  id: string;
  deck: Deck;
  source: "preset" | "saved";
}

interface ResolveAiOpponentArgs {
  presets: Deck[];
  savedDecks: { id: string; deck: Deck }[];
  formatId: string;
  last: AiOpponentRef | null;
}

export type OpponentStrength = "casual" | "balanced" | "any";

const MAX_BRACKET: Record<OpponentStrength, Bracket> = { casual: 2, balanced: 3, any: 5 };

export function withinStrength(bracket: Bracket, strength: OpponentStrength): boolean {
  return bracket <= MAX_BRACKET[strength];
}

interface FillRandomOpponentsArgs {
  slots: (Deck | null)[];
  pool: Deck[];
  exclude: Deck[];
  fingerprint: (deck: Deck) => string;
  random?: () => number;
}

export function fillRandomOpponents({
  slots,
  pool,
  exclude,
  fingerprint,
  random = Math.random,
}: FillRandomOpponentsArgs): (Deck | null)[] {
  const taken = new Set([...exclude, ...slots.filter((slot) => slot !== null)].map(fingerprint));
  const remaining = pool.filter((deck) => {
    const key = fingerprint(deck);
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
  return slots.map(
    (slot) => slot ?? remaining.splice(Math.floor(random() * remaining.length), 1)[0] ?? null,
  );
}

export function hasCards(deck: Deck): boolean {
  return deck.cards.length > 0 || (deck.commanders?.length ?? 0) > 0;
}

export function resolveAiOpponent({
  presets,
  savedDecks,
  formatId,
  last,
}: ResolveAiOpponentArgs): ResolvedAiOpponent | null {
  const pool = presets.filter((deck) => (deck.format ?? "standard") === formatId && hasCards(deck));
  if (last?.kind === "preset") {
    const preset = pool.find((deck) => (deck.id ?? deck.name) === last.id);
    if (preset) return { id: preset.id ?? preset.name, deck: preset, source: "preset" };
  }
  if (last?.kind === "saved") {
    const saved = savedDecks.find(
      (entry) =>
        entry.id === last.id &&
        (entry.deck.format ?? "standard") === formatId &&
        hasCards(entry.deck),
    );
    if (saved) return { id: saved.id, deck: saved.deck, source: "saved" };
  }
  const random = pool[Math.floor(Math.random() * pool.length)];
  return random ? { id: random.id ?? random.name, deck: random, source: "preset" } : null;
}
