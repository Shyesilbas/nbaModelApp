import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, Shield, CornerDownLeft, X } from "lucide-react";
import { loadPrivateApi } from "../../lib/dataCache";
import { NBA_TEAMS, getTeamLogoUrl } from "../../lib/nbaTeams";
import PlayerPhoto from "../PlayerPhoto";
import { useLanguage } from "../../context/useLanguage";

interface PlayerProfile {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  CURRENT_TEAM_ABBREVIATION?: string;
  POSITION_GROUP?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayer: (playerId: number) => void;
  onSelectTeam: (teamAbbr: string) => void;
}

const foldText = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .toLowerCase()
    .trim();

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectPlayer,
  onSelectTeam,
}) => {
  const [players, setPlayers] = useState<PlayerProfile[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    loadPrivateApi<PlayerProfile[]>("/frontend-data-api/player-profiles")
      .then((data: PlayerProfile[]) => setPlayers(data || []))
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <CommandPaletteDialog
      players={players}
      onClose={onClose}
      onSelectPlayer={onSelectPlayer}
      onSelectTeam={onSelectTeam}
    />
  );
};

interface CommandPaletteDialogProps {
  players: PlayerProfile[];
  onClose: () => void;
  onSelectPlayer: (playerId: number) => void;
  onSelectTeam: (teamAbbr: string) => void;
}

