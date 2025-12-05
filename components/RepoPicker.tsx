"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitBranch, Search, Star, Clock, Zap, Command, Code2, GitFork } from "lucide-react";

type Repository = {
  owner: string;
  repo: string;
  description?: string;
  language?: string;
  stars?: number;
  forks?: number;
  isPrivate?: boolean;
  updatedAt?: string;
};

type RepoPickerProps = {
  value?: Repository;
  options: Array<Repository>;
  onChange?: (value: Repository) => void;
};

// Local storage keys
const RECENT_REPOS_KEY = "repopicker_recent";
const FAVORITE_REPOS_KEY = "repopicker_favorites";

export function RepoPicker({ value, options, onChange }: RepoPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentRepos, setRecentRepos] = useState<Repository[]>([]);
  const [favoriteRepos, setFavoriteRepos] = useState<Set<string>>(new Set());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load recent repos and favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_REPOS_KEY);
      if (stored) setRecentRepos(JSON.parse(stored));

      const storedFavs = localStorage.getItem(FAVORITE_REPOS_KEY);
      if (storedFavs) setFavoriteRepos(new Set(JSON.parse(storedFavs)));
    } catch (e) {
      console.error("Failed to load repo preferences", e);
    }
  }, []);

  // Auto-focus search when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  const hasSelection = Boolean(value);
  const label = hasSelection ? `${value!.owner}/${value!.repo}` : "Select repository";
  const disabled = options.length === 0;

  const repoKey = (repo: Repository) => `${repo.owner}/${repo.repo}`;

  // Filter and organize repos
  const { filteredOptions, recentFiltered, favoritesFiltered } = useMemo(() => {
    const query = searchQuery.toLowerCase();

    const filtered = options.filter((option) => {
      const fullName = repoKey(option).toLowerCase();
      return fullName.includes(query);
    });

    const recent = recentRepos
      .filter((r) => options.some((o) => repoKey(o) === repoKey(r)))
      .filter((r) => repoKey(r).toLowerCase().includes(query))
      .slice(0, 3);

    const favorites = options
      .filter((o) => favoriteRepos.has(repoKey(o)))
      .filter((o) => repoKey(o).toLowerCase().includes(query));

    return {
      filteredOptions: filtered,
      recentFiltered: recent,
      favoritesFiltered: favorites,
    };
  }, [searchQuery, options, recentRepos, favoriteRepos]);

  // Build flat list for keyboard navigation
  const allSelectableRepos = useMemo(() => {
    const list: Repository[] = [];
    if (favoritesFiltered.length > 0) list.push(...favoritesFiltered);
    if (recentFiltered.length > 0) list.push(...recentFiltered);
    list.push(...filteredOptions.filter(
      (o) => !favoriteRepos.has(repoKey(o)) && !recentFiltered.some((r) => repoKey(r) === repoKey(o))
    ));
    return list;
  }, [favoritesFiltered, recentFiltered, filteredOptions, favoriteRepos]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  const handleSelect = (option: Repository) => {
    // Add to recent repos
    const updated = [option, ...recentRepos.filter((r) => repoKey(r) !== repoKey(option))].slice(0, 5);
    setRecentRepos(updated);
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated));

    onChange?.(option);
    setOpen(false);
    setSearchQuery("");
  };

  const toggleFavorite = (repo: Repository, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = repoKey(repo);
    const newFavorites = new Set(favoriteRepos);

    if (newFavorites.has(key)) {
      newFavorites.delete(key);
    } else {
      newFavorites.add(key);
    }

    setFavoriteRepos(newFavorites);
    localStorage.setItem(FAVORITE_REPOS_KEY, JSON.stringify([...newFavorites]));
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % allSelectableRepos.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allSelectableRepos.length) % allSelectableRepos.length);
        break;
      case "Enter":
        e.preventDefault();
        if (allSelectableRepos[selectedIndex]) {
          handleSelect(allSelectableRepos[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setSearchQuery("");
        break;
    }
  };

  const renderRepoItem = (option: Repository, index: number, section?: string) => {
    const key = repoKey(option);
    const isFavorite = favoriteRepos.has(key);
    const isSelected = allSelectableRepos[selectedIndex] && repoKey(allSelectableRepos[selectedIndex]) === key;
    const isHovered = hoveredIndex === index;
    const isActive = value && repoKey(value) === key;

    // Language colors (GitHub-style)
    const languageColors: Record<string, string> = {
      TypeScript: "text-blue-400",
      JavaScript: "text-yellow-400",
      Python: "text-blue-300",
      Go: "text-cyan-400",
      Rust: "text-orange-400",
      Java: "text-red-400",
      Ruby: "text-red-300",
      PHP: "text-purple-400",
      C: "text-slate-400",
      "C++": "text-pink-400",
      Swift: "text-orange-300",
      Kotlin: "text-purple-500",
    };

    const languageColor = option.language ? languageColors[option.language] || "text-slate-400" : "text-slate-400";

    return (
      <DropdownMenuItem
        key={`${section}-${key}`}
        onSelect={() => handleSelect(option)}
        onMouseEnter={() => setHoveredIndex(index)}
        onMouseLeave={() => setHoveredIndex(null)}
        className={`
          group relative flex flex-col gap-2 px-3 py-3 cursor-pointer
          transition-all duration-200 ease-out
          ${isSelected ? "bg-cyan-500/20 border-l-2 border-cyan-400" : "border-l-2 border-transparent"}
          ${isHovered ? "bg-white/5" : ""}
          ${isActive ? "bg-pink-500/10" : ""}
        `}
      >
        {/* Neon glow on hover */}
        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-pink-500/10 to-purple-500/10 animate-pulse" />
        )}

        {/* Top row: Name and metadata */}
        <div className="relative flex items-start justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <GitBranch className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${isSelected ? "text-cyan-400" : "text-slate-500"}`} />
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold truncate transition-colors ${isSelected ? "text-cyan-300" : ""}`}>
                  {option.owner}/{option.repo}
                </span>
                {isActive && (
                  <span className="text-[9px] text-pink-400 font-mono px-1.5 py-0.5 bg-pink-500/10 rounded border border-pink-500/30">
                    ACTIVE
                  </span>
                )}
                {option.isPrivate && (
                  <span className="text-[9px] text-yellow-500 font-mono px-1.5 py-0.5 bg-yellow-500/10 rounded border border-yellow-500/30">
                    PRIVATE
                  </span>
                )}
              </div>
              {option.description && (
                <span className="text-[11px] text-slate-400 truncate mt-0.5 leading-tight">
                  {option.description}
                </span>
              )}
            </div>
          </div>

          <div className="relative flex items-center gap-2 flex-shrink-0">
            {section === "recent" && <Clock className="h-3 w-3 text-slate-500" />}
            {section === "quick" && <Zap className="h-3 w-3 text-yellow-400" />}
            <button
              onClick={(e) => toggleFavorite(option, e)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:scale-110 transform"
            >
              <Star
                className={`h-3.5 w-3.5 transition-colors ${
                  isFavorite ? "fill-yellow-400 text-yellow-400" : "text-slate-500"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Bottom row: Stats */}
        {(option.language || option.stars !== undefined || option.forks !== undefined) && (
          <div className="relative flex items-center gap-3 text-[10px] text-slate-500 ml-6">
            {option.language && (
              <div className="flex items-center gap-1.5">
                <Code2 className={`h-3 w-3 ${languageColor}`} />
                <span className={languageColor}>{option.language}</span>
              </div>
            )}
            {option.stars !== undefined && option.stars > 0 && (
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-slate-500" />
                <span>{option.stars.toLocaleString()}</span>
              </div>
            )}
            {option.forks !== undefined && option.forks > 0 && (
              <div className="flex items-center gap-1">
                <GitFork className="h-3 w-3" />
                <span>{option.forks.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setSearchQuery("");
    }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="
            group relative gap-2 rounded-full overflow-hidden
            bg-slate-900/80 backdrop-blur-xl
            border border-slate-700/50
            hover:border-cyan-500/50
            transition-all duration-300
            shadow-lg hover:shadow-cyan-500/20
          "
          disabled={disabled}
        >
          {/* Glassmorphic shine effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Neon border glow */}
          <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/20 via-pink-500/20 to-purple-500/20 blur-sm" />
          </div>

          <GitBranch className="relative h-4 w-4 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
          <span className="relative text-sm font-semibold min-w-[160px] text-left">
            {label}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="
          min-w-[420px] p-0 overflow-hidden
          bg-slate-900/95 backdrop-blur-2xl
          border border-slate-700/50
          shadow-2xl shadow-black/50
        "
        onKeyDown={handleKeyDown}
      >
        {/* Animated gradient border */}
        <div className="absolute inset-0 rounded-lg opacity-50 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 via-pink-500/30 to-purple-500/30 blur-xl animate-pulse" />
        </div>

        {/* Header with glassmorphic effect */}
        <div className="relative border-b border-slate-700/50 bg-white/5">
          <DropdownMenuLabel className="px-4 py-3 text-xs font-bold tracking-wider uppercase text-slate-300">
            Repositories
          </DropdownMenuLabel>
        </div>

        {/* Search with neon accent */}
        <div className="relative px-3 py-3 border-b border-slate-700/50">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
            <Input
              ref={searchInputRef}
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="
                pl-10 pr-16 h-9 text-sm
                bg-slate-800/50 backdrop-blur-sm
                border-slate-700/50
                focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20
                placeholder:text-slate-500
                transition-all duration-200
              "
              onKeyDown={handleKeyDown}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-mono text-slate-500">
              <Command className="h-3 w-3" />
              <span>K</span>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[320px]">
          <div className="relative px-2 py-2">
            {/* Favorites Section */}
            {favoritesFiltered.length > 0 && (
              <>
                <div className="px-3 py-2 text-[10px] font-bold tracking-wider uppercase text-yellow-400 flex items-center gap-2">
                  <Star className="h-3 w-3 fill-yellow-400" />
                  Favorites
                </div>
                {favoritesFiltered.map((option, idx) =>
                  renderRepoItem(option, idx, "favorite")
                )}
                <DropdownMenuSeparator className="my-2 bg-slate-700/50" />
              </>
            )}

            {/* Recent Section */}
            {recentFiltered.length > 0 && !searchQuery && (
              <>
                <div className="px-3 py-2 text-[10px] font-bold tracking-wider uppercase text-slate-400 flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Recent
                </div>
                {recentFiltered.map((option, idx) =>
                  renderRepoItem(option, favoritesFiltered.length + idx, "recent")
                )}
                <DropdownMenuSeparator className="my-2 bg-slate-700/50" />
              </>
            )}

            {/* All Repositories */}
            {filteredOptions.filter(
              (o) => !favoriteRepos.has(repoKey(o)) && !recentFiltered.some((r) => repoKey(r) === repoKey(o))
            ).length > 0 && (
              <>
                <div className="px-3 py-2 text-[10px] font-bold tracking-wider uppercase text-slate-400">
                  All Repositories
                </div>
                {filteredOptions
                  .filter((o) => !favoriteRepos.has(repoKey(o)) && !recentFiltered.some((r) => repoKey(r) === repoKey(o)))
                  .map((option, idx) =>
                    renderRepoItem(
                      option,
                      favoritesFiltered.length + recentFiltered.length + idx,
                      "all"
                    )
                  )}
              </>
            )}

            {/* Empty States */}
            {filteredOptions.length === 0 && searchQuery && (
              <div className="px-4 py-8 text-center">
                <div className="text-slate-500 text-sm mb-2">No repositories found</div>
                <div className="text-slate-600 text-xs">Try a different search term</div>
              </div>
            )}

            {options.length === 0 && (
              <div className="px-4 py-8 text-center">
                <GitBranch className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                <div className="text-slate-500 text-sm">No repositories configured</div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer with keyboard hints */}
        <div className="relative border-t border-slate-700/50 bg-white/5 px-3 py-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↵</kbd>
                Select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">ESC</kbd>
              Close
            </span>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
