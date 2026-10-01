import type { GameViewDto, PlayerDto } from "@/protocol/game";

export type GameSound =
  | "draw"
  | "land"
  | "cast"
  | "attack"
  | "damage"
  | "lifeGain"
  | "yourTurn"
  | "victory"
  | "defeat";

export type MusicMood = "calm" | "tense";

export const MUSIC_TRACKS: Record<MusicMood, readonly string[]> = {
  calm: [
    "/audio/music/fantasy-orchestral-theme.mp3",
    "/audio/music/a-legend-will-rise.mp3",
    "/audio/music/the-hope.mp3",
    "/audio/music/once-upon-a-time.mp3",
  ],
  tense: [
    "/audio/music/battle-theme-a.mp3",
    "/audio/music/qazijamjam.mp3",
    "/audio/music/prepare-to-fight.mp3",
    "/audio/music/determined-pursuit.mp3",
    "/audio/music/epic-endgame.mp3",
  ],
};

export const LOW_LIFE_THRESHOLD = 7;

export const SOUND_FILES: Record<GameSound, string> = {
  draw: "/audio/sfx/draw.mp3",
  land: "/audio/sfx/land.mp3",
  cast: "/audio/sfx/cast.mp3",
  attack: "/audio/sfx/attack.mp3",
  damage: "/audio/sfx/damage.mp3",
  lifeGain: "/audio/sfx/life-gain.mp3",
  yourTurn: "/audio/sfx/your-turn.mp3",
  victory: "/audio/sfx/victory.mp3",
  defeat: "/audio/sfx/defeat.mp3",
};

export const DEFAULT_MUSIC_VOLUME = 0.3;
export const DEFAULT_SOUND_EFFECTS_VOLUME = 0.5;

const MAX_SOUNDS_PER_UPDATE = 2;

export function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

type TurnCounter = "cardsDrawnThisTurn" | "landsPlayedThisTurn";

function counterRose(previous: GameViewDto, next: GameViewDto, key: TurnCounter): boolean {
  return next.players.some((p) => {
    const before =
      previous.turn === next.turn ? (previous.players.find((q) => q.id === p.id)?.[key] ?? 0) : 0;
    return p[key] > before;
  });
}

function attackerCount(view: GameViewDto): number {
  return view.zones
    .filter((z) => z.zone === "battlefield")
    .flatMap((z) => z.cards)
    .filter((c) => c.visibility === "visible" && Boolean(c.attackingPlayerId)).length;
}

export function musicMoodFor(view: GameViewDto | null): MusicMood {
  if (!view || view.gameOver) return "calm";
  const lowLife = view.players.some((p) => p.status === "playing" && p.life <= LOW_LIFE_THRESHOLD);
  return lowLife || attackerCount(view) > 0 ? "tense" : "calm";
}

function lifeChanges(previous: GameViewDto, next: GameViewDto): number[] {
  return next.players.map(
    (p: PlayerDto) => p.life - (previous.players.find((q) => q.id === p.id)?.life ?? p.life),
  );
}

export function gameSoundsFor(
  previous: GameViewDto | null,
  next: GameViewDto,
  myPlayerId: string | null,
): GameSound[] {
  if (!previous || previous.gameId !== next.gameId) return [];
  if (next.gameOver) {
    if (previous.gameOver || !myPlayerId) return [];
    return [next.winnerId === myPlayerId ? "victory" : "defeat"];
  }
  const sounds: GameSound[] = [];
  if (myPlayerId && next.activePlayerId === myPlayerId && previous.activePlayerId !== myPlayerId) {
    sounds.push("yourTurn");
  }
  if (attackerCount(previous) === 0 && attackerCount(next) > 0) sounds.push("attack");
  const previousStack = new Set(previous.stack.map((s) => s.id));
  if (next.stack.some((s) => !previousStack.has(s.id))) sounds.push("cast");
  if (counterRose(previous, next, "landsPlayedThisTurn")) sounds.push("land");
  const life = lifeChanges(previous, next);
  if (life.some((d) => d < 0)) sounds.push("damage");
  else if (life.some((d) => d > 0)) sounds.push("lifeGain");
  if (counterRose(previous, next, "cardsDrawnThisTurn")) sounds.push("draw");
  return sounds.slice(0, MAX_SOUNDS_PER_UPDATE);
}
