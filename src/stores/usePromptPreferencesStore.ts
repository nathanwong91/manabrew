import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PromptType } from "@/protocol";

export interface PromptPreferencesState {
  show: Partial<Record<PromptType, boolean>>;
  fullControl: boolean;
  skipNonReactiveInstants: boolean;
  autoPayMana: boolean;

  setShow: (promptType: PromptType, show: boolean) => void;
  clearShow: (promptType: PromptType) => void;
  setFullControl: (fullControl: boolean) => void;
  setSkipNonReactiveInstants: (skipNonReactiveInstants: boolean) => void;
  setAutoPayMana: (autoPayMana: boolean) => void;
}

export const usePromptPreferencesStore = create<PromptPreferencesState>()(
  persist(
    (set) => ({
      show: {},
      fullControl: false,
      skipNonReactiveInstants: false,
      autoPayMana: false,
      setShow: (promptType, show) => set((s) => ({ show: { ...s.show, [promptType]: show } })),
      clearShow: (promptType) =>
        set((s) => {
          const next = { ...s.show };
          delete next[promptType];
          return { show: next };
        }),
      setFullControl: (fullControl) => set({ fullControl }),
      setSkipNonReactiveInstants: (skipNonReactiveInstants) => set({ skipNonReactiveInstants }),
      setAutoPayMana: (autoPayMana) => set({ autoPayMana }),
    }),
    {
      name: "manabrew.promptPreferences",
      partialize: (s) => ({
        show: s.show,
        fullControl: s.fullControl,
        skipNonReactiveInstants: s.skipNonReactiveInstants,
        autoPayMana: s.autoPayMana,
      }),
    },
  ),
);
