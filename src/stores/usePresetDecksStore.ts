import { create } from "zustand";
import { useMemo } from "react";
import {
  expandPresetDeckDefinitions,
  loadPreconDeckDefinitions,
  loadPresetDeckDefinitions,
  presetSupportsEngine,
  type PresetDeck,
} from "@/lib/presetDecks";
import type { EngineKind } from "@/protocol";

interface PresetDecksState {
  decks: PresetDeck[];
  resolved: boolean;
  precons: PresetDeck[];
  prefetch: () => Promise<void>;
  prefetchPrecons: () => Promise<void>;
}

let prefetchPromise: Promise<void> | null = null;
let preconPromise: Promise<void> | null = null;

export const usePresetDecksStore = create<PresetDecksState>((set) => ({
  decks: [],
  resolved: false,
  precons: [],
  prefetch: () => {
    if (prefetchPromise) return prefetchPromise;
    prefetchPromise = (async () => {
      try {
        const definitions = await loadPresetDeckDefinitions();
        set({ decks: expandPresetDeckDefinitions(definitions), resolved: true });
      } catch (err) {
        set({ resolved: true });
        if (import.meta.env?.DEV) {
          console.warn("[usePresetDecks] prefetch failed:", err);
        }
      }
    })();
    return prefetchPromise;
  },
  prefetchPrecons: () => {
    if (preconPromise) return preconPromise;
    preconPromise = (async () => {
      try {
        const definitions = await loadPreconDeckDefinitions();
        set({ precons: expandPresetDeckDefinitions(definitions) });
      } catch (err) {
        preconPromise = null;
        if (import.meta.env?.DEV) {
          console.warn("[usePresetDecks] precon prefetch failed:", err);
        }
      }
    })();
    return preconPromise;
  },
}));

export function usePresetDecks(engine?: EngineKind): PresetDeck[] {
  const decks = usePresetDecksStore((s) => s.decks);
  if (!prefetchPromise) {
    void usePresetDecksStore.getState().prefetch();
  }
  return useMemo(
    () => (engine ? decks.filter((deck) => presetSupportsEngine(deck, engine)) : decks),
    [decks, engine],
  );
}

export function usePreconDecks(engine?: EngineKind): PresetDeck[] {
  const precons = usePresetDecksStore((s) => s.precons);
  if (!preconPromise) {
    void usePresetDecksStore.getState().prefetchPrecons();
  }
  return useMemo(
    () => (engine ? precons.filter((deck) => presetSupportsEngine(deck, engine)) : precons),
    [precons, engine],
  );
}

export function usePresetDecksResolved(): boolean {
  return usePresetDecksStore((state) => state.resolved);
}

export function prefetchPresetDecks(): Promise<void> {
  return usePresetDecksStore.getState().prefetch();
}
