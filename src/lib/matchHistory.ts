import type { Deck } from "@/protocol/deck";
import type { ClientGameView } from "@/stores/gameStore.types";
import type { MatchEntry, MatchResult } from "@/stores/useMatchHistoryStore";

export function buildMatchEntry(input: {
  id: string;
  endedAt: string;
  format: string | null;
  gameView: ClientGameView | null;
  myPlayerSlot: string | null;
  decks: Record<string, Deck>;
  over: boolean;
  engineCrash: string | null;
}): MatchEntry | null {
  const { gameView: view } = input;
  if (!view || view.players.length === 0) return null;
  const me = view.players.find((p) => p.id === input.myPlayerSlot) ?? view.players[0];
  let result: MatchResult;
  if (input.engineCrash) result = "error";
  else if (!input.over) result = "abandoned";
  else if (me.status === "conceded") result = "conceded";
  else if (view.winnerId == null) result = "draw";
  else result = view.winnerId === me.id ? "won" : "lost";
  return {
    id: input.id,
    endedAt: input.endedAt,
    format: input.format,
    turns: view.turn,
    result,
    seats: view.players.map((p) => ({
      name: p.name,
      deckName: input.decks[p.id]?.name || undefined,
      commander: input.decks[p.id]?.commanders?.[0]?.identity.name,
      life: p.life,
      isMe: p.id === me.id,
      won: p.id === view.winnerId,
      status: p.status,
    })),
  };
}
