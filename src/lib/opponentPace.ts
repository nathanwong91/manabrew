export type OpponentPace = "instant" | "normal" | "slow";

export const OPPONENT_PACE_GAP_MS: Record<OpponentPace, number> = {
  instant: 0,
  normal: 450,
  slow: 1000,
};

export const OPPONENT_PACE_OPTIONS = [
  { value: "instant", label: "Instant" },
  { value: "normal", label: "Normal" },
  { value: "slow", label: "Slow" },
] as const;

export interface PaceInput {
  pace: OpponentPace;
  lastAppliedAt: number;
  now: number;
  paced: boolean;
}

export function paceDelayMs({ pace, lastAppliedAt, now, paced }: PaceInput): number {
  if (!paced) return 0;
  return Math.max(0, lastAppliedAt + OPPONENT_PACE_GAP_MS[pace] - now);
}

type PaceSnapshot = {
  gameView: { priorityPlayerId: string; gameOver?: boolean } | null;
  prompt: unknown;
};

export function isPacedSnapshot(snapshot: PaceSnapshot, myPlayerSlot: string | null): boolean {
  const view = snapshot.gameView;
  if (!view || snapshot.prompt || view.gameOver) return false;
  return view.priorityPlayerId !== myPlayerSlot;
}

let lastAppliedAt = 0;

export function notePaceApplied(): void {
  lastAppliedAt = Date.now();
}

export function pendingPaceDelayMs(
  snapshot: PaceSnapshot,
  myPlayerSlot: string | null,
  pace: OpponentPace,
): number {
  return paceDelayMs({
    pace,
    lastAppliedAt,
    now: Date.now(),
    paced: isPacedSnapshot(snapshot, myPlayerSlot),
  });
}
