import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/lib/constants";

export type MatchResult = "won" | "lost" | "draw" | "conceded" | "abandoned" | "error";

export interface MatchSeat {
  name: string;
  deckName?: string;
  commander?: string;
  life: number;
  isMe: boolean;
  won: boolean;
  status: "playing" | "conceded" | "lost";
}

export interface MatchEntry {
  id: string;
  endedAt: string;
  format: string | null;
  turns: number;
  result: MatchResult;
  seats: MatchSeat[];
}

const MAX_ENTRIES = 100;

interface MatchHistoryState {
  entries: MatchEntry[];
  add: (entry: MatchEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useMatchHistoryStore = create<MatchHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      add: (entry) =>
        set((s) => ({
          entries: [entry, ...s.entries.filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES),
        })),
      remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      clear: () => set({ entries: [] }),
    }),
    { name: STORAGE_KEYS.MATCH_HISTORY, partialize: (s) => ({ entries: s.entries }) },
  ),
);
