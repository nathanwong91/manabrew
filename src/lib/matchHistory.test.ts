import { describe, expect, it } from "vitest";
import { buildMatchEntry } from "@/lib/matchHistory";
import type { ClientGameView } from "@/stores/gameStore.types";
import type { Deck } from "@/protocol/deck";

const view = (over: Partial<ClientGameView>, me = "conceded") =>
  ({
    turn: 7,
    winnerId: "player-1",
    players: [
      { id: "player-0", name: "You", isHuman: true, life: 0, status: me },
      { id: "player-1", name: "Forge AI", isHuman: false, life: 12, status: "playing" },
    ],
    ...over,
  }) as unknown as ClientGameView;

const decks = {
  "player-0": { name: "Mine", cards: [] },
  "player-1": { name: "Theirs", cards: [], commanders: [{ identity: { name: "Atraxa" } }] },
} as unknown as Record<string, Deck>;

const base = { id: "g1", endedAt: "2026-01-01T00:00:00.000Z", format: "commander", decks };

describe("buildMatchEntry", () => {
  it("records seats, decks and commanders", () => {
    const entry = buildMatchEntry({
      ...base,
      gameView: view({}, "lost"),
      myPlayerSlot: "player-0",
      over: true,
      engineCrash: null,
    })!;
    expect(entry.result).toBe("lost");
    expect(entry.turns).toBe(7);
    expect(entry.seats[0]).toMatchObject({ isMe: true, deckName: "Mine", won: false, life: 0 });
    expect(entry.seats[1]).toMatchObject({ commander: "Atraxa", won: true, status: "playing" });
  });

  it("maps won, draw, conceded, abandoned and engine error", () => {
    const run = (v: ClientGameView, over: boolean, engineCrash: string | null = null) =>
      buildMatchEntry({ ...base, gameView: v, myPlayerSlot: "player-0", over, engineCrash })!
        .result;
    expect(run(view({ winnerId: "player-0" }, "playing"), true)).toBe("won");
    expect(run(view({ winnerId: null }, "playing"), true)).toBe("draw");
    expect(run(view({}, "conceded"), true)).toBe("conceded");
    expect(run(view({ winnerId: null }, "playing"), false)).toBe("abandoned");
    expect(run(view({}, "playing"), true, "boom")).toBe("error");
  });

  it("returns null without a game view", () => {
    expect(
      buildMatchEntry({
        ...base,
        gameView: null,
        myPlayerSlot: null,
        over: true,
        engineCrash: null,
      }),
    ).toBeNull();
  });
});
