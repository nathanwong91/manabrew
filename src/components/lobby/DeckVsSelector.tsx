import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePresetDecks } from "@/stores/usePresetDecksStore";
import { Button } from "@/components/ui/button";
import { AppSelect, AppSelectOption } from "@/components/ui/AppSelect";
import { FormatBadge } from "@/components/game/FormatBadge";
import { EngineMark } from "@/components/lobby/EngineMark";
import { TablePickerDialog } from "@/components/lobby/TablePickerDialog";
import { DeckSelectionCard } from "./DeckSelectionCard";
import { useIsShortScreen, useIsTouch } from "@/hooks/useBreakpoints";
import { cn, pickRandomDistinct } from "@/lib/utils";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";
import {
  fillRandomOpponents,
  hasCards,
  type AiOpponentRef,
  resolveAiOpponent,
  withinStrength,
  type OpponentStrength,
} from "@/lib/aiOpponent";
import { assessBracket, BRACKET_INFO, type Bracket } from "@/lib/brackets";
import { fetchGameChangers } from "@/lib/gameChangers";
import { getDeckFingerprint } from "@/lib/decks";
import { reportPublishedDeckPlay } from "@/lib/deckPlayEvidence";
import { GAME_FORMATS, getFormat, validateDeckSections } from "@/lib/formats";
import { resolveOfflineEngine } from "@/lib/offlineEngine";
import { hubEntryEngines, supportsEngine } from "@/lib/engines";
import { savePresetToAccountOnUse } from "@/lib/presetDeckAccount";
import { useAccountDecks } from "@/hooks/useAccountDecks";
import { useOwnedDecks } from "@/hooks/useOwnedDecks";
import { useDeckStore } from "@/stores/useDeckStore";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import type { Deck } from "@/protocol/deck";
import { Check, Loader2, Search, Shuffle, Swords, User, Bot, X } from "lucide-react";
import { resolveCoverCard } from "@/components/deck/deckCover.utils";
import { useHubDeckSearch } from "@/hooks/useHubDeckSearch";
import { useHubStore } from "@/stores/useHubStore";
import type { DeckHubEntrySummary } from "@/api/hubTypes";
interface SelectedDeck {
  id: string;
  sourceId: string;
  name: string;
  desc?: string;
  color?: string;
  sourceDeck: Deck;
  source: "local" | "preset" | "hub";
  formatId?: string;
  commanderName?: string;
  coverCardName?: string;
}
interface DeckVsSelectorProps {
  preSelectedDeckId?: string;
  preSelectedHubDeckId?: string;
  leadingControl?: ReactNode;
  onStart: (
    playerDeck: Deck,
    opponentDecks: Deck[],
    formatId?: string,
    commanderName?: string,
  ) => Promise<boolean>;
}
type PickingSide = "player" | number | null;
const MAX_OPPONENTS = 3;
const STRENGTH_LABELS: Record<OpponentStrength, string> = {
  casual: `Casual`,
  balanced: `Balanced`,
  any: `Any`,
};
type PlayFormatId = string;
export function DeckVsSelector({
  preSelectedDeckId,
  preSelectedHubDeckId,
  leadingControl,
  onStart,
}: DeckVsSelectorProps) {
  const denseDecks = useIsShortScreen();
  const isTouch = useIsTouch();
  const shortTouch = isTouch;
  const currentDeck = useDeckStore((state) => state.currentDeck);
  const savedDecks = useOwnedDecks();
  const preSelectedSavedDeck = savedDecks.find((saved) => saved.id === preSelectedDeckId);
  const preSelectedFormatId = preSelectedSavedDeck?.deck.format ?? "standard";
  const preSelectedFormat = getFormat(preSelectedFormatId);
  const preSelectedCommanderName = preSelectedSavedDeck?.deck.commanders?.[0]?.identity.name;
  const preSelectedDeckEntry: SelectedDeck | null =
    preSelectedSavedDeck &&
    preSelectedFormat &&
    validateDeckSections(
      { deck: preSelectedSavedDeck.deck, commanderName: preSelectedCommanderName },
      preSelectedFormat,
    ).legal
      ? {
          id: `local:${preSelectedSavedDeck.id}`,
          sourceId: preSelectedSavedDeck.id,
          name: preSelectedSavedDeck.deck.name,
          sourceDeck: preSelectedSavedDeck.deck,
          source: "local" as const,
          formatId: preSelectedFormatId,
          commanderName: preSelectedCommanderName,
        }
      : null;
  const lastOfflineFormatId = usePreferencesStore((state) => state.lastOfflineFormatId);
  const lastAiOpponent = usePreferencesStore((state) => state.lastAiOpponent);
  const lastAiTable = usePreferencesStore((state) => state.lastAiTable);
  const opponentStrength = usePreferencesStore((state) => state.opponentStrength);
  const setOpponentStrength = usePreferencesStore((state) => state.setOpponentStrength);
  const boardBackground = usePreferencesStore((state) => state.boardBackgroundId);
  const setBoardBackground = usePreferencesStore((state) => state.setBoardBackgroundId);
  const rememberedFormatId =
    !preSelectedDeckEntry && lastOfflineFormatId && getFormat(lastOfflineFormatId)
      ? lastOfflineFormatId
      : null;
  const [playerDeck, setPlayerDeck] = useState<SelectedDeck | null>(preSelectedDeckEntry);
  const [opponentDecks, setOpponentDecks] = useState<(SelectedDeck | null)[]>([null]);
  const [pickingSide, setPickingSide] = useState<PickingSide>(preSelectedDeckEntry ? 0 : "player");
  const [selectedFormat, setSelectedFormat] = useState<PlayFormatId | null>(
    preSelectedDeckEntry?.formatId ?? rememberedFormatId,
  );
  const [opponentConfirmed, setOpponentConfirmed] = useState(false);
  const [deckSearch, setDeckSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [loadingHubDeckId, setLoadingHubDeckId] = useState<string | null>(null);
  const selectedFormatRef = useRef(selectedFormat);
  selectedFormatRef.current = selectedFormat;
  const opponentTouchedRef = useRef(false);
  const [restoredFormat, setRestoredFormat] = useState<string | null>(null);
  const [brackets, setBrackets] = useState<Record<string, Bracket>>({});
  const bracketsRef = useRef(brackets);
  const offlineEngine = resolveOfflineEngine();
  const { details: accountDeckDetails } = useAccountDecks();
  const forkedPresetKeys = new Set(
    Object.values(accountDeckDetails)
      .map((detail) => detail.derivedFromPresetKey?.toLowerCase())
      .filter((key): key is string => key !== undefined),
  );
  const presetDecks = usePresetDecks(offlineEngine).filter(
    (preset) => !forkedPresetKeys.has((preset.id ?? "").toLowerCase()),
  );
  const hubDecks = useHubDeckSearch(
    deckSearch,
    selectedFormat ?? undefined,
    true,
    [offlineEngine],
    "community",
  );
  const hubDeckEntries = hubDecks.decks.filter((entry) =>
    supportsEngine(hubEntryEngines(entry), offlineEngine),
  );
  const loadHubDeck = useHubStore((state) => state.loadEntry);
  const restoredHubDeckRef = useRef<string | null>(null);
  const hubSelectionRequestIdRef = useRef(0);
  const [hubRestoreAttempt, setHubRestoreAttempt] = useState(0);
  useEffect(() => {
    if (
      !hubDecks.enabled ||
      !preSelectedHubDeckId ||
      restoredHubDeckRef.current === preSelectedHubDeckId
    )
      return;
    restoredHubDeckRef.current = preSelectedHubDeckId;
    const requestId = ++hubSelectionRequestIdRef.current;
    setLoadingHubDeckId(preSelectedHubDeckId);
    void loadHubDeck(preSelectedHubDeckId)
      .then((detail) => {
        if (hubSelectionRequestIdRef.current !== requestId) return;
        const formatId = detail.deck.format ?? detail.format ?? "standard";
        setPlayerDeck({
          id: `hub:${detail.id}`,
          sourceId: detail.id,
          name: detail.title,
          sourceDeck: detail.deck,
          source: "hub",
          formatId,
          commanderName: detail.deck.commanders?.[0]?.identity.name,
        });
        setSelectedFormat(formatId);
        setPickingSide(0);
      })
      .catch((err) => {
        if (hubSelectionRequestIdRef.current !== requestId) return;
        restoredHubDeckRef.current = null;
        toast.error(err instanceof Error ? err.message : `Failed to load Community deck`, {
          action: {
            label: `Retry`,
            onClick: () => setHubRestoreAttempt((attempt) => attempt + 1),
          },
        });
      })
      .finally(() => {
        if (hubSelectionRequestIdRef.current === requestId) setLoadingHubDeckId(null);
      });
  }, [hubDecks.enabled, hubRestoreAttempt, loadHubDeck, preSelectedHubDeckId]);
  const isCommanderFormat = !!getFormat(selectedFormat ?? "")?.deckRules.requiresCommander;
  const opponentCount = isCommanderFormat ? opponentDecks.length : 1;
  const seatDecks = opponentDecks.slice(0, opponentCount);
  const searchLower = deckSearch.toLowerCase();
  const formatFilteredPresets = presetDecks.filter(
    (deck) => selectedFormat === null || (deck.format ?? "standard") === selectedFormat,
  );
  const filteredDecks = searchLower
    ? formatFilteredPresets.filter(
        (deck) =>
          deck.name.toLowerCase().includes(searchLower) ||
          (deck.description ?? "").toLowerCase().includes(searchLower),
      )
    : formatFilteredPresets;
  const currentDeckFingerprint = getDeckFingerprint(currentDeck);
  const distinctSavedDecks = savedDecks.filter(
    (saved) =>
      saved.id === preSelectedDeckId || getDeckFingerprint(saved.deck) !== currentDeckFingerprint,
  );
  const currentDeckIsPlayable =
    currentDeck.cards.length > 0 || (currentDeck.commanders?.length ?? 0) > 0;
  const userDeckEntries: SelectedDeck[] = [
    ...(currentDeckIsPlayable ? [currentDeck] : []),
    ...distinctSavedDecks.map((saved) => saved.deck),
  ].map((deck, index) => {
    const id =
      currentDeckIsPlayable && index === 0
        ? "current"
        : distinctSavedDecks[currentDeckIsPlayable ? index - 1 : index]!.id;
    return {
      id: `local:${id}`,
      sourceId: id,
      name: deck.name,
      sourceDeck: deck,
      source: "local" as const,
      formatId: deck.format ?? "standard",
      commanderName: deck.commanders?.[0]?.identity.name,
    };
  });
  const deckValidations = useMemo(() => {
    const map = new Map<
      string,
      {
        legal: boolean;
        errors: string[];
      }
    >();
    for (const entry of userDeckEntries) {
      const format = getFormat(entry.formatId ?? "standard");
      if (!format) continue;
      map.set(
        entry.id,
        validateDeckSections(
          { deck: entry.sourceDeck, commanderName: entry.commanderName },
          format,
        ),
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedDecks, currentDeck]);
  const formatFilteredUserDecks = userDeckEntries.filter(
    (deck) => selectedFormat === null || deck.formatId === selectedFormat,
  );
  const filteredUserDecks = searchLower
    ? formatFilteredUserDecks.filter((deck) => deck.name.toLowerCase().includes(searchLower))
    : formatFilteredUserDecks;
  const bracketsFor = useCallback(async (decks: Deck[]) => {
    const missing = decks.filter((deck) => !(getDeckFingerprint(deck) in bracketsRef.current));
    if (missing.length === 0) return bracketsRef.current;
    const gameChangers = await fetchGameChangers();
    const next = { ...bracketsRef.current };
    for (const deck of missing) {
      next[getDeckFingerprint(deck)] = assessBracket(deck, gameChangers, []).bracket;
    }
    bracketsRef.current = next;
    setBrackets(next);
    return next;
  }, []);
  const withinOpponentStrength = useCallback(
    async (decks: Deck[]) => {
      if (!isCommanderFormat || opponentStrength === "any") return decks;
      try {
        const known = await bracketsFor(decks);
        return decks.filter((deck) =>
          withinStrength(known[getDeckFingerprint(deck)]!, opponentStrength),
        );
      } catch {
        return decks;
      }
    },
    [bracketsFor, isCommanderFormat, opponentStrength],
  );
  useEffect(() => {
    if (!isCommanderFormat) return;
    const decks = opponentDecks.flatMap((seat) => (seat ? [seat.sourceDeck] : []));
    if (decks.length > 0) void bracketsFor(decks).catch(() => undefined);
  }, [bracketsFor, isCommanderFormat, opponentDecks]);
  useEffect(() => {
    if (
      !selectedFormat ||
      restoredFormat !== selectedFormat ||
      opponentDecks[0] ||
      opponentTouchedRef.current
    )
      return;
    let cancelled = false;
    void (async () => {
      const withinStrengthPresets = await withinOpponentStrength(presetDecks);
      if (cancelled) return;
      const resolveWith = (presets: Deck[]) =>
        resolveAiOpponent({ presets, savedDecks, formatId: selectedFormat, last: lastAiOpponent });
      const lastId = lastAiOpponent && "id" in lastAiOpponent ? lastAiOpponent.id : null;
      const remembered = lastId ? resolveWith(presetDecks) : null;
      const resolved =
        remembered && remembered.id === lastId
          ? remembered
          : resolveWith(withinStrengthPresets.length > 0 ? withinStrengthPresets : presetDecks);
      if (!resolved) return;
      const source = resolved.source === "preset" ? "preset" : "local";
      setOpponentDecks((prev) => [
        {
          id: `${source}:${resolved.id}`,
          sourceId: resolved.id,
          name: resolved.deck.name,
          desc: resolved.deck.description,
          color: resolved.deck.color,
          sourceDeck: resolved.deck,
          source,
          formatId: selectedFormat,
          commanderName: resolved.deck.commanders?.[0]?.identity.name,
          coverCardName: resolved.deck.coverCardName,
        },
        ...prev.slice(1),
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedFormat,
    restoredFormat,
    opponentDecks,
    presetDecks,
    savedDecks,
    lastAiOpponent,
    withinOpponentStrength,
  ]);
  const restoreCtxRef = useRef({ presetDecks, savedDecks, loadHubDeck });
  restoreCtxRef.current = { presetDecks, savedDecks, loadHubDeck };
  const presetsReady = presetDecks.length > 0;
  useEffect(() => {
    if (!selectedFormat || restoredFormat === selectedFormat) return;
    const table = lastAiTable?.formatId === selectedFormat ? lastAiTable : null;
    if (!table || opponentTouchedRef.current) {
      setRestoredFormat(selectedFormat);
      return;
    }
    if (!presetsReady && table.seats.some((ref) => ref?.kind === "preset")) return;
    let cancelled = false;
    const { presetDecks: presets, savedDecks: saved, loadHubDeck: loadHub } = restoreCtxRef.current;
    const seatCount = getFormat(selectedFormat)?.deckRules.requiresCommander
      ? Math.min(Math.max(table.seats.length, 1), MAX_OPPONENTS)
      : 1;
    const resolveSeat = async (ref: AiOpponentRef | null): Promise<SelectedDeck | null> => {
      if (ref?.kind === "preset") {
        const deck = presets.find(
          (d) =>
            (d.id ?? d.name) === ref.id &&
            (d.format ?? "standard") === selectedFormat &&
            hasCards(d),
        );
        return deck ? selectedFromPreset(deck, selectedFormat) : null;
      }
      if (ref?.kind === "saved") {
        const entry = saved.find(
          (s) =>
            s.id === ref.id && (s.deck.format ?? "standard") === selectedFormat && hasCards(s.deck),
        );
        return entry
          ? {
              id: `local:${entry.id}`,
              sourceId: entry.id,
              name: entry.deck.name,
              sourceDeck: entry.deck,
              source: "local",
              formatId: selectedFormat,
              commanderName: entry.deck.commanders?.[0]?.identity.name,
            }
          : null;
      }
      if (ref?.kind === "hub") {
        try {
          const detail = await loadHub(ref.id);
          if ((detail.deck.format ?? detail.format ?? "standard") !== selectedFormat) return null;
          return {
            id: `hub:${detail.id}`,
            sourceId: detail.id,
            name: detail.title,
            sourceDeck: detail.deck,
            source: "hub",
            formatId: selectedFormat,
            commanderName: detail.deck.commanders?.[0]?.identity.name,
          };
        } catch {
          return null;
        }
      }
      return null;
    };
    void Promise.all(
      Array.from({ length: seatCount }, (_, i) => resolveSeat(table.seats[i] ?? null)),
    ).then((restored) => {
      if (cancelled) return;
      if (!opponentTouchedRef.current) {
        setOpponentDecks((prev) => (prev.some((seat) => seat) ? prev : restored));
      }
      setRestoredFormat(selectedFormat);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedFormat, restoredFormat, lastAiTable, presetsReady]);
  function setSeat(index: number, selected: SelectedDeck | null) {
    setOpponentDecks((prev) => prev.map((seat, i) => (i === index ? selected : seat)));
  }
  function setOpponentCount(count: number) {
    setOpponentDecks((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? null));
    setPickingSide((side) => (typeof side === "number" && side >= count ? null : side));
  }
  function invalidateHubSelection() {
    hubSelectionRequestIdRef.current += 1;
    setLoadingHubDeckId(null);
  }
  function changeFormat(formatId: PlayFormatId | null) {
    if (formatId === selectedFormat) return;
    invalidateHubSelection();
    opponentTouchedRef.current = false;
    setRestoredFormat(null);
    setPlayerDeck(null);
    setOpponentDecks(
      Array.from(
        {
          length: getFormat(formatId ?? "")?.deckRules.requiresCommander ? opponentDecks.length : 1,
        },
        () => null,
      ),
    );
    setOpponentConfirmed(false);
    setPickingSide("player");
    setSelectedFormat(formatId);
  }
  function assignDeck(selected: SelectedDeck, hubRequestId?: number) {
    if (hubRequestId === undefined) {
      invalidateHubSelection();
    } else if (hubSelectionRequestIdRef.current !== hubRequestId) {
      return;
    }
    if (pickingSide === "player" || pickingSide === null) {
      setPlayerDeck(selected);
      setPickingSide(0);
      return;
    }
    if (pickingSide === 0) opponentTouchedRef.current = true;
    setSeat(pickingSide, selected);
    setOpponentConfirmed(true);
    setPickingSide(playerDeck ? null : "player");
  }
  function selectDeck(deck: Deck) {
    const formatId = deck.format ?? "standard";
    if (!selectedFormat) setSelectedFormat(formatId);
    assignDeck(selectedFromPreset(deck, formatId));
  }
  async function selectHubDeck(summary: DeckHubEntrySummary) {
    const requestId = ++hubSelectionRequestIdRef.current;
    setLoadingHubDeckId(summary.id);
    try {
      const detail = await loadHubDeck(summary.id);
      if (hubSelectionRequestIdRef.current !== requestId) return;
      const deck = detail.deck;
      const formatId = deck.format ?? summary.format ?? "standard";
      const currentFormat = selectedFormatRef.current;
      if (currentFormat && formatId !== currentFormat) {
        toast.error(
          `"${detail.title}" is not a ${getFormat(currentFormat)?.name ?? currentFormat} deck`,
        );
        return;
      }
      if (!currentFormat) setSelectedFormat(formatId);
      assignDeck(
        {
          id: `hub:${summary.id}`,
          sourceId: summary.id,
          name: deck.name,
          sourceDeck: deck,
          source: "hub",
          formatId,
          commanderName: deck.commanders?.[0]?.identity.name,
        },
        requestId,
      );
    } catch (err) {
      if (hubSelectionRequestIdRef.current !== requestId) return;
      toast.error(err instanceof Error ? err.message : `Failed to load Community deck`);
    } finally {
      if (hubSelectionRequestIdRef.current === requestId) setLoadingHubDeckId(null);
    }
  }
  function selectUserDeck(entry: SelectedDeck) {
    if (!selectedFormat && entry.formatId) setSelectedFormat(entry.formatId);
    assignDeck(entry);
  }
  function selectedFromPreset(deck: Deck, formatId: string): SelectedDeck {
    const sourceId = deck.id ?? deck.name;
    return {
      id: `preset:${sourceId}`,
      sourceId,
      name: deck.name,
      desc: deck.description,
      color: deck.color,
      sourceDeck: deck,
      source: "preset",
      formatId,
      commanderName: deck.commanders?.[0]?.identity.name,
      coverCardName: deck.coverCardName,
    };
  }
  async function fillOpponents(slots: (Deck | null)[], exclude: Deck[], candidates: Deck[]) {
    const within = await withinOpponentStrength(candidates);
    const filled = fillRandomOpponents({
      slots,
      pool: within,
      exclude,
      fingerprint: getDeckFingerprint,
    });
    if (!filled.includes(null) || within.length === candidates.length) return filled;
    const relaxed = fillRandomOpponents({
      slots: filled,
      pool: candidates,
      exclude,
      fingerprint: getDeckFingerprint,
    });
    if (!relaxed.includes(null)) {
      toast.warning(`Not enough ${STRENGTH_LABELS[opponentStrength]} decks, using any strength`);
    }
    return relaxed;
  }
  async function handleRandomOpponent(index: number) {
    if (!selectedFormat) return;
    const table = [playerDeck, ...seatDecks].flatMap((seat) => (seat ? [seat.sourceDeck] : []));
    const [random] = await fillOpponents([null], table, formatFilteredPresets.filter(hasCards));
    if (!random) return;
    invalidateHubSelection();
    if (index === 0) opponentTouchedRef.current = true;
    setSeat(index, selectedFromPreset(random, selectedFormat));
    setOpponentConfirmed(true);
    setPickingSide(playerDeck ? null : "player");
  }
  function handleFight() {
    if (!playerDeck || !seatDecks[0] || starting) return;
    setTableDialogOpen(true);
  }

  function handleTableChosen() {
    setTableDialogOpen(false);
    void startFight();
  }
  async function loadCommunityOpponents(count: number, formatId: string) {
    const results = await Promise.allSettled(
      pickRandomDistinct(hubDeckEntries, count).map((entry) => loadHubDeck(entry.id)),
    );
    return results.flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      const deck = result.value.deck;
      const format = getFormat(formatId);
      const legal =
        !format ||
        validateDeckSections({ deck, commanderName: deck.commanders?.[0]?.identity.name }, format)
          .legal;
      return legal && hasCards(deck) ? [deck] : [];
    });
  }
  async function startFight() {
    const first = seatDecks[0];
    if (!playerDeck || !first || starting) return;
    const picked = [playerDeck, ...seatDecks.filter((seat) => seat !== null)];
    const empty = picked.find(
      (d) => d.sourceDeck.cards.length === 0 && (d.sourceDeck.commanders?.length ?? 0) === 0,
    );
    if (empty) {
      toast.error(`"${empty.name}" has no cards`);
      return;
    }
    for (const selected of picked) {
      if (selected.source !== "hub") continue;
      const format = getFormat(selected.formatId ?? "standard");
      if (!format) continue;
      const validation = validateDeckSections(
        { deck: selected.sourceDeck, commanderName: selected.commanderName },
        format,
      );
      if (!validation.legal) {
        toast.warning(validation.errors[0] ?? `"${selected.name}" is not legal`);
        return;
      }
    }
    setStarting(true);
    const slots = seatDecks.map((seat) => seat?.sourceDeck ?? null);
    const missing = slots.filter((slot) => slot === null).length;
    let opponents = slots;
    if (missing > 0) {
      const formatId = playerDeck.formatId ?? "standard";
      const format = getFormat(formatId);
      const savedCandidates = savedDecks
        .map((saved) => saved.deck)
        .filter(
          (deck) =>
            (deck.format ?? "standard") === formatId &&
            hasCards(deck) &&
            (!format ||
              validateDeckSections(
                { deck, commanderName: deck.commanders?.[0]?.identity.name },
                format,
              ).legal),
        );
      const communityCandidates = await loadCommunityOpponents(missing, formatId);
      opponents = await fillOpponents(
        slots,
        [playerDeck.sourceDeck],
        [...formatFilteredPresets.filter(hasCards), ...savedCandidates, ...communityCandidates],
      );
    }
    if (opponents.some((deck) => deck === null)) {
      toast.error(`Not enough distinct decks for ${opponentCount} opponents`);
      setStarting(false);
      return;
    }
    const started = await onStart(
      playerDeck.sourceDeck,
      opponents.filter((deck) => deck !== null),
      playerDeck.formatId,
      playerDeck.commanderName,
    );
    if (!started) {
      setStarting(false);
      return;
    }
    if (playerDeck.source === "hub" || playerDeck.source === "preset") {
      void reportPublishedDeckPlay(playerDeck.sourceId, playerDeck.sourceDeck);
    }
    if (playerDeck.source === "preset") {
      savePresetToAccountOnUse(playerDeck.sourceId);
    }
    const prefs = usePreferencesStore.getState();
    if (playerDeck.formatId) prefs.setLastOfflineFormatId(playerDeck.formatId);
    if (playerDeck.source === "local" && playerDeck.sourceId !== "current") {
      prefs.setLastPlayedDeckId(playerDeck.sourceId);
    }
    if (playerDeck.formatId) {
      prefs.setLastAiTable({
        formatId: playerDeck.formatId,
        seats: seatDecks.map((seat) => {
          if (seat?.source === "preset") return { kind: "preset", id: seat.sourceId };
          if (seat?.source === "hub") return { kind: "hub", id: seat.sourceId };
          if (seat?.source === "local" && seat.sourceId !== "current") {
            return { kind: "saved", id: seat.sourceId };
          }
          return null;
        }),
      });
    }
    if (first.source === "preset") {
      prefs.setLastAiOpponent({ kind: "preset", id: first.sourceId });
    } else if (first.source === "local" && first.sourceId !== "current") {
      prefs.setLastAiOpponent({ kind: "saved", id: first.sourceId });
    }
  }
  const hubSelectionIsLegal = (selected: SelectedDeck | null) => {
    if (!selected || selected.source !== "hub") return true;
    const format = getFormat(selected.formatId ?? "standard");
    return (
      !format ||
      validateDeckSections(
        { deck: selected.sourceDeck, commanderName: selected.commanderName },
        format,
      ).legal
    );
  };
  const isReady =
    !!playerDeck &&
    !!seatDecks[0] &&
    opponentConfirmed &&
    hubSelectionIsLegal(playerDeck) &&
    seatDecks.every(hubSelectionIsLegal);
  const searchControl = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label="Filter decks"
        placeholder={shortTouch ? "Search decks…" : "Filter decks…"}
        value={deckSearch}
        onChange={(event) => setDeckSearch(event.target.value)}
        className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary pointer-coarse:h-11 pointer-coarse:text-base"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {shortTouch ? (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/5 px-4 py-1.5">
          {leadingControl}
          <AppSelect
            aria-label="Filter decks by format"
            value={selectedFormat ?? ""}
            onValueChange={(value) => changeFormat(value || null)}
            className="h-11 max-w-44 shrink-0 text-base font-medium"
          >
            <AppSelectOption value="">All formats</AppSelectOption>
            {GAME_FORMATS.map((format) => (
              <AppSelectOption key={format.id} value={format.id}>
                <FormatBadge formatId={format.id} />
                <span className="truncate">{format.name}</span>
              </AppSelectOption>
            ))}
          </AppSelect>
          {searchControl}
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b bg-muted/5 px-4 py-2 sm:px-6 lg:px-8">
            <div
              role="group"
              aria-label="Filter decks by format"
              className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-1 pr-6 no-scrollbar touch-scroll-fade"
            >
              {[{ id: null, name: "All" }, ...GAME_FORMATS].map((format) => (
                <button
                  key={format.id ?? "all"}
                  type="button"
                  aria-pressed={selectedFormat === format.id}
                  onClick={() => changeFormat(format.id)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors motion-reduce:transition-none pointer-coarse:min-h-11 pointer-coarse:px-3",
                    selectedFormat === format.id
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {format.name}
                </button>
              ))}
            </div>
            <p
              className="hidden shrink-0 text-right text-xs font-medium text-muted-foreground lg:block"
              aria-live="polite"
            >
              {pickingSide === "player"
                ? isReady
                  ? "Choose your deck or fight"
                  : "Choose your deck"
                : typeof pickingSide === "number"
                  ? isReady
                    ? "Choose the AI deck or fight"
                    : "Choose the AI deck"
                  : "Matchup ready"}
            </p>
          </div>
          <div className="shrink-0 px-4 pb-2 pt-3 sm:px-6 lg:px-8">{searchControl}</div>
        </>
      )}

      <div
        className={cn(
          "flex-1 space-y-6 overflow-y-auto px-4 pb-4 sm:px-6 lg:px-8",
          shortTouch && "space-y-3 pb-2",
        )}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold pt-2 pb-1">
            Your Decks
          </p>
          {filteredUserDecks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No decks yet — build one in{" "}
              <Link
                to={ROUTES.DECK_EDITOR}
                className="text-primary underline-offset-2 hover:underline not-italic"
              >
                My Decks
              </Link>
              .
            </p>
          ) : (
            <div
              className={cn(
                "grid gap-3",
                shortTouch
                  ? "grid-cols-3"
                  : denseDecks
                    ? "grid-cols-2 md:grid-cols-3"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
              )}
            >
              {filteredUserDecks.map((entry) => {
                const displayCards = [
                  ...(entry.sourceDeck?.cards ?? []),
                  ...(entry.sourceDeck?.commanders ?? []),
                ];
                const cover = entry.sourceDeck ? resolveCoverCard(entry.sourceDeck) : undefined;
                const validation = deckValidations.get(entry.id) ?? {
                  legal: true,
                  errors: [] as string[],
                };
                return (
                  <DeckSelectionCard
                    key={entry.id}
                    name={entry.name}
                    color={entry.color}
                    badge={entry.sourceDeck?.draft ? "draft" : undefined}
                    cards={displayCards}
                    cover={cover}
                    isLegal={validation.legal}
                    validationError={validation.errors[0]}
                    labels={entry.sourceDeck?.labels}
                    isPreset={false}
                    isSelected={false}
                    isPlayerDeck={playerDeck?.id === entry.id}
                    isOpponentDeck={seatDecks.some((seat) => seat?.id === entry.id)}
                    formatId={entry.sourceDeck?.format ?? entry.formatId ?? "standard"}
                    dense={denseDecks}
                    isTouch={isTouch}
                    onSelect={() => selectUserDeck(entry)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {hubDecks.enabled &&
          (deckSearch.trim() !== "" ||
            hubDecks.loading ||
            hubDecks.error !== null ||
            hubDeckEntries.length > 0) && (
            <div>
              <p className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Community
              </p>
              {hubDecks.error ? (
                <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-destructive">
                  <span className="min-w-0 break-words">{hubDecks.error}</span>
                  <Button variant="outline" size="sm" onClick={hubDecks.retry}>
                    Retry
                  </Button>
                </div>
              ) : hubDecks.loading && hubDeckEntries.length === 0 ? (
                <div
                  className={cn(
                    "grid gap-3 pt-1",
                    shortTouch
                      ? "grid-cols-3"
                      : denseDecks
                        ? "grid-cols-2 md:grid-cols-3"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
                  )}
                >
                  {Array.from({ length: 10 }, (_, index) => (
                    <div
                      key={index}
                      className={cn(
                        "animate-pulse rounded-lg bg-muted",
                        denseDecks ? "h-24" : "aspect-[4/3] sm:min-h-[172px]",
                      )}
                    />
                  ))}
                </div>
              ) : hubDeckEntries.length === 0 ? (
                <p className="py-2 text-xs italic text-muted-foreground">
                  No Community decks match this format and search.
                </p>
              ) : (
                <div
                  className={cn(
                    "grid gap-3 pt-1",
                    shortTouch
                      ? "grid-cols-3"
                      : denseDecks
                        ? "grid-cols-2 md:grid-cols-3"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
                  )}
                >
                  {hubDeckEntries.map((deck) => {
                    const selected = [playerDeck, ...seatDecks].find(
                      (entry) => entry?.source === "hub" && entry.sourceId === deck.id,
                    );
                    const format = selected ? getFormat(selected.formatId ?? "standard") : null;
                    const validation =
                      selected && format
                        ? validateDeckSections(
                            { deck: selected.sourceDeck, commanderName: selected.commanderName },
                            format,
                          )
                        : { legal: true, errors: [] as string[] };
                    return (
                      <DeckSelectionCard
                        key={deck.id}
                        name={loadingHubDeckId === deck.id ? `Loading ${deck.title}…` : deck.title}
                        color={deck.colors}
                        author={deck.author}
                        cardCount={deck.cardCount + deck.commanders.length}
                        badge="Community"
                        cards={[]}
                        cover={undefined}
                        coverImageUrl={deck.coverImageUrl}
                        isPreset={false}
                        isHub
                        isSelected={false}
                        isLegal={validation.legal}
                        validationError={validation.errors[0]}
                        isPlayerDeck={playerDeck?.id === `hub:${deck.id}`}
                        isOpponentDeck={seatDecks.some((seat) => seat?.id === `hub:${deck.id}`)}
                        formatId={deck.format ?? "standard"}
                        dense={denseDecks}
                        isTouch={isTouch}
                        loading={loadingHubDeckId === deck.id}
                        onSelect={() => void selectHubDeck(deck)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold pb-1">
            Starter Decks
          </p>
          {filteredDecks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No starter decks for this format.
            </p>
          ) : (
            <div
              className={cn(
                "grid gap-3 pt-1",
                shortTouch
                  ? "grid-cols-3"
                  : denseDecks
                    ? "grid-cols-2 md:grid-cols-3"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
              )}
            >
              {filteredDecks.map((deck) => (
                <DeckSelectionCard
                  key={deck.id ?? deck.name}
                  name={deck.name}
                  desc={deck.description}
                  color={deck.color}
                  cards={deck.cards}
                  cover={resolveCoverCard(deck)}
                  coverFallbackClassName="absolute inset-0 bg-gradient-to-br from-muted-foreground/10 via-muted/40 to-muted-foreground/20"
                  isPreset={true}
                  isSelected={false}
                  isPlayerDeck={playerDeck?.id === `preset:${deck.id ?? deck.name}`}
                  isOpponentDeck={seatDecks.some(
                    (seat) => seat?.id === `preset:${deck.id ?? deck.name}`,
                  )}
                  formatId={deck.format ?? "standard"}
                  dense={denseDecks}
                  isTouch={isTouch}
                  onSelect={() => selectDeck(deck)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {isCommanderFormat && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-muted/5 px-4 py-1.5 sm:px-6 lg:px-8">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Opponents
          </span>
          <div role="group" aria-label="Number of opponents" className="flex gap-1">
            {Array.from({ length: MAX_OPPONENTS }, (_, i) => i + 1).map((count) => (
              <Button
                key={count}
                variant={opponentCount === count ? "selected" : "outline"}
                size="sm"
                aria-pressed={opponentCount === count}
                onClick={() => setOpponentCount(count)}
              >
                {count}
              </Button>
            ))}
          </div>
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Strength
          </span>
          <div role="group" aria-label="Opponent deck strength" className="flex gap-1">
            {(Object.keys(STRENGTH_LABELS) as OpponentStrength[]).map((strength) => (
              <Button
                key={strength}
                variant={opponentStrength === strength ? "selected" : "outline"}
                size="sm"
                aria-pressed={opponentStrength === strength}
                onClick={() => setOpponentStrength(strength)}
              >
                {STRENGTH_LABELS[strength]}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div
        className={cn(
          "grid shrink-0 gap-2 border-t bg-muted/10 px-4 py-2 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-3 lg:px-8",
          shortTouch && "sm:px-4 sm:py-1.5",
        )}
      >
        <div
          className={cn(
            "min-w-0 items-center gap-1.5 sm:flex sm:gap-2",
            opponentCount > 1
              ? "flex flex-wrap"
              : "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
          )}
        >
          <DeckSlot
            label={`YOU`}
            icon={<User className="h-3 w-3" />}
            deck={playerDeck}
            sideColor="var(--player-colors-self)"
            isActive={pickingSide === "player"}
            isConfirmed={!!playerDeck && pickingSide !== "player"}
            onClick={() => {
              invalidateHubSelection();
              setPickingSide("player");
            }}
            onClear={() => {
              invalidateHubSelection();
              setPlayerDeck(null);
              setPickingSide("player");
            }}
          />
          <span className="text-xs font-bold tracking-wider text-muted-foreground/60">VS</span>
          {seatDecks.map((seat, index) => (
            <DeckSlot
              key={index}
              label={opponentCount > 1 ? `AI ${index + 1}` : `AI`}
              icon={<Bot className="h-3 w-3" />}
              deck={seat}
              emptyLabel={index === 0 ? `pick a deck` : `Random`}
              detail={
                seat && brackets[getDeckFingerprint(seat.sourceDeck)]
                  ? BRACKET_INFO[brackets[getDeckFingerprint(seat.sourceDeck)]!].name
                  : undefined
              }
              sideColor="var(--player-colors-opponent1)"
              isActive={pickingSide === index}
              isConfirmed={!!seat && (index > 0 || opponentConfirmed) && pickingSide !== index}
              onClick={() => {
                invalidateHubSelection();
                if (index === 0) setOpponentConfirmed(false);
                setPickingSide(index);
              }}
              onClear={() => {
                invalidateHubSelection();
                if (index === 0) {
                  opponentTouchedRef.current = true;
                  setOpponentConfirmed(false);
                }
                setSeat(index, null);
                setPickingSide(index);
              }}
              placeholderExtra={
                !seat && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRandomOpponent(index);
                    }}
                    className="inline-flex w-8 shrink-0 items-center justify-center gap-0.5 rounded-r-md text-[10px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground pointer-coarse:w-11"
                    title="Random AI deck"
                  >
                    <Shuffle className="h-3 w-3" />
                  </button>
                )
              }
            />
          ))}
        </div>
        <div className="grid grid-flow-col auto-cols-fr gap-2 sm:flex sm:flex-shrink-0 sm:items-center">
          <div className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11 sm:w-auto">
            <EngineMark engine="Forge" className="h-3.5 w-3.5" />
            Forge
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleFight}
            disabled={!isReady || starting}
            aria-busy={starting}
            className="w-full gap-1.5 sm:w-auto"
          >
            {starting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Swords className="h-3.5 w-3.5" />
            )}
            {starting ? `Starting\u2026` : `Fight!`}
          </Button>
        </div>
      </div>
      <TablePickerDialog
        open={tableDialogOpen}
        background={boardBackground}
        onBackgroundChange={setBoardBackground}
        onStart={handleTableChosen}
        onCancel={() => setTableDialogOpen(false)}
        centerContent={
          selectedFormat ? (
            <span className="font-serif text-lg font-light text-foreground/90">
              {getFormat(selectedFormat)?.name ?? selectedFormat}
            </span>
          ) : undefined
        }
      />
    </div>
  );
}
interface DeckSlotProps {
  label: string;
  icon: ReactNode;
  deck: SelectedDeck | null;
  sideColor: string;
  emptyLabel?: string;
  detail?: string;
  isActive: boolean;
  isConfirmed: boolean;
  onClick: () => void;
  onClear: () => void;
  placeholderExtra?: ReactNode;
}
function DeckSlot({
  label,
  icon,
  deck,
  emptyLabel = `pick a deck`,
  detail,
  sideColor,
  isActive,
  isConfirmed,
  onClick,
  onClear,
  placeholderExtra,
}: DeckSlotProps) {
  return (
    <div
      className={cn(
        "group inline-flex min-h-8 min-w-0 max-w-[14rem] items-stretch rounded-md border text-xs transition-colors pointer-coarse:min-h-11 sm:min-w-24",
        isActive ? "ring-1" : "border-border/40 hover:border-border hover:bg-muted/40",
      )}
      style={{
        borderColor: isActive ? sideColor : undefined,
        boxShadow: isActive
          ? `inset 0 0 0 1px color-mix(in srgb, ${sideColor} 35%, transparent)`
          : undefined,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-l-md px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="inline-flex shrink-0 items-center gap-0.5 font-bold text-[10px] uppercase tracking-wider"
          style={{ color: sideColor }}
        >
          {icon}
          {label}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            deck ? "font-medium text-foreground/90" : "italic text-muted-foreground",
          )}
        >
          {deck?.name ?? emptyLabel}
        </span>
        {deck && detail && (
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            {detail}
          </span>
        )}
        {isActive ? (
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-primary">
            Selecting
          </span>
        ) : isConfirmed ? (
          <Check className="h-3 w-3 shrink-0 text-primary" />
        ) : (
          deck && (
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested
            </span>
          )
        )}
      </button>
      {deck ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex w-8 shrink-0 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-destructive pointer-coarse:w-11"
          title="Clear"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      ) : (
        placeholderExtra
      )}
    </div>
  );
}
