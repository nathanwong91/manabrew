import type {
  CardBackFaceSummary,
  CardPartComponent,
  Deck,
  DeckCard,
  DeckFormat,
} from "@/protocol/deck";
import type { EngineKind } from "@/protocol";
import type { ScryfallImageUris } from "@/types/scryfall";
import { frontFaceName } from "@/lib/scryfall.utils";

interface PresetDeckCardDefinition {
  name: string;
  count: number;
  set: string;
  cardNumber: string;
  manaCost?: string;
  colors?: string[];
  colorIdentity?: string[];
  cmc?: number;
  types?: string[];
  subtypes?: string[];
  supertypes?: string[];
  text?: string;
  uris: ScryfallImageUris;
  layout?: string;
  power?: string;
  toughness?: string;
  backFace?: CardBackFaceSummary;
  allParts?: Array<{ name: string; component: CardPartComponent }>;
}

export interface PresetDeckDefinition {
  id: string;
  label: string;
  desc: string;
  color: string;
  format?: DeckFormat | "historicBrawl";
  commander?: string | string[];
  coverCardName?: string;
  engines?: EngineKind[];
  cards: PresetDeckCardDefinition[];
  sideboard?: PresetDeckCardDefinition[];
}

export type PresetDeck = Deck & { engines?: EngineKind[] };

// A preset without an explicit engines list predates per-engine curation and is
// assumed playable everywhere except Ironsmith, whose card pool is verified
// per deck.
export function presetSupportsEngine(deck: PresetDeck, engine: EngineKind): boolean {
  if (!deck.engines) return engine !== "Ironsmith";
  return deck.engines.includes(engine);
}

export function choosePresetCoverCardName(
  cards: Array<{ name: string; count: number; set?: string }>,
): string | undefined {
  return (
    cards.find((card) => !/^([wburgc]|snow-)?basic land$/i.test(card.name))?.name ??
    cards.find((card) => !/^(plains|island|swamp|mountain|forest|wastes)$/i.test(card.name))
      ?.name ??
    cards[0]?.name
  );
}

export async function loadPresetDeckDefinitions(
  indexUrl = "/preset_decks/index.json",
  deckBaseUrl = "/preset_decks",
): Promise<PresetDeckDefinition[]> {
  const indexResponse = await fetch(indexUrl);
  if (!indexResponse.ok) {
    throw new Error(`Failed to fetch preset deck index: ${indexResponse.status}`);
  }
  const ids = (await indexResponse.json()) as string[];
  const results = await Promise.all(
    ids.map(async (id) => {
      const response = await fetch(`${deckBaseUrl}/${id}.json`);
      if (!response.ok) {
        console.warn(`[PresetDecks] Preset deck '${id}' failed (${response.status})`);
        return null;
      }
      const data = (await response.json()) as Omit<PresetDeckDefinition, "id">;
      return { id, ...data };
    }),
  );
  return results.filter((deck): deck is PresetDeckDefinition => deck !== null);
}

