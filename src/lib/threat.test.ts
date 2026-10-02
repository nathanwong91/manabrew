import { describe, expect, it } from "vitest";
import { commanderDamageFrom, threatScore, topThreatId, untappedCreaturePower } from "./threat";

const creature = (controllerId: string, power: string | null, tapped = false) => ({
  controllerId,
  tapped,
  types: ["Creature"],
  power,
});

describe("untappedCreaturePower", () => {
  it("sums untapped creature power for one controller", () => {
    const cards = [
      creature("a", "3"),
      creature("a", "2", true),
      creature("a", "*"),
      creature("b", "5"),
      { controllerId: "a", tapped: false, types: ["Land"], power: null },
    ];
    expect(untappedCreaturePower(cards, "a")).toBe(3);
  });
});

describe("commanderDamageFrom", () => {
  it("sums only commanders owned by the player", () => {
    const owners = new Map([
      ["c1", "a"],
      ["c2", "b"],
      ["c3", "a"],
    ]);
    expect(commanderDamageFrom({ c1: 5, c2: 7, c3: 2 }, owners, "a")).toBe(7);
  });
});

describe("threatScore and topThreatId", () => {
  it("weights commander damage above raw power", () => {
    const board = threatScore({ boardPower: 10, commanderDamage: 0, poison: 0 });
    const commander = threatScore({ boardPower: 4, commanderDamage: 6, poison: 0 });
    expect(commander).toBeGreaterThan(board);
    expect(
      topThreatId([
        { id: "a", score: board },
        { id: "b", score: commander },
      ]),
    ).toBe("b");
  });

  it("marks nobody when every score is zero", () => {
    expect(topThreatId([{ id: "a", score: 0 }])).toBeNull();
  });

  it("keeps the first of equal scores", () => {
    expect(
      topThreatId([
        { id: "a", score: 4 },
        { id: "b", score: 4 },
      ]),
    ).toBe("a");
  });
});
