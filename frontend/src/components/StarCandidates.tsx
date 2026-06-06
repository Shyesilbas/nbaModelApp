import React, { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, TrendingUp, ArrowUpDown } from "lucide-react";

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
      <section className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
              <TrendingUp size={11} />
              Ranking board
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 m-0 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Star Candidates
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">League-wide star players ranked dynamically by Importance Score.</p>
          </div>
          
          <div className="relative">
            <input
              type="text"
              placeholder="Search players or teams..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-72 bg-white border border-slate-200 rounded-2xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d428a] focus:ring-2 focus:ring-[#1d428a]/10 font-semibold shadow-sm"
            />
            <Search className="absolute left-3 top-3 text-slate-400" size={14} />
          </div>
        </div>
      </section>

      {/* Top 3 League Leaders Cards */}
      {searchQuery === "" && currentPage === 1 && candidates.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {candidates.slice(0, 3).map((star, idx) => (
            <div key={star.PLAYER_ID} className="glass-card p-5 rounded-[1.5rem] border border-slate-100 flex items-center justify-between relative overflow-hidden">
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-extrabold tracking-widest text-[#1d428a] flex items-center gap-1">
                  <TrendingUp size={10} />
                  League Leader Rank {idx + 1}
                </span>
                <p className="text-base font-black text-slate-800 m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{star.PLAYER_NAME}</p>
                <p className="text-xs text-slate-500 font-semibold">{star.TEAMS_PLAYED_FOR} • GP: {star.GP}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Importance</p>
                <p className="text-xl font-bold text-[#1d428a] font-mono mt-0.5">{star.IMPORTANCE_SCORE.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Roster Table */}
      <div className="glass-card rounded-[1.5rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 bg-slate-50 text-slate-400 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th 
                  onClick={() => handleSort("LEAGUE_RANK")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none transition-colors"
                >
                  Rank {sortBy === "LEAGUE_RANK" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("PLAYER_NAME")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none transition-colors"
                >
                  Player Name {sortBy === "PLAYER_NAME" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="p-4">Team(s)</th>
                <th 
                  onClick={() => handleSort("GP")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-center transition-colors"
                >
                  GP {sortBy === "GP" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_MIN")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                >
                  Avg Min {sortBy === "AVG_MIN" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_PTS")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                >
                  Avg Pts {sortBy === "AVG_PTS" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_REB")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                >
                  Avg Reb {sortBy === "AVG_REB" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_AST")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                >
                  Avg Ast {sortBy === "AVG_AST" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("IMPORTANCE_SCORE")}
                  className="p-4 cursor-pointer hover:text-[#1d428a] text-[#1d428a] font-bold select-none text-right transition-colors"
                >
                  Importance {sortBy === "IMPORTANCE_SCORE" ? (sortOrder === "asc" ? "▲" : "▼") : ""} <ArrowUpDown size={10} className="inline ml-1" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedCandidates.map((player) => (
                <tr key={player.PLAYER_ID} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-400">{player.LEAGUE_RANK}</td>
                  <td className="p-4 font-bold text-slate-800">{player.PLAYER_NAME}</td>
                  <td className="p-4 text-xs font-semibold text-slate-400">{player.TEAMS_PLAYED_FOR}</td>
                  <td className="p-4 text-center font-mono">{player.GP}</td>
                  <td className="p-4 text-right font-mono">{player.AVG_MIN.toFixed(1)}</td>
                  <td className="p-4 text-right font-mono">{player.AVG_PTS.toFixed(1)}</td>
                  <td className="p-4 text-right font-mono">{player.AVG_REB.toFixed(1)}</td>
                  <td className="p-4 text-right font-mono">{player.AVG_AST.toFixed(1)}</td>
                  <td className="p-4 text-right font-mono font-bold text-[#1d428a]">{player.IMPORTANCE_SCORE.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-slate-500">
              Showing page <strong className="text-slate-700">{currentPage}</strong> of <strong className="text-slate-700">{totalPages}</strong> ({filteredCandidates.length} total players)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"
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
