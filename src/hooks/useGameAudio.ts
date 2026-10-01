import { useEffect } from "react";
import {
  clampVolume,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SOUND_EFFECTS_VOLUME,
  gameSoundsFor,
  MUSIC_TRACKS,
  musicMoodFor,
  SOUND_FILES,
  type GameSound,
  type MusicMood,
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

const CROSSFADE_MS = 1500;
const FADE_TICK_MS = 50;
const CALM_HOLD_MS = 20000;

function musicVolume() {
  return clampVolume(usePreferencesStore.getState().musicVolume, DEFAULT_MUSIC_VOLUME);
}

function pickTrack(mood: MusicMood, previous: string | null): string {
  const pool = MUSIC_TRACKS[mood].filter((track) => track !== previous);
  return pool[Math.floor(Math.random() * pool.length)] ?? MUSIC_TRACKS[mood][0];
}

function stopAudio(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

export function useGameAudio() {
  const musicEnabled = usePreferencesStore((s) => s.musicEnabled);

  useEffect(() => {
    if (!musicEnabled) return;
    let mood = musicMoodFor(useGameStore.getState().gameView);
    let track = pickTrack(mood, null);
    let outgoing: HTMLAudioElement | null = null;
    let fadeTimer = 0;
    let holdTimer = 0;

    const play = (src: string, volume: number) => {
      const audio = new Audio(src);
      audio.volume = volume;
      audio.addEventListener("ended", () => {
        if (audio === current) switchTo(mood, false);
      });
      audio.play().catch(() => {});
      return audio;
    };

    let current = play(track, musicVolume());

    const finishFade = () => {
      window.clearInterval(fadeTimer);
      if (outgoing) stopAudio(outgoing);
      outgoing = null;
    };

    const switchTo = (next: MusicMood, crossfade: boolean) => {
      finishFade();
      mood = next;
      track = pickTrack(next, track);
      const previous = current;
      current = play(track, crossfade ? 0 : musicVolume());
      if (!crossfade) {
        stopAudio(previous);
        return;
      }
      outgoing = previous;
      const from = previous.volume;
      const started = performance.now();
      fadeTimer = window.setInterval(() => {
        const t = Math.min(1, (performance.now() - started) / CROSSFADE_MS);
        current.volume = musicVolume() * t;
        previous.volume = from * (1 - t);
        if (t === 1) finishFade();
      }, FADE_TICK_MS);
    };

    const clearHold = () => {
      window.clearTimeout(holdTimer);
      holdTimer = 0;
    };

    const unsubscribeGame = useGameStore.subscribe((state, prev) => {
      if (state.gameView === prev.gameView) return;
      const next = musicMoodFor(state.gameView);
      if (next === mood) {
        clearHold();
      } else if (next === "tense") {
        clearHold();
        switchTo("tense", true);
      } else if (!holdTimer) {
        holdTimer = window.setTimeout(() => {
          holdTimer = 0;
          switchTo("calm", true);
        }, CALM_HOLD_MS);
      }
    });

    const unsubscribeVolume = usePreferencesStore.subscribe((state, prev) => {
      if (state.musicVolume !== prev.musicVolume && !outgoing) current.volume = musicVolume();
    });

    const resume = () => {
      current.play().catch(() => {});
    };
    window.addEventListener("pointerdown", resume, { once: true });

    return () => {
      window.removeEventListener("pointerdown", resume);
      unsubscribeGame();
      unsubscribeVolume();
      clearHold();
      finishFade();
      stopAudio(current);
    };
  }, [musicEnabled]);

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
