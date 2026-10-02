import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stripUsernameTag } from "@/lib/username";
import { useMatchHistoryStore } from "@/stores/useMatchHistoryStore";
import type { MatchEntry, MatchResult } from "@/stores/useMatchHistoryStore";

const RESULT: Record<MatchResult, { label: string; className: string }> = {
  won: { label: "Win", className: "border-success/50 bg-success/15 text-success" },
  lost: { label: "Loss", className: "border-destructive/50 bg-destructive/15 text-destructive" },
  draw: { label: "Draw", className: "border-transparent bg-secondary text-secondary-foreground" },
  conceded: {
    label: "Conceded",
    className: "border-destructive/50 bg-destructive/15 text-destructive",
  },
  abandoned: { label: "Abandoned", className: "border-transparent bg-muted text-muted-foreground" },
  error: { label: "Engine error", className: "border-warning/50 bg-warning/15 text-warning" },
};

function deckLabel(seat: MatchEntry["seats"][number]): string {
  const deck = seat.deckName || "Unnamed deck";
  return seat.commander ? `${deck} (${seat.commander})` : deck;
}

function MatchRow({ entry }: { entry: MatchEntry }) {
  const [open, setOpen] = useState(false);
  const me = entry.seats.find((s) => s.isMe);
  const others = entry.seats.filter((s) => !s.isMe);
  const result = RESULT[entry.result];
  return (
    <li className="rounded-lg border border-border bg-card text-card-foreground">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Badge className={cn("shrink-0", result.className)}>{result.label}</Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {me ? deckLabel(me) : "Unknown deck"}
            <span className="font-normal text-muted-foreground">
              {" vs "}
              {others.map(deckLabel).join(", ")}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(entry.endedAt).toLocaleString()}
            {entry.format ? ` · ${entry.format}` : ""}
            {` · ${entry.turns} turns`}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul className="space-y-1 border-t border-border px-4 py-3">
          {entry.seats.map((seat, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className={cn("truncate", seat.won && "font-semibold")}>
                {stripUsernameTag(seat.name)}
                {seat.isMe ? " (you)" : ""}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {seat.life} life · {seat.won ? "winner" : seat.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function MatchHistory() {
  const entries = useMatchHistoryStore((s) => s.entries);
  const clear = useMatchHistoryStore((s) => s.clear);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Match history</h1>
          {entries.length > 0 &&
            (confirming ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    clear();
                    setConfirming(false);
                  }}
                >
                  Confirm clear
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="destructive-quiet" size="sm" onClick={() => setConfirming(true)}>
                Clear history
              </Button>
            ))}
        </div>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <History className="size-8" />
            <p className="text-sm">No matches yet. Finished games will show up here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <MatchRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
