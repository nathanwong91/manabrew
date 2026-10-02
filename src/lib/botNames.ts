const BOT_NAMES = [
  "Aldric",
  "Brienne",
  "Cassius",
  "Delphine",
  "Eldrin",
  "Fenwick",
  "Gwendolyn",
  "Hadrian",
  "Isolde",
  "Jareth",
  "Kestrel",
  "Lysandra",
  "Mordecai",
  "Nyssa",
  "Orrin",
  "Perrin",
  "Quillon",
  "Rowena",
  "Soren",
  "Thalia",
  "Ulric",
  "Vesper",
  "Wren",
  "Xander",
  "Yselda",
  "Zephyr",
  "Alaric",
  "Briar",
  "Corvin",
  "Dagny",
  "Elowen",
  "Faelan",
  "Garrick",
  "Helena",
  "Ivor",
  "Juniper",
  "Kael",
  "Liora",
  "Magnus",
  "Niamh",
  "Oberon",
  "Petra",
  "Rhiannon",
  "Seraphina",
  "Tobias",
  "Valen",
];

const BOT_NAME = /-bot-[0-9a-z]+(?: \d+)?$/i;

let currentGameId = "";
const assigned = new Map<string, string>();

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export function displayPlayerName(gameId: string, rawName: string): string {
  if (gameId !== currentGameId) {
    currentGameId = gameId;
    assigned.clear();
  }
  if (!BOT_NAME.test(rawName)) return rawName;
  const known = assigned.get(rawName);
  if (known) return known;
  const used = new Set(assigned.values());
  const start = hash(`${gameId}:${rawName}`);
  let name = BOT_NAMES[start % BOT_NAMES.length]!;
  for (let step = 1; used.has(name) && step < BOT_NAMES.length; step += 1) {
    name = BOT_NAMES[(start + step) % BOT_NAMES.length]!;
  }
  assigned.set(rawName, name);
  return name;
}

export function renameBotsInText<T>(value: T): T {
  if (assigned.size === 0) return value;
  const replacements = [...assigned].sort(([a], [b]) => b.length - a.length);
  const walk = (item: unknown): unknown => {
    if (typeof item === "string") {
      return replacements.reduce((text, [raw, name]) => text.split(raw).join(name), item);
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, walk(entry)]));
    }
    return item;
  };
  return walk(value) as T;
}
