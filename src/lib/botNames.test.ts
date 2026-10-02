import { describe, expect, it } from "vitest";
import { displayPlayerName, renameBotsInText } from "./botNames";

describe("displayPlayerName", () => {
  it("gives each bot a distinct friendly name and leaves people alone", () => {
    const raw = [
      "self-hosted-node-6449598d-5347-49fe-a6fd-fffd07bc4bff-bot-2",
      "self-hosted-node-6449598d-5347-49fe-a6fd-fffd07bc4bff-bot-2 2",
      "self-hosted-node-6449598d-5347-49fe-a6fd-fffd07bc4bff-bot-2 3",
    ];
    const names = raw.map((name) => displayPlayerName("game-1", name));
    expect(new Set(names).size).toBe(3);
    expect(names.some((name) => name.includes("bot"))).toBe(false);
    expect(displayPlayerName("game-1", raw[0]!)).toBe(names[0]);
    expect(displayPlayerName("game-1", "Lindraden")).toBe("Lindraden");
    expect(renameBotsInText({ label: `${raw[1]} rolled 12` }).label).toBe(`${names[1]} rolled 12`);
  });
});
