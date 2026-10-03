import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  expandPresetDeckDefinitions,
  preconImageUris,
  preconToPresetDefinitions,
  type PreconCatalog,
} from "@/lib/presetDecks";
import { getFormat, validateDeckSections } from "@/lib/formats";

const catalog = JSON.parse(
  readFileSync(new URL("../../public/precon_decks/precons.json", import.meta.url), "utf8"),
) as PreconCatalog;
const decks = expandPresetDeckDefinitions(preconToPresetDefinitions(catalog));

describe("precon catalog", () => {
  it("rebuilds scryfall image urls from the compact id", () => {
    const uris = preconImageUris("2c3549f6-25df-4ea7-84ad-922ccd4af6b2?1783907190");
    expect(uris.normal).toBe(
      "https://cards.scryfall.io/normal/front/2/c/2c3549f6-25df-4ea7-84ad-922ccd4af6b2.jpg?1783907190",
    );
    expect(uris.png.endsWith(".png?1783907190")).toBe(true);
  });

  it("expands every precon into a legal 100 card Forge commander deck", () => {
    const commander = getFormat("commander")!;
    expect(decks.length).toBeGreaterThan(100);
    for (const deck of decks) {
      expect(deck.format).toBe("commander");
      expect(deck.engines).toEqual(["Forge"]);
      expect(deck.cards.length + (deck.commanders?.length ?? 0)).toBe(100);
      expect(validateDeckSections({ deck }, commander).errors).toEqual([]);
    }
  });

  it("keeps both partner commanders out of the main deck", () => {
    const pair = decks.find((deck) => (deck.commanders?.length ?? 0) === 2);
    expect(pair).toBeDefined();
    expect(pair!.cards).toHaveLength(98);
  });
});
