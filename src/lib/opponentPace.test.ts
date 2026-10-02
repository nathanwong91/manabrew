import { describe, expect, it } from "vitest";
import { isPacedSnapshot, paceDelayMs } from "./opponentPace";

describe("paceDelayMs", () => {
  it("never delays when instant or unpaced", () => {
    expect(paceDelayMs({ pace: "instant", lastAppliedAt: 100, now: 100, paced: true })).toBe(0);
    expect(paceDelayMs({ pace: "slow", lastAppliedAt: 100, now: 100, paced: false })).toBe(0);
  });

  it("waits out the remainder of the gap", () => {
    expect(paceDelayMs({ pace: "normal", lastAppliedAt: 1000, now: 1100, paced: true })).toBe(350);
    expect(paceDelayMs({ pace: "slow", lastAppliedAt: 1000, now: 1100, paced: true })).toBe(900);
  });

  it("does not delay once the gap has elapsed", () => {
    expect(paceDelayMs({ pace: "normal", lastAppliedAt: 1000, now: 1450, paced: true })).toBe(0);
    expect(paceDelayMs({ pace: "slow", lastAppliedAt: 1000, now: 5000, paced: true })).toBe(0);
  });
});

describe("isPacedSnapshot", () => {
  const view = (priorityPlayerId: string, gameOver = false) => ({ priorityPlayerId, gameOver });

  it("paces opponent priority states", () => {
    expect(isPacedSnapshot({ gameView: view("player-1"), prompt: null }, "player-0")).toBe(true);
  });

  it("does not pace local priority, prompts, game over or prompt-only entries", () => {
    expect(isPacedSnapshot({ gameView: view("player-0"), prompt: null }, "player-0")).toBe(false);
    expect(isPacedSnapshot({ gameView: view("player-1"), prompt: {} }, "player-0")).toBe(false);
    expect(isPacedSnapshot({ gameView: view("player-1", true), prompt: null }, "player-0")).toBe(
      false,
    );
    expect(isPacedSnapshot({ gameView: null, prompt: {} }, "player-0")).toBe(false);
  });
});
