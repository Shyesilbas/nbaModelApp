import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, Shield, CornerDownLeft, X } from "lucide-react";
import { loadPrivateApi } from "../../lib/dataCache";
import { NBA_TEAMS, getTeamLogoUrl } from "../../lib/nbaTeams";
import PlayerPhoto from "../PlayerPhoto";

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
  onSelectCompare?: (p1Id: number) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectPlayer,
  onSelectTeam,
}) => {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadPrivateApi<PlayerProfile[]>("/frontend-data-api/player-profiles")
      .then((data: PlayerProfile[]) => setPlayers(data || []))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter items
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Default: top teams & notable players
      const topTeams = NBA_TEAMS.slice(0, 5).map((t: (typeof NBA_TEAMS)[number]) => ({
        type: "team" as const,
        id: t.abbr,
        title: t.name,
        subtitle: `${t.abbr} · NBA Team`,
        teamAbbr: t.abbr,
      }));
      const samplePlayers = players.slice(0, 5).map((p) => ({
        type: "player" as const,
        id: String(p.PLAYER_ID),
        playerId: p.PLAYER_ID,
        title: p.PLAYER_NAME,
        subtitle: `${p.CURRENT_TEAM_ABBREVIATION || "NBA"} · ${p.POSITION_GROUP || "Player"}`,
        teamAbbr: p.CURRENT_TEAM_ABBREVIATION,
      }));
      return [...topTeams, ...samplePlayers];
    }

    const matchedTeams = NBA_TEAMS.filter(
      (t: (typeof NBA_TEAMS)[number]) =>
        t.abbr.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.shortName.toLowerCase().includes(q)
    ).map((t: (typeof NBA_TEAMS)[number]) => ({
      type: "team" as const,
      id: t.abbr,
      title: t.name,
      subtitle: `${t.abbr} · NBA Team`,
      teamAbbr: t.abbr,
    }));

    const matchedPlayers = players
      .filter(
        (p) =>
          p.PLAYER_NAME.toLowerCase().includes(q) ||
          (p.CURRENT_TEAM_ABBREVIATION && p.CURRENT_TEAM_ABBREVIATION.toLowerCase() === q)
      )
      .slice(0, 15)
      .map((p) => ({
        type: "player" as const,
        id: String(p.PLAYER_ID),
        playerId: p.PLAYER_ID,
        title: p.PLAYER_NAME,
        subtitle: `${p.CURRENT_TEAM_ABBREVIATION || "NBA"} · ${p.POSITION_GROUP || "Player"}`,
        teamAbbr: p.CURRENT_TEAM_ABBREVIATION,
      }));

    return [...matchedTeams, ...matchedPlayers];
  }, [query, players]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelect = (item: (typeof results)[number]) => {
    if (item.type === "player" && item.playerId) {
      onSelectPlayer(item.playerId);
    } else if (item.type === "team") {
      onSelectTeam(item.id);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-16 sm:pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded border border-border bg-background-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={18} strokeWidth={1.5} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players (Luka, Curry, Jokić) or teams (BOS, LAL)..."
            className="w-full bg-transparent text-sm font-medium text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="text-text-muted hover:text-text-primary"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          ) : (
            <kbd className="hidden rounded border border-border bg-background-tertiary px-1.5 py-0.5 font-mono text-[10px] uppercase text-text-secondary sm:inline-block">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              No players or teams found matching &quot;{query}&quot;
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex cursor-pointer items-center justify-between rounded px-3 py-2.5 transition-colors duration-100 ${
                    isSelected
                      ? "bg-background-tertiary text-text-primary"
                      : "text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.type === "player" && item.playerId ? (
                      <PlayerPhoto
                        playerId={item.playerId}
                        name={item.title}
                        size={28}
                        className="shrink-0"
                      />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background-secondary">
                        {item.teamAbbr ? (
                          <img
                            src={getTeamLogoUrl(item.teamAbbr)}
                            alt={item.title}
                            className="h-5 w-5 object-contain"
                          />
                        ) : (
                          <Shield size={14} strokeWidth={1.5} className="text-text-muted" />
                        )}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{item.title}</div>
                      <div className="text-xs text-text-secondary">{item.subtitle}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    {isSelected && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-text-secondary">
                        Select <CornerDownLeft size={12} strokeWidth={1.5} />
                      </span>
                    )}
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase">
                      {item.type}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-border bg-background-secondary px-4 py-2 text-[11px] text-text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-border bg-background-primary px-1 py-0.5 font-mono text-[10px]">
                ↑
              </kbd>{" "}
              <kbd className="rounded border border-border bg-background-primary px-1 py-0.5 font-mono text-[10px]">
                ↓
              </kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-background-primary px-1 py-0.5 font-mono text-[10px]">
                ↵
              </kbd>{" "}
              select
            </span>
          </div>
          <span>NBA Intelligence Global Search</span>
        </div>
      </div>
    </div>
  );
};
