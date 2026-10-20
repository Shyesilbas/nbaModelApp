import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, UserX, Users, RotateCcw, Sparkles, Search } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";
import type { PlayerStatusOverride } from "../../api/predictions";

export interface RotationPlayer {
  player_id?: number | string;
  player_name: string;
  position_group?: string;
  predicted_pts?: number;
  predicted_reb?: number;
  predicted_ast?: number;
  predicted_min?: number;
  status?: "ACTIVE" | "RESTRICTED" | "OUT" | "DNP";
  // Son maçta oynamayan rotasyon oyuncusu: takım modelleri "Full" seçilmedikçe yok sayar
  assumed_out?: boolean;
  // 0.5*dk + sayı + 0.8*asist + 0.6*ribaund (son 10 maç EMA); liste bu skora göre sıralanır
  importance?: number;
}

interface LineupInjuryHubProps {
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  homePlayers: RotationPlayer[];
  awayPlayers: RotationPlayer[];
  overrides: Record<string, PlayerStatusOverride>;
  onOverrideChange: (playerIdOrName: string, override: PlayerStatusOverride, keepActive?: boolean) => void;
  onResetOverrides: () => void;
  onApplyChanges?: () => void;
  loading?: boolean;
}

const MAX_STARTERS = 5;

export const LineupInjuryHub: React.FC<LineupInjuryHubProps> = ({
  homeInfo,
  awayInfo,
  homePlayers,
  awayPlayers,
  overrides,
  onOverrideChange,
  onResetOverrides,
  onApplyChanges,
  loading = false,
}) => {
  const [homeQuery, setHomeQuery] = useState("");
  const [awayQuery, setAwayQuery] = useState("");

  const getPlayerStatus = (p: RotationPlayer): "ACTIVE" | "RESTRICTED" | "OUT" | "DNP" => {
    const key = String(p.player_id ?? p.player_name);
    if (overrides[key]) return overrides[key].status;
    if (p.assumed_out) return "DNP";
    return p.status || "ACTIVE";
  };

  const handleStatusSelect = (p: RotationPlayer, status: "ACTIVE" | "RESTRICTED" | "OUT") => {
    const key = String(p.player_id ?? p.player_name);
    const factor = status === "OUT" ? 0.0 : status === "RESTRICTED" ? 0.6 : 1.0;
    const minLimit = status === "RESTRICTED" ? 20.0 : undefined;
    onOverrideChange(key, {
      player_id: typeof p.player_id === "number" ? p.player_id : undefined,
      player_name: p.player_name,
      status,
      minute_limit: minLimit,
      status_factor: factor,
      is_starter: overrides[key]?.is_starter,
    }, status === "ACTIVE" && (Boolean(p.assumed_out) || overrides[key]?.is_starter !== undefined));
  };

  // Aynı seçeneğe tekrar basmak seçimi kaldırır (undefined = modelin kendi tahmini)
  const countStarters = (players: RotationPlayer[]) =>
    players.filter((q) => overrides[String(q.player_id ?? q.player_name)]?.is_starter === true).length;

  const handleStarterSelect = (p: RotationPlayer, isStarter: boolean, teamPlayers: RotationPlayer[]) => {
    const key = String(p.player_id ?? p.player_name);
    if (isStarter && overrides[key]?.is_starter !== true && countStarters(teamPlayers) >= MAX_STARTERS) return;
    const existing = overrides[key];
    const status = existing?.status ?? (p.status === "RESTRICTED" ? "RESTRICTED" : "ACTIVE");
    const nextStarter = existing?.is_starter === isStarter ? undefined : isStarter;
    onOverrideChange(key, {
      player_id: typeof p.player_id === "number" ? p.player_id : undefined,
      player_name: p.player_name,
      status,
      minute_limit: existing?.minute_limit,
      status_factor: existing?.status_factor ?? (status === "RESTRICTED" ? 0.6 : 1.0),
      is_starter: nextStarter,
    }, status === "ACTIVE" && (Boolean(p.assumed_out) || nextStarter !== undefined));
  };

  const overrideCount = Object.keys(overrides).length;

  const renderRosterColumn = (team: TeamInfo, players: RotationPlayer[], isHome: boolean) => {
    const outCount = players.filter((p) => getPlayerStatus(p) === "OUT").length;
    const restCount = players.filter((p) => getPlayerStatus(p) === "RESTRICTED").length;
    const query = (isHome ? homeQuery : awayQuery).toLowerCase().trim();
    const starterLimitReached = countStarters(players) >= MAX_STARTERS;
    const displayedPlayers = query
      ? players.filter((p) => p.player_name.toLowerCase().includes(query))
      : players;
    // Önem skoruna göre sabit sıralama: durum değişince satırlar yer değiştirmez
    const ordered = [...displayedPlayers].sort(
      (a, b) => (b.importance ?? b.predicted_pts ?? 0) - (a.importance ?? a.predicted_pts ?? 0)
    );

    return (
      <div className="flex-1 bg-background-secondary rounded border border-border p-4 flex flex-col gap-3">
        {/* Team Header */}
        <div className="flex items-center justify-between border-b border-border-light pb-3">
          <div className="flex items-center gap-2.5">
            <TeamLogo abbr={team.abbr} name={team.name} size={28} />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-text-primary">{team.name}</span>
                <span className="text-xs font-medium px-1.5 py-0.5 rounded-sm bg-background-primary border border-border text-text-secondary uppercase">
                  {isHome ? "Ev Sahibi" : "Deplasman"}
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                {players.filter((p) => getPlayerStatus(p) !== "DNP" && getPlayerStatus(p) !== "OUT").length} Aktif Rotasyon · {players.length} Kadro Oyuncusu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {outCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-status-error/10 text-status-error border border-status-error/20">
                {outCount} Out
              </span>
            )}
            {restCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-status-warning/10 text-status-warning border border-status-warning/20">
                {restCount} Kısıtlı
              </span>
            )}
            {outCount === 0 && restCount === 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-status-success/10 text-status-success border border-status-success/20">
                Tam Kadro
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        {players.length > 8 && (
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              placeholder={`${team.name} kadrosunda ara (${players.length} oyuncu)...`}
              value={isHome ? homeQuery : awayQuery}
              onChange={(e) => (isHome ? setHomeQuery(e.target.value) : setAwayQuery(e.target.value))}
              className="w-full h-8 rounded border border-border bg-background-primary pl-8 pr-3 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-border-focus"
            />
          </div>
        )}

        {/* Players List */}
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {displayedPlayers.length === 0 ? (
            <div className="p-4 text-center text-xs text-text-secondary">
              {query ? `"${query}" ile eşleşen oyuncu bulunamadı.` : "Kadro oyuncusu bulunamadı."}
            </div>
          ) : (
            ordered.map((p) => {
              const currentStatus = getPlayerStatus(p);
              const isOut = currentStatus === "OUT";
              const isRestricted = currentStatus === "RESTRICTED";
              const isDnp = currentStatus === "DNP" || (p.predicted_min !== undefined && p.predicted_min <= 0 && !isOut);

              return (
                <div
                  key={String(p.player_id ?? p.player_name)}
                  className={`flex items-center justify-between p-2 rounded border transition-colors ${
                    isOut
                      ? "bg-background-primary/50 border-status-error/30 opacity-75"
                      : isRestricted
                      ? "bg-background-primary border-status-warning/30"
                      : isDnp
                      ? "bg-background-primary/40 border-border opacity-70"
                      : "bg-background-primary border-border hover:border-card-border-hover"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-semibold truncate ${
                            isOut
                              ? "line-through text-text-muted"
                              : isDnp
                              ? "text-text-secondary"
                              : "text-text-primary"
                          }`}
                        >
                          {p.player_name}
                        </span>
                        {p.position_group && (
                          <span className="text-xs font-medium px-1 py-0.2 rounded-sm bg-background-secondary text-text-secondary uppercase">
                            {p.position_group}
                          </span>
                        )}
                        {isDnp && (
                          <span className="text-xs font-medium px-1.5 py-0.2 rounded-sm bg-background-secondary text-text-muted uppercase">
                            DNP
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        {!isOut && !isDnp && p.predicted_pts !== undefined && (
                          <span className="tabular-nums">
                            Proj: <strong className="text-text-primary font-medium">{p.predicted_pts} Sayı</strong>
                            {p.predicted_min !== undefined && (
                              <span className="text-text-secondary"> · {p.predicted_min} Dk</span>
                            )}
                          </span>
                        )}
                        {!isOut && !isDnp && p.predicted_pts === undefined && p.importance !== undefined && (
                          <span className="tabular-nums">Önem skoru: <strong className="text-text-primary font-medium">{p.importance.toFixed(1)}</strong></span>
                        )}
                        {isDnp && <span>{p.assumed_out ? "Son maçta oynamadı · model oynamıyor sayıyor (Full ile ekle)" : "Rotasyon dışı: dakika sıralamasında ilk 10 dışında · Full ile ekle"}</span>}
                        {isRestricted && <span className="text-status-warning font-medium">Kısıtlı Süre (%60)</span>}
                        {isOut && <span className="text-status-error font-medium">0 Dk (Sakat / Yok)</span>}
                        {!isOut && (
                          <span className="inline-flex items-center border border-border rounded overflow-hidden">
                            {([true, false] as const).map((value) => {
                              const selected = overrides[String(p.player_id ?? p.player_name)]?.is_starter === value;
                              const blocked = value && !selected && starterLimitReached;
                              return (
                                <button
                                  key={String(value)}
                                  type="button"
                                  title={
                                    blocked
                                      ? `Takımda en fazla ${MAX_STARTERS} starter seçilebilir`
                                      : value ? "Maça starter başlıyor (en az ~26 dk)" : "Yedekten çıkıyor (en fazla ~22 dk)"
                                  }
                                  aria-pressed={selected}
                                  disabled={blocked}
                                  onClick={() => handleStarterSelect(p, value, players)}
                                  className={`px-1.5 py-0.5 text-xs font-medium transition-colors ${
                                    blocked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                                  } ${selected ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
                                >
                                  {value ? "Starter" : "Yedek"}
                                </button>
                              );
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3-Way Status Toggle */}
                  <div className="flex items-center bg-background-secondary border border-border rounded p-0.5 shrink-0 gap-0.5">
                    <button
                      type="button"
                      title="Tam Kadro (%100 Rol)"
                      onClick={() => handleStatusSelect(p, "ACTIVE")}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                        currentStatus === "ACTIVE"
                          ? "bg-status-success text-white"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <CheckCircle2 size={12} />
                      Full
                    </button>
                    <button
                      type="button"
                      title="Kısıtlı Süre (%60 Rol)"
                      onClick={() => handleStatusSelect(p, "RESTRICTED")}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                        currentStatus === "RESTRICTED"
                          ? "bg-status-warning text-white"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <Clock size={12} />
                      Kısıtlı
                    </button>
                    <button
                      type="button"
                      title="Kadro Dışı / Sakat (0 Dk)"
                      onClick={() => handleStatusSelect(p, "OUT")}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                        currentStatus === "OUT"
                          ? "bg-status-error text-white"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <UserX size={12} />
                      Out
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-background-primary border border-border rounded p-5 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-light pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded border border-border bg-background-secondary flex items-center justify-center text-primary shrink-0">
            <Users size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              İnteraktif Kadro ve Sakatlık Simülatörü
              <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-background-secondary border border-border text-primary">
                Canlı Simülasyon
              </span>
            </h3>
            <p className="text-xs text-text-secondary">
              Oyuncu sakatlığı veya süre kısıtlaması belirleyin. Boşa çıkan hücum kullanım payı otomatik olarak takım arkadaşlarına dağıtılır.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={onResetOverrides}
              className="flex items-center gap-1.5 h-8 px-3 rounded border border-border bg-background-primary hover:bg-background-secondary text-text-primary text-xs font-medium transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Sıfırla ({overrideCount})</span>
            </button>
          )}

          {onApplyChanges && (
            <button
              type="button"
              onClick={onApplyChanges}
              disabled={loading}
              className="flex items-center gap-1.5 h-8 px-3 rounded bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Sparkles size={12} />
              <span>{loading ? "Hesaplanıyor..." : "Uygula ve Modeli Güncelle"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Roster Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderRosterColumn(homeInfo, homePlayers, true)}
        {renderRosterColumn(awayInfo, awayPlayers, false)}
      </div>

      {/* Analytics Explainer Footer */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded border border-border bg-background-secondary text-xs text-text-secondary">
        <AlertCircle size={14} className="text-primary shrink-0" />
        <span>
          <strong className="text-text-primary font-medium">Kullanım Dağıtım Motoru:</strong> Bir oyuncu{" "}
          <em>OUT</em> veya <em>KISITLI</em> olarak işaretlendiğinde, kayıp skor üretiminin %35&apos;i aktif rotasyon arkadaşlarına oransal olarak yeniden dağıtılır ve model tahminleri anında güncellenir.
        </span>
      </div>
    </div>
  );
};
