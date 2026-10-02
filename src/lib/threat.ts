export const COMMANDER_DAMAGE_LETHAL = 21;
export const POISON_LETHAL = 10;

interface ThreatCard {
  controllerId: string;
  tapped: boolean;
  types: string[];
  power: string | null;
}

export interface ThreatInput {
  boardPower: number;
  commanderDamage: number;
  poison: number;
}

export function untappedCreaturePower(cards: ThreatCard[], controllerId: string): number {
  let total = 0;
  for (const card of cards) {
    if (card.controllerId !== controllerId || card.tapped || !card.types.includes("Creature")) {
      continue;
    }
    const power = Number.parseInt(card.power ?? "", 10);
    if (power > 0) total += power;
  }
  return total;
}

export function commanderDamageFrom(
  damageByCard: Record<string, number>,
  cardOwner: ReadonlyMap<string, string>,
  ownerId: string,
): number {
  let total = 0;
  for (const [cardId, damage] of Object.entries(damageByCard)) {
    if (cardOwner.get(cardId) === ownerId) total += damage;
  }
  return total;
}

export function threatScore({ boardPower, commanderDamage, poison }: ThreatInput): number {
  return boardPower + commanderDamage * 2 + poison;
}

export function topThreatId(scores: { id: string; score: number }[]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const entry of scores) {
    if (entry.score > 0 && (!best || entry.score > best.score)) best = entry;
  }
  return best?.id ?? null;
}
