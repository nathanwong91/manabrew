import { describe, expect, it } from "vitest";
import { commanderLine } from "./commanderNames";

const card = (name: string, supertypes: string[] = ["Legendary"]) => ({
  identity: { name },
  supertypes,
});

describe("commanderLine", () => {
  it("joins partner commanders from the deck", () => {
    expect(commanderLine({ commanders: [card("Thrasios"), card("Tymna")] }, [])).toBe(
      "Thrasios & Tymna",
    );
  });

  it("falls back to legendary command zone cards", () => {
    expect(commanderLine(undefined, [card("Atraxa"), card("Emblem", [])])).toBe("Atraxa");
  });

  it("is undefined without commanders", () => {
    expect(commanderLine({ commanders: [] }, [])).toBeUndefined();
    expect(commanderLine(undefined, [])).toBeUndefined();
  });
});
