#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchBatch, metadataFromScryfall } from "./enrich-preset-decks.mjs";
import { parseDck, slugify } from "./forgeDck.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SOURCE_DIR = process.argv[2] ?? path.join(ROOT, "forge/forge-gui/res/quest/commanderprecons");
const PRESET_DIR = path.join(ROOT, "public/preset_decks");
const OUT_FILE = path.join(ROOT, "public/precon_decks/precons.json");
const BATCH_SIZE = 75;
const DUPLICATE_OVERLAP = 0.9;
const COLOR_CLASS = {
  W: "text-yellow-200",
  U: "text-sky-300",
  B: "text-purple-300",
  R: "text-red-400",
  G: "text-green-400",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const printingKey = (name, set, number) => `${name.toLowerCase()}::${set}::${number.toLowerCase()}`;
const NAME_ALIASES = { "lim-dul's vault": "Lim-D\u00fbl's Vault" };
const frontName = (name) => {
  const front = name.split(/\s*\/\/\s*/)[0].trim();
  return NAME_ALIASES[front.toLowerCase()] ?? front;
};
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

function imgOf(url) {
  const match = /\/(?:front|back)\/\w\/\w\/([0-9a-f-]{36})\.\w+(\?\d+)?$/.exec(url ?? "");
  return match ? `${match[1]}${match[2] ?? ""}` : undefined;
}

function compactCard(entry, meta) {
  const card = { name: entry.name, set: entry.set, cardNumber: entry.cardNumber };
  if (!meta) return card;
  const put = (key, value) => {
    if (value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) {
      card[key] = value;
    }
  };
  put("manaCost", meta.manaCost);
  put("colors", meta.colors);
  put("colorIdentity", meta.colorIdentity);
  if (meta.cmc) card.cmc = meta.cmc;
  put("types", meta.types);
  put("subtypes", meta.subtypes);
  put("supertypes", meta.supertypes);
  put("text", meta.text);
  if (meta.layout && meta.layout !== "normal") card.layout = meta.layout;
  put("power", meta.power);
  put("toughness", meta.toughness);
  put("img", imgOf(meta.imageUrl));
  put("allParts", meta.allParts);
  if (meta.backFace) {
    card.backFace = {
      name: meta.backFace.name,
      manaCost: meta.backFace.manaCost,
      typeLine: meta.backFace.typeLine,
      oracleText: meta.backFace.oracleText,
    };
    const backImg = imgOf(meta.backFace.uris?.normal);
    if (backImg) card.backFace.img = backImg;
  }
  return card;
}

function indexResult(lookup, sc) {
  const meta = metadataFromScryfall(sc);
  const set = sc.set.toLowerCase();
  const number = sc.collector_number.toLowerCase();
  const name = sc.name.toLowerCase();
  lookup.set(printingKey(name, set, number), meta);
  lookup.set(printingKey(name, set, ""), meta);
  if (!lookup.has(printingKey(name, "", ""))) lookup.set(printingKey(name, "", ""), meta);
  for (const face of sc.card_faces ?? []) {
    const faceName = face.name.toLowerCase();
    if (!lookup.has(printingKey(faceName, "", ""))) lookup.set(printingKey(faceName, "", ""), meta);
    if (!lookup.has(printingKey(faceName, set, "")))
      lookup.set(printingKey(faceName, set, ""), meta);
  }
}

async function fetchAll(identifiers, lookup) {
  const notFound = [];
  for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
    const slice = identifiers.slice(i, i + BATCH_SIZE);
    process.stderr.write(
      `[precons] scryfall ${i / BATCH_SIZE + 1}/${Math.ceil(identifiers.length / BATCH_SIZE)}\r`,
    );
    let data;
    for (let attempt = 0; !data; attempt += 1) {
      try {
        data = await fetchBatch(slice);
      } catch (err) {
        if (attempt >= 5) throw err;
        await sleep(10000 * (attempt + 1));
      }
    }
    data.data.forEach((sc) => indexResult(lookup, sc));
    notFound.push(...(data.not_found ?? []));
    await sleep(120);
  }
  process.stderr.write("\n");
  return notFound;
}

function identifierFor(entry) {
  return { name: frontName(entry.name) };
}

