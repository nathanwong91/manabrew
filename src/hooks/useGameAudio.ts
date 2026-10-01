import { useEffect, useRef } from "react";
import {
  clampVolume,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SOUND_EFFECTS_VOLUME,
  gameSoundsFor,
  MUSIC_TRACKS,
  SOUND_FILES,
  type GameSound,
} from "@/lib/gameSounds";
import { useGameStore } from "@/stores/useGameStore";
import { usePreferencesStore } from "@/stores/usePreferencesStore";

const SOUND_COOLDOWN_MS = 80;
const lastPlayedAt = new Map<GameSound, number>();

function playSound(sound: GameSound) {
  const { soundEffectsEnabled, soundEffectsVolume } = usePreferencesStore.getState();
  if (!soundEffectsEnabled) return;
  const now = performance.now();
  if (now - (lastPlayedAt.get(sound) ?? -Infinity) < SOUND_COOLDOWN_MS) return;
  lastPlayedAt.set(sound, now);
  const audio = new Audio(SOUND_FILES[sound]);
  audio.volume = clampVolume(soundEffectsVolume, DEFAULT_SOUND_EFFECTS_VOLUME);
  audio.play().catch(() => {});
}

export function useGameAudio() {
  const musicEnabled = usePreferencesStore((s) => s.musicEnabled);
  const musicVolume = usePreferencesStore((s) => s.musicVolume);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!musicEnabled) return;
    let track = Math.floor(Math.random() * MUSIC_TRACKS.length);
    const audio = new Audio(MUSIC_TRACKS[track]);
    audio.volume = clampVolume(usePreferencesStore.getState().musicVolume, DEFAULT_MUSIC_VOLUME);
    musicRef.current = audio;
    const start = () => {
      audio.play().catch(() => {});
    };
    const playNext = () => {
      track = (track + 1) % MUSIC_TRACKS.length;
      audio.src = MUSIC_TRACKS[track];
      start();
    };
    audio.addEventListener("ended", playNext);
    window.addEventListener("pointerdown", start, { once: true });
    start();
    return () => {
      window.removeEventListener("pointerdown", start);
      audio.removeEventListener("ended", playNext);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      musicRef.current = null;
    };
  }, [musicEnabled]);

  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = clampVolume(musicVolume, DEFAULT_MUSIC_VOLUME);
  }, [musicVolume]);

  useEffect(
    () =>
      useGameStore.subscribe((state, previous) => {
        if (!state.gameView || state.gameView === previous.gameView) return;
        for (const sound of gameSoundsFor(previous.gameView, state.gameView, state.myPlayerSlot)) {
          playSound(sound);
        }
      }),
    [],
  );
}