const CommandPaletteDialog: React.FC<CommandPaletteDialogProps> = ({
  players,
  onClose,
  onSelectPlayer,
  onSelectTeam,
}) => {
  const { t, language } = useLanguage();
  const tr = language === "tr";
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.setAttribute("closedby", "any");
      dialog.showModal();
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, []);

  // Fallback click-outside light-dismiss where `closedby="any"` is unsupported
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const updateQuery = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  };

  const results = useMemo(() => {
    const q = foldText(query);
    const teamTag = tr ? "NBA Takımı" : "NBA Team";

    if (!q) {
      const topTeams = NBA_TEAMS.slice(0, 5).map((team) => ({
        type: "team" as const,
        id: team.abbr,
        title: team.name,
        subtitle: `${team.abbr} · ${teamTag}`,
        teamAbbr: team.abbr,
      }));
      const samplePlayers = players.slice(0, 5).map((p) => ({
        type: "player" as const,
        id: String(p.PLAYER_ID),
        playerId: p.PLAYER_ID,
        title: p.PLAYER_NAME,
        subtitle: `${p.CURRENT_TEAM_ABBREVIATION || "NBA"} · ${p.POSITION_GROUP || t.common.player}`,
        teamAbbr: p.CURRENT_TEAM_ABBREVIATION,
      }));
      return [...topTeams, ...samplePlayers];
    }

    const matchedTeams = NBA_TEAMS.filter(
      (team) =>
        team.abbr.toLowerCase().includes(q) ||
        foldText(team.name).includes(q) ||
        foldText(team.shortName).includes(q)
    ).map((team) => ({
      type: "team" as const,
      id: team.abbr,
      title: team.name,
      subtitle: `${team.abbr} · ${teamTag}`,
      teamAbbr: team.abbr,
    }));

    const matchingPlayers = players.filter(
      (p) =>
        foldText(p.PLAYER_NAME).includes(q) ||
        (p.CURRENT_TEAM_ABBREVIATION && p.CURRENT_TEAM_ABBREVIATION.toLowerCase() === q)
    );
    matchingPlayers.sort((a, b) => {
      const aPrefix = foldText(a.PLAYER_NAME).startsWith(q) ? 0 : 1;
      const bPrefix = foldText(b.PLAYER_NAME).startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.PLAYER_NAME.localeCompare(b.PLAYER_NAME);
    });

    const matchedPlayers = matchingPlayers.slice(0, 15).map((p) => ({
      type: "player" as const,
      id: String(p.PLAYER_ID),
      playerId: p.PLAYER_ID,
      title: p.PLAYER_NAME,
      subtitle: `${p.CURRENT_TEAM_ABBREVIATION || "NBA"} · ${p.POSITION_GROUP || t.common.player}`,
      teamAbbr: p.CURRENT_TEAM_ABBREVIATION,
    }));

    return [...matchedTeams, ...matchedPlayers];
  }, [query, players, tr, t.common.player]);

  const handleSelect = (item: (typeof results)[number]) => {
    if (item.type === "player" && item.playerId) {
      onSelectPlayer(item.playerId);
    } else if (item.type === "team") {
      onSelectTeam(item.id);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < results.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = results[selectedIndex];
      if (current) {
        handleSelect(current);
      }
    }
  };

  const optionId = (idx: number) => `command-palette-option-${idx}`;

  return (
    <dialog
      ref={dialogRef}
      aria-label={t.common.searchCmdK}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === "Tab") e.preventDefault();
        handleKeyDown(e);
      }}
      className="mx-auto mt-16 w-11/12 max-w-xl overflow-hidden rounded-md border border-border bg-background-primary p-0 text-text-primary shadow-md sm:mt-24"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Search size={16} strokeWidth={1.5} className="shrink-0 text-text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={results.length > 0 ? optionId(selectedIndex) : undefined}
          aria-label={t.common.search}
          autoComplete="off"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder={t.common.searchPlaceholder}
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => updateQuery("")}
            aria-label={t.common.clearSearch}
            className="cursor-pointer rounded p-1 text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t.common.close}
            className="hidden cursor-pointer rounded border border-border bg-background-tertiary px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary sm:inline-block"
          >
            Esc
          </button>
        )}
      </div>

      <div
        ref={listRef}
        id="command-palette-list"
        role="listbox"
        aria-label={tr ? "Sonuçlar" : "Results"}
        className="max-h-80 overflow-y-auto p-2"
      >
        {results.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-secondary">
            {tr
              ? `"${query}" ile eşleşen oyuncu veya takım bulunamadı.`
              : `No players or teams found matching "${query}".`}
          </div>
        ) : (
          results.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={`${item.type}-${item.id}`}
                id={optionId(idx)}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex cursor-pointer items-center justify-between rounded px-3 py-2.5 ${
                  isSelected
                    ? "bg-background-tertiary text-text-primary"
                    : "text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {item.type === "player" && item.playerId ? (
                    <PlayerPhoto playerId={item.playerId} name={item.title} size={28} className="shrink-0" />
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background-secondary">
                      {item.teamAbbr ? (
                        <img src={getTeamLogoUrl(item.teamAbbr)} alt="" className="h-5 w-5 object-contain" />
                      ) : (
                        <Shield size={16} strokeWidth={1.5} className="text-text-muted" aria-hidden="true" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text-primary">{item.title}</div>
                    <div className="truncate text-xs text-text-secondary">{item.subtitle}</div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 text-xs text-text-muted">
                  {isSelected && (
                    <span className="flex items-center gap-1 text-text-secondary">
                      {tr ? "Seç" : "Select"}{" "}
                      <CornerDownLeft size={16} strokeWidth={1.5} aria-hidden="true" />
                    </span>
                  )}
                  <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs font-medium">
                    {item.type === "player" ? t.common.player : t.common.team}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border bg-background-secondary px-4 py-2 text-xs text-text-muted">
        <div className="flex items-center gap-3">
          <span>
            <kbd className="rounded-sm border border-border bg-background-primary px-1 py-0.5 text-xs">↑</kbd>{" "}
            <kbd className="rounded-sm border border-border bg-background-primary px-1 py-0.5 text-xs">↓</kbd>{" "}
            {tr ? "gezin" : "navigate"}
          </span>
          <span>
            <kbd className="rounded-sm border border-border bg-background-primary px-1 py-0.5 text-xs">↵</kbd>{" "}
            {tr ? "seç" : "select"}
          </span>
        </div>
        <span>{tr ? "Genel arama" : "Global search"}</span>
      </div>
    </dialog>
  );
};