function loadExistingPresets() {
  return fs
    .readdirSync(PRESET_DIR)
    .filter((file) => file.endsWith(".json") && file !== "index.json")
    .map((file) => {
      const json = JSON.parse(fs.readFileSync(path.join(PRESET_DIR, file), "utf8"));
      return {
        id: file.replace(/\.json$/, ""),
        commanders: asArray(json.commander).map((name) => name.toLowerCase()),
        names: new Set((json.cards ?? []).map((card) => card.name.toLowerCase())),
      };
    });
}

function findDuplicate(deck, existing) {
  const commanders = deck.commanders.map((card) => card.name.toLowerCase());
  const names = new Set(deck.main.map((card) => card.name.toLowerCase()));
  return existing.find((preset) => {
    if (!commanders.some((name) => preset.commanders.includes(name))) return false;
    const shared = [...names].filter((name) => preset.names.has(name)).length;
    return shared / Math.max(names.size, 1) >= DUPLICATE_OVERLAP;
  });
}

async function main() {
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((file) => file.endsWith(".dck"))
    .sort();
  const existing = loadExistingPresets();
  const skipped = [];
  const parsed = [];
  const seenIds = new Set();
  for (const file of files) {
    const deck = parseDck(fs.readFileSync(path.join(SOURCE_DIR, file), "utf8"));
    const total = [...deck.commanders, ...deck.main].reduce((sum, card) => sum + card.count, 0);
    if (deck.commanders.length === 0 || total !== 100) {
      skipped.push(`${file}: ${deck.commanders.length} commanders, ${total} cards`);
      continue;
    }
    const duplicate = findDuplicate(deck, existing);
    if (duplicate) {
      skipped.push(`${file}: duplicates preset ${duplicate.id}`);
      continue;
    }
    let id = `precon_${slugify(`${deck.label} ${deck.set}`)}`;
    if (seenIds.has(id)) id = `${id}_${deck.year}`;
    seenIds.add(id);
    parsed.push({ id, deck });
  }

  const unique = new Map();
  for (const { deck } of parsed) {
    for (const entry of [...deck.commanders, ...deck.main]) {
      const key = entry.name.toLowerCase();
      if (!unique.has(key)) unique.set(key, entry);
    }
  }
  console.error(`[precons] ${parsed.length} decks, ${unique.size} unique cards`);

  const lookup = new Map();
  const entries = [...unique.values()];
  await fetchAll(entries.map(identifierFor), lookup);
  const unresolved = entries.filter((entry) => !resolve(lookup, entry));

  const table = [];
  const tableIndex = new Map();
  const indexOf = (entry) => {
    const key = entry.name.toLowerCase();
    if (!tableIndex.has(key)) {
      tableIndex.set(key, table.length);
      table.push(compactCard(entry, resolve(lookup, entry)));
    }
    return tableIndex.get(key);
  };

  const decks = parsed.map(({ id, deck }) => {
    const refs = [...deck.commanders, ...deck.main].map((entry) => [indexOf(entry), entry.count]);
    const commanderNames = deck.commanders.map((entry) => entry.name);
    const identity = new Set();
    for (const entry of deck.commanders) {
      for (const color of resolve(lookup, entry)?.colorIdentity ?? []) identity.add(color);
    }
    const colors = [...identity];
    const color = colors.length === 1 ? COLOR_CLASS[colors[0]] : "text-amber-300";
    const desc = `Commander precon, ${deck.set} ${deck.year}`;
    return {
      id,
      label: deck.label,
      desc,
      color,
      format: "commander",
      commander: commanderNames.length === 1 ? commanderNames[0] : commanderNames,
      engines: ["Forge"],
      ai_eligible: true,
      cards: refs,
    };
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ cards: table, decks }) + "\n");
  console.error(
    `[precons] wrote ${decks.length} decks, ${table.length} cards -> ${path.relative(ROOT, OUT_FILE)}`,
  );
  console.error(`[precons] skipped ${skipped.length}${skipped.map((s) => `\n  ${s}`).join("")}`);
  console.error(
    `[precons] no scryfall metadata for ${unresolved.length} cards${unresolved.map((e) => `\n  ${e.name}`).join("")}`,
  );
}

function resolve(lookup, entry) {
  return (
    lookup.get(printingKey(entry.name, "", "")) ??
    lookup.get(printingKey(frontName(entry.name), "", ""))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
