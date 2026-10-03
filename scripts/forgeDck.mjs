const SECTION = /^\[(.+)]$/;
const ENTRY = /^(\d+)\s+(.+)$/;
const NAME_TAIL = /^(.*?)\s*\[([A-Za-z0-9]+)]\s*\[(\d{4})]$/;

export function parseDckLine(line) {
  const match = ENTRY.exec(line.trim());
  if (!match) return null;
  const [rawName, set = ""] = match[2].split("|").map((part) => part.trim());
  const name = rawName.replace(/\+$/, "").trim();
  if (!name) return null;
  return {
    name,
    count: Number(match[1]),
    set: set.toLowerCase(),
    cardNumber: "",
  };
}

export function parseDeckName(raw) {
  const match = NAME_TAIL.exec(raw.trim());
  if (!match) return { label: raw.trim(), set: "", year: "" };
  return { label: match[1].trim(), set: match[2].toUpperCase(), year: match[3] };
}

export function parseDck(text) {
  const metadata = {};
  const sections = { commander: [], main: [], sideboard: [] };
  let current = "";
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const section = SECTION.exec(line);
    if (section) {
      current = section[1].toLowerCase();
      continue;
    }
    if (current === "metadata") {
      const eq = line.indexOf("=");
      if (eq > 0) metadata[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
    } else if (current in sections) {
      const entry = parseDckLine(line);
      if (entry) sections[current].push(entry);
    }
  }
  const { label, set, year } = parseDeckName(metadata.name ?? "");
  return {
    label,
    set: set || (metadata.set ?? "").toUpperCase(),
    year,
    description: metadata.description ?? "",
    commanders: sections.commander,
    main: sections.main,
    sideboard: sections.sideboard,
  };
}

export function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
