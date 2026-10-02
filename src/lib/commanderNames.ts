interface Named {
  identity: { name: string };
}

export function commanderLine(
  deck: { commanders?: Named[] } | undefined,
  commandZone: (Named & { supertypes: string[] })[],
): string | undefined {
  const names = deck?.commanders?.length
    ? deck.commanders.map((card) => card.identity.name)
    : commandZone
        .filter((card) => card.supertypes.includes("Legendary"))
        .map((c) => c.identity.name);
  const unique = [...new Set(names.filter(Boolean))];
  return unique.length > 0 ? unique.join(" & ") : undefined;
}
