export interface ReactiveCardFields {
  identity: { name: string };
  types: readonly string[];
  text: string;
  keywords: readonly string[];
}

const REACTIVE_TEXT = new RegExp(
  [
    "counter target",
    "prevent",
    "hexproof",
    "indestructible",
    "protection from",
    "shroud",
    "target (attacking|blocking)",
    "(attacking|blocking) creature",
    "[+-]\\d+/[+-]\\d+ until end of turn",
    "destroy target",
    "exile target",
    "deals? .*damage to",
    "return target .* to its owner's hand",
    "target (spell|activated ability)",
  ].join("|"),
  "i",
);

export function isReactiveText(text: string): boolean {
  return REACTIVE_TEXT.test(text);
}

const cache = new Map<string, boolean>();

export function isReactiveCard(card: ReactiveCardFields): boolean {
  const name = card.identity.name;
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const reactive =
    (!card.types.includes("Instant") &&
      card.keywords.some((keyword) => keyword.toLowerCase() === "flash")) ||
    REACTIVE_TEXT.test(card.text);
  cache.set(name, reactive);
  return reactive;
}
