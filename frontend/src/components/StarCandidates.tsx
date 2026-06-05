import React, { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";

interface StarCandidate {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAMS_PLAYED_FOR: string;
  GP: number;
  AVG_MIN: number;
  AVG_PTS: number;
  AVG_REB: number;
  AVG_AST: number;
  IMPORTANCE_SCORE: number;
  LEAGUE_RANK: number;
}

interface StarCandidatesProps {
  candidates: StarCandidate[];
}

const StarCandidates: React.FC<StarCandidatesProps> = ({ candidates }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("LEAGUE_RANK");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const itemsPerPage = 15;

  // Filter candidates based on search query
  const filteredCandidates = useMemo(() => {
    let result = candidates.filter(player =>
      player.PLAYER_NAME.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (player.TEAMS_PLAYED_FOR && player.TEAMS_PLAYED_FOR.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Apply sorting
    result.sort((a, b) => {
      let valA = a[sortBy as keyof StarCandidate];
      let valB = b[sortBy as keyof StarCandidate];

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });

    return result;
  }, [candidates, searchQuery, sortBy, sortOrder]);

  // Pagination helper
  const paginatedCandidates = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredCandidates.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredCandidates, currentPage]);

  const totalPages = Math.ceil(filteredCandidates.length / itemsPerPage);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "LEAGUE_RANK" ? "asc" : "desc"); // default desc for stats, asc for rank
    }
    setCurrentPage(1); // reset to page 1
  };

  return (
    <div className="space-y-6">
      {/* Glow */}
      <div className="glow-bg top-0 right-10"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white m-0">Star Candidates</h1>
          <p className="text-slate-400 mt-1 text-sm">League-wide star players ranked dynamically by Importance Score</p>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search players or teams..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-64 bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-semibold"
          />
          <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
        </div>
      </div>

      {/* Top 3 League Leaders Cards */}
      {searchQuery === "" && currentPage === 1 && candidates.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {candidates.slice(0, 3).map((star, idx) => (
            <div key={star.PLAYER_ID} className="glass-card p-5 rounded-xl border border-slate-800 flex items-center justify-between relative overflow-hidden">
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-extrabold tracking-widest text-cyan-400 flex items-center gap-1">
                  <TrendingUp size={10} />
                  League Leader Rank {idx + 1}
                </span>
                <p className="text-base font-bold text-white m-0">{star.PLAYER_NAME}</p>
                <p className="text-xs text-slate-400 font-semibold">{star.TEAMS_PLAYED_FOR} • GP: {star.GP}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Importance</p>
                <p className="text-xl font-bold text-cyan-400 font-mono mt-0.5">{star.IMPORTANCE_SCORE.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Roster Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
              <tr>
                <th 
                  onClick={() => handleSort("LEAGUE_RANK")}
                  className="p-4 cursor-pointer hover:text-white select-none transition-colors"
                >
                  Rank {sortBy === "LEAGUE_RANK" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("PLAYER_NAME")}
                  className="p-4 cursor-pointer hover:text-white select-none transition-colors"
                >
                  Player Name {sortBy === "PLAYER_NAME" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="p-4">Team(s)</th>
                <th 
                  onClick={() => handleSort("GP")}
                  className="p-4 cursor-pointer hover:text-white select-none text-center transition-colors"
                >
                  GP {sortBy === "GP" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_MIN")}
                  className="p-4 cursor-pointer hover:text-white select-none text-right transition-colors"
                >
                  Avg Min {sortBy === "AVG_MIN" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_PTS")}
                  className="p-4 cursor-pointer hover:text-white select-none text-right transition-colors"
                >
                  Avg Pts {sortBy === "AVG_PTS" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_REB")}
                  className="p-4 cursor-pointer hover:text-white select-none text-right transition-colors"
                >
                  Avg Reb {sortBy === "AVG_REB" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_AST")}
                  className="p-4 cursor-pointer hover:text-white select-none text-right transition-colors"
                >
                  Avg Ast {sortBy === "AVG_AST" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("IMPORTANCE_SCORE")}
                  className="p-4 cursor-pointer hover:text-cyan-400 text-cyan-400 font-bold select-none text-right transition-colors"
                >
                  Importance {sortBy === "IMPORTANCE_SCORE" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {paginatedCandidates.map((player) => (
                <tr key={player.PLAYER_ID} className="hover:bg-slate-900/30 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-400">{player.LEAGUE_RANK}</td>
                  <td className="p-4 font-bold text-white">{player.PLAYER_NAME}</td>
                  <td className="p-4 text-xs font-semibold text-slate-400">{player.TEAMS_PLAYED_FOR}</td>
                  <td className="p-4 text-center font-mono">{player.GP}</td>
                  <td className="p-4 text-right font-mono">{player.AVG_MIN.toFixed(1)}</td>
                  <td className="p-4 text-right font-mono">{player.AVG_PTS.toFixed(1)}</td>
                  <td className="p-4 text-right font-mono">{player.AVG_REB.toFixed(1)}</td>
                  <td className="p-4 text-right font-mono">{player.AVG_AST.toFixed(1)}</td>
                  <td className="p-4 text-right font-mono font-bold text-cyan-400">{player.IMPORTANCE_SCORE.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-900/40 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Showing page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong> ({filteredCandidates.length} total players)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StarCandidates;
