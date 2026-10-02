import { describe, expect, it } from "vitest";
import { isReactiveCard } from "./reactiveCards";

const instant = (name: string, text: string, keywords: string[] = []) => ({
  identity: { name },
  types: ["Instant"],
  text,
  keywords,
});

describe("isReactiveCard", () => {
  it("ignores spells nobody casts on another turn", () => {
    expect(
      isReactiveCard(
        instant(
          "Savage Summoning",
          "Savage Summoning can't be countered. The next creature card you cast this turn can be cast as though it had flash. That spell can't be countered. That creature enters the battlefield with an additional +1/+1 counter on it.",
        ),
      ),
    ).toBe(false);
    expect(
      isReactiveCard(
        instant(
          "Brainstorm",
          "Draw three cards, then put two cards from your hand on top of your library in any order.",
        ),
      ),
    ).toBe(false);
  });

  it.each([
    ["Counterspell", "Counter target spell."],
    ["Fog", "Prevent all combat damage that would be dealt this turn."],
    ["Giant Growth", "Target creature gets +3/+3 until end of turn."],
    [
      "Swords to Plowshares",
      "Exile target creature. Its controller gains life equal to its power.",
    ],
    [
      "Heroic Intervention",
      "Permanents you control gain hexproof and indestructible until end of turn.",
    ],
    ["Lightning Bolt", "Lightning Bolt deals 3 damage to any target."],
  ])("flags %s", (name, text) => {
    expect(isReactiveCard(instant(name, text))).toBe(true);
  });

  it("flags a flash creature", () => {
    expect(
      isReactiveCard({
        identity: { name: "Ambush Viper" },
        types: ["Creature"],
        text: "Flash\nDeathtouch",
        keywords: ["Flash", "Deathtouch"],
      }),
    ).toBe(true);
  });

  it("does not flag an ordinary sorcery", () => {
    expect(
      isReactiveCard({
        identity: { name: "Divination" },
        types: ["Sorcery"],
        text: "Draw two cards.",
        keywords: [],
      }),
    ).toBe(false);
  });
});
