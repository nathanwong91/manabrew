import { describe, expect, it } from "vitest";
import { parseDck, parseDckLine, parseDeckName, slugify } from "./forgeDck.mjs";

describe("parseDckLine", () => {
  it("reads name, set and collector number", () => {
    expect(parseDckLine("1 Sol Ring|C21|263")).toEqual({
      name: "Sol Ring",
      count: 1,
      set: "c21",
      cardNumber: "263",
    });
  });

  it("tolerates a missing collector number and a missing set", () => {
    expect(parseDckLine("1 Thrummingbird|C16")).toMatchObject({ set: "c16", cardNumber: "" });
    expect(parseDckLine("1 Command Tower")).toMatchObject({ set: "", cardNumber: "" });
  });

  it("strips the trailing foil marker and keeps multiple copies", () => {
    expect(parseDckLine("1 Atraxa, Praetors' Voice+|C16")).toMatchObject({
      name: "Atraxa, Praetors' Voice",
    });
    expect(parseDckLine("35 Forest|TDC|312")?.count).toBe(35);
  });

  it("ignores lines that are not entries", () => {
    expect(parseDckLine("Name=Foo")).toBeNull();
    expect(parseDckLine("")).toBeNull();
  });
});

describe("parseDeckName", () => {
  it("splits label, set and year", () => {
    expect(parseDeckName("Temur Roar [TDC] [2025]")).toEqual({
      label: "Temur Roar",
      set: "TDC",
      year: "2025",
    });
  });

  it("keeps a bare name", () => {
    expect(parseDeckName("Plain Name")).toEqual({ label: "Plain Name", set: "", year: "" });
  });
});

describe("parseDck", () => {
  const text = [
    "[metadata]",
    "Name=Partner Pair [WHO] [2023]",
    "[Commander]",
    "1 Rose Tyler|WHO|1",
    "1 The Tenth Doctor|WHO|2",
    "[main]",
    "1 Sol Ring|C21",
    "2 Island|WHO|300",
    "[Sideboard]",
  ].join("\r\n");

  it("collects commanders, main deck and tolerates empty or lowercase sections", () => {
    const deck = parseDck(text);
    expect(deck.label).toBe("Partner Pair");
    expect(deck.set).toBe("WHO");
    expect(deck.year).toBe("2023");
    expect(deck.commanders.map((card) => card.name)).toEqual(["Rose Tyler", "The Tenth Doctor"]);
    expect(deck.main).toHaveLength(2);
    expect(deck.sideboard).toEqual([]);
  });
});

describe("slugify", () => {
  it("produces a stable id fragment", () => {
    expect(slugify("Angels: Cooler & Winged! TDC")).toBe("angels_cooler_winged_tdc");
  });
});