export function expandPresetDeckDefinition(preset: PresetDeckDefinition): PresetDeck {
  let index = 0;
  const cards: DeckCard[] = [];
  const sideboard: DeckCard[] = [];
  const commanders: DeckCard[] = [];

  const commanderNames = (
    Array.isArray(preset.commander) ? preset.commander : preset.commander ? [preset.commander] : []
  ).map(frontFaceName);
  const presetCommander = commanderNames[0];
  const appendCards = (
    entries: PresetDeckCardDefinition[],
    destination: DeckCard[],
    extractCommander = false,
  ) => {
    for (const entry of entries) {
      const name = frontFaceName(entry.name);
      for (let copy = 0; copy < entry.count; copy += 1) {
        const card: DeckCard = {
          identity: {
            id: `preset:${preset.id}:${index++}:${name}`,
            name,
            setCode: entry.set,
            cardNumber: entry.cardNumber,
            foil: false,
          },
          color: entry.colors ? entry.colors.join("") : "",
          colorIdentity: entry.colorIdentity ?? [],
          manaCost: entry.manaCost ?? "",
          cmc: entry.cmc ?? 0,
          types: entry.types ?? [],
          subtypes: entry.subtypes ?? [],
          supertypes: entry.supertypes ?? [],
          power: entry.power,
          toughness: entry.toughness,
          text: entry.text ?? "",
          uris: entry.uris,
          layout: entry.layout,
          backFace: entry.backFace,
          allParts: entry.allParts,
        };

        if (
          extractCommander &&
          commanderNames.includes(name) &&
          !commanders.some((existing) => existing.identity.name === name)
        ) {
          commanders.push(card);
        } else {
          destination.push(card);
        }
      }
    }
  };
  appendCards(preset.cards, cards, true);
  appendCards(preset.sideboard ?? [], sideboard);

  // Commander goes in `commanders[]`, not the main 99 — strip it out of cards.
  if (commanders.length < commanderNames.length) {
    throw new Error(`Preset commander missing from cards: ${commanderNames.join(", ")}`);
  }

  return {
    id: preset.id,
    name: preset.label,
    description: preset.desc,
    color: preset.color,
    format: preset.format === "historicBrawl" ? "brawl" : (preset.format ?? "standard"),
    coverCardName: preset.coverCardName
      ? frontFaceName(preset.coverCardName)
      : (presetCommander ?? choosePresetCoverCardName(preset.cards)),
    cards,
    sideboard,
    commanders: commanders.length > 0 ? commanders : undefined,
    engines: preset.engines,
  };
}

export function expandPresetDeckDefinitions(presets: PresetDeckDefinition[]): PresetDeck[] {
  return presets.map(expandPresetDeckDefinition);
}

interface PreconBackFaceRecord {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  img?: string;
}

type PreconCardRecord = Omit<PresetDeckCardDefinition, "count" | "uris" | "backFace"> & {
  img?: string;
  backFace?: PreconBackFaceRecord;
};

type PreconDeckRecord = Omit<PresetDeckDefinition, "cards" | "sideboard"> & {
  cards: Array<[number, number]>;
};

export interface PreconCatalog {
  cards: PreconCardRecord[];
  decks: PreconDeckRecord[];
}

const EMPTY_URIS: ScryfallImageUris = {
  small: "",
  normal: "",
  large: "",
  png: "",
  art_crop: "",
  border_crop: "",
};

export function preconImageUris(img: string | undefined, face = "front"): ScryfallImageUris {
  if (!img) return EMPTY_URIS;
  const [id, stamp] = img.split("?");
  const url = (size: string, ext: string) =>
    `https://cards.scryfall.io/${size}/${face}/${id[0]}/${id[1]}/${id}.${ext}${stamp ? `?${stamp}` : ""}`;
  return {
    small: url("small", "jpg"),
    normal: url("normal", "jpg"),
    large: url("large", "jpg"),
    png: url("png", "png"),
    art_crop: url("art_crop", "jpg"),
    border_crop: url("border_crop", "jpg"),
  };
}

export function preconToPresetDefinitions(catalog: PreconCatalog): PresetDeckDefinition[] {
  return catalog.decks.map((deck) => ({
    ...deck,
    cards: deck.cards.map(([index, count]) => {
      const { img, backFace, ...card } = catalog.cards[index];
      return {
        ...card,
        count,
        uris: preconImageUris(img),
        backFace: backFace
          ? {
              name: backFace.name,
              manaCost: backFace.manaCost,
              typeLine: backFace.typeLine,
              oracleText: backFace.oracleText,
              uris: preconImageUris(backFace.img, "back"),
            }
          : undefined,
      };
    }),
  }));
}

export async function loadPreconDeckDefinitions(
  url = "/precon_decks/precons.json",
): Promise<PresetDeckDefinition[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch precon decks: ${response.status}`);
  return preconToPresetDefinitions((await response.json()) as PreconCatalog);
}
