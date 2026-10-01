import { describe, expect, it } from "vitest";
import type { CardView, GameViewDto, PlayerDto, StackObjectDto } from "@/protocol/game";
import { clampVolume, gameSoundsFor } from "./gameSounds";

function player(id: string, overrides: Partial<PlayerDto> = {}): PlayerDto {
  return { id, life: 20, cardsDrawnThisTurn: 0, landsPlayedThisTurn: 0, ...overrides } as PlayerDto;
}

function view(overrides: Partial<GameViewDto> = {}): GameViewDto {
  return {
    gameId: "g1",
    turn: 3,
    step: "main1",
    combatAssignments: [],
    activePlayerId: "player-1",
    priorityPlayerId: "player-1",
    players: [player("player-0"), player("player-1")],
    zones: [],
    stack: [],
    gameOver: false,
    winnerId: null,
    ...overrides,
  } as GameViewDto;
}

function attacker(id: string): CardView {
  return { visibility: "visible", id, attackingPlayerId: "player-0" } as CardView;
}

const ME = "player-0";

describe("gameSoundsFor", () => {
  it("returns nothing without a previous view", () => {
    expect(gameSoundsFor(null, view(), ME)).toEqual([]);
  });

  it("returns nothing when the game changes", () => {
    const next = view({ gameId: "g2", players: [player(ME, { life: 5 }), player("player-1")] });
    expect(gameSoundsFor(view(), next, ME)).toEqual([]);
  });

  it("returns nothing when nothing relevant changed", () => {
    expect(gameSoundsFor(view(), view({ priorityPlayerId: ME }), ME)).toEqual([]);
  });

  it("plays draw when a player draws", () => {
    const next = view({ players: [player(ME, { cardsDrawnThisTurn: 1 }), player("player-1")] });
    expect(gameSoundsFor(view(), next, ME)).toEqual(["draw"]);
  });

  it("plays draw on a new turn when the reset counter is already positive", () => {
    const previous = view({ players: [player(ME), player("player-1", { cardsDrawnThisTurn: 2 })] });
    const next = view({
      turn: 4,
      activePlayerId: "player-1",
      players: [player(ME), player("player-1", { cardsDrawnThisTurn: 1 })],
    });
    expect(gameSoundsFor(previous, next, ME)).toEqual(["draw"]);
  });

  it("plays land when a land is played", () => {
    const next = view({ players: [player(ME), player("player-1", { landsPlayedThisTurn: 1 })] });
    expect(gameSoundsFor(view(), next, ME)).toEqual(["land"]);
  });

  it("plays cast when a new object goes on the stack", () => {
    const spell = { id: "s1" } as StackObjectDto;
    expect(gameSoundsFor(view(), view({ stack: [spell] }), ME)).toEqual(["cast"]);
    expect(gameSoundsFor(view({ stack: [spell] }), view({ stack: [spell] }), ME)).toEqual([]);
  });

  it("plays attack when attackers are first declared", () => {
    const battlefield = (cards: CardView[]) => [
      { zone: "battlefield" as const, ownerId: "player-1", cards, count: cards.length },
    ];
    const previous = view({ zones: battlefield([]) });
    const next = view({ zones: battlefield([attacker("c1")]) });
    expect(gameSoundsFor(previous, next, ME)).toEqual(["attack"]);
    expect(
      gameSoundsFor(next, view({ zones: battlefield([attacker("c1"), attacker("c2")]) }), ME),
    ).toEqual([]);
  });

  it("plays damage on life loss and lifeGain on life gain", () => {
    const hurt = view({ players: [player(ME, { life: 17 }), player("player-1")] });
    const healed = view({ players: [player(ME, { life: 23 }), player("player-1")] });
    expect(gameSoundsFor(view(), hurt, ME)).toEqual(["damage"]);
    expect(gameSoundsFor(view(), healed, ME)).toEqual(["lifeGain"]);
  });

  it("plays yourTurn only when the turn passes to me", () => {
    expect(gameSoundsFor(view(), view({ activePlayerId: ME }), ME)).toEqual(["yourTurn"]);
    expect(gameSoundsFor(view({ activePlayerId: ME }), view(), ME)).toEqual([]);
    expect(gameSoundsFor(view(), view({ activePlayerId: ME }), null)).toEqual([]);
  });

  it("plays only the result jingle when the game ends", () => {
    const won = view({
      gameOver: true,
      winnerId: ME,
      players: [player(ME), player("player-1", { life: 0 })],
    });
    const lost = view({
      gameOver: true,
      winnerId: "player-1",
      players: [player(ME, { life: 0 }), player("player-1")],
    });
    expect(gameSoundsFor(view(), won, ME)).toEqual(["victory"]);
    expect(gameSoundsFor(view(), lost, ME)).toEqual(["defeat"]);
    expect(gameSoundsFor(view(), won, null)).toEqual([]);
    expect(gameSoundsFor(won, won, ME)).toEqual([]);
  });

  it("caps sounds per update in priority order", () => {
    const next = view({
      turn: 4,
      activePlayerId: ME,
      stack: [{ id: "s1" } as StackObjectDto],
      players: [player(ME, { cardsDrawnThisTurn: 1, life: 18 }), player("player-1")],
    });
    expect(gameSoundsFor(view(), next, ME)).toEqual(["yourTurn", "cast"]);
  });
});

describe("clampVolume", () => {
  it("keeps values inside the range", () => {
    expect(clampVolume(0, 0.5)).toBe(0);
    expect(clampVolume(0.4, 0.5)).toBe(0.4);
    expect(clampVolume(1, 0.5)).toBe(1);
  });

  it("clamps values outside the range", () => {
    expect(clampVolume(1.5, 0.5)).toBe(1);
    expect(clampVolume(-0.2, 0.5)).toBe(0);
  });

  it("falls back for invalid values", () => {
    expect(clampVolume(undefined, 0.5)).toBe(0.5);
    expect(clampVolume(Number.NaN, 0.5)).toBe(0.5);
    expect(clampVolume("0.7", 0.5)).toBe(0.5);
  });
});
