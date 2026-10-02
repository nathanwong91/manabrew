import { describe, expect, it } from "vitest";

import { fillRandomOpponents, withinStrength } from "@/lib/aiOpponent";
import type { Deck } from "@/protocol/deck";

const deck = (name: string) => ({ name }) as Deck;
const fingerprint = (d: Deck) => d.name;
const names = (decks: (Deck | null)[]) => decks.map((d) => d?.name ?? null);

describe("fillRandomOpponents", () => {
  const pool = ["a", "b", "c", "d", "e"].map(deck);

  it("fills three empty slots with distinct decks", () => {
    const filled = fillRandomOpponents({
      slots: [null, null, null],
      pool,
      exclude: [],
      fingerprint,
    });
    expect(filled.every((d) => d !== null)).toBe(true);
    expect(new Set(names(filled)).size).toBe(3);
  });

  it("keeps picked decks and never duplicates them", () => {
    const picked = deck("b");
    for (let i = 0; i < 20; i++) {
      const filled = fillRandomOpponents({
        slots: [picked, null, null],
        pool,
        exclude: [],
        fingerprint,
      });
      expect(filled[0]).toBe(picked);
      expect(new Set(names(filled)).size).toBe(3);
    }
  });

  it("excludes the player's deck", () => {
    for (let i = 0; i < 20; i++) {
      const filled = fillRandomOpponents({
        slots: [null, null, null, null],
        pool,
        exclude: [deck("a")],
        fingerprint,
      });
      expect(names(filled)).not.toContain("a");
    }
  });

  it("ignores duplicate decks inside the pool", () => {
    const filled = fillRandomOpponents({
      slots: [null, null],
      pool: [deck("a"), deck("a")],
      exclude: [],
      fingerprint,
    });
    expect(names(filled)).toEqual(["a", null]);
  });

  it("leaves nulls when the pool is too small", () => {
    const filled = fillRandomOpponents({
      slots: [null, null, null],
      pool: [deck("a"), deck("b")],
      exclude: [deck("a")],
      fingerprint,
    });
    expect(names(filled)).toEqual(["b", null, null]);
  });

  it("uses the injected random source", () => {
    const filled = fillRandomOpponents({
      slots: [null],
      pool,
      exclude: [],
      fingerprint,
      random: () => 0.99,
    });
    expect(names(filled)).toEqual(["e"]);
  });
});

describe("withinStrength", () => {
  it("allows brackets 2 and below for casual", () => {
    expect(withinStrength(1, "casual")).toBe(true);
    expect(withinStrength(2, "casual")).toBe(true);
    expect(withinStrength(3, "casual")).toBe(false);
  });

  it("allows brackets 3 and below for balanced", () => {
    expect(withinStrength(3, "balanced")).toBe(true);
    expect(withinStrength(4, "balanced")).toBe(false);
  });

  it("allows everything for any", () => {
    expect(withinStrength(5, "any")).toBe(true);
  });
});
