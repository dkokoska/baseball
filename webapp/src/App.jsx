import { useState, useEffect, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import { Search, Trophy, DollarSign, TrendingUp, Activity, Plus, Minus, Save } from 'lucide-react';
import { cn } from './lib/utils';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

const API_URL = 'http://localhost:3000/api/adjustments';

function App() {
  const [rawData, setRawData] = useState([]);
  const [adjustments, setAdjustments] = useState({}); // { playerId-stat: delta }
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');

  // 1. Fetch CSV and Adjustments
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [csvResponse, adjResponse] = await Promise.all([
          fetch('/2026PC.csv').then((res) => res.text()),
          fetch(API_URL).then((res) => res.json())
        ]);

        const parsed = Papa.parse(csvResponse, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });

        // Convert adjustments array to map for fast lookup
        // Key: `${playerId}-${stat}`
        const adjMap = {};
        if (adjResponse.data) {
          adjResponse.data.forEach(adj => {
            adjMap[`${adj.playerId}-${adj.stat}`] = adj.delta;
          });
        }

        setRawData(parsed.data);
        setAdjustments(adjMap);
        setLoading(false);
      } catch (error) {
        console.error("Failed to load data", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 2. Handle Stat Adjustment (Optimistic UI + API Save)
  const handleAdjustment = useCallback(async (playerId, stat, deltaChange) => {
    const key = `${playerId}-${stat}`;

    // Calculate new value directly to ensure correct stepping
    const currentDelta = adjustments[key] || 0;
    // Avoid floating point drift by rounding
    const newDelta = Math.round((currentDelta + deltaChange) * 100) / 100;

    // Optimistic update
    setAdjustments(prev => ({
      ...prev,
      [key]: newDelta
    }));

    // API Call
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, stat, delta: newDelta })
      });
    } catch (err) {
      console.error("Failed to save adjustment", err);
    }
  }, [adjustments]);

  // 3. Process Data (Merge + Calculate)
  const processedData = useMemo(() => {
    if (loading || !rawData.length) return [];
    return calculateFromRawData(rawData, adjustments);
  }, [rawData, adjustments, loading]);

  // UI Components for Steppers
  const StatCell = ({ row, stat, step = 1, fixed = 0 }) => {
    const originalValue = row.original[stat];
    if (typeof originalValue !== 'number') return null;

    const playerId = row.original.PlayerId;
    const key = `${playerId}-${stat}`;

    // Total Value = Original + Adjustment
    const adjustment = adjustments[key] || 0;
    const displayValue = (originalValue + adjustment).toFixed(fixed);

    // Visual indicator of adjustment
    const isAdjusted = adjustment !== 0;
    const adjColor = adjustment > 0 ? "text-green-400" : adjustment < 0 ? "text-red-400" : "text-neutral-400";

    return (
      <div className="flex items-center justify-between gap-1 w-full max-w-[140px] select-none">
        <button
          onClick={(e) => { e.stopPropagation(); handleAdjustment(playerId, stat, -step); }}
          className="w-6 h-6 flex items-center justify-center bg-neutral-800 hover:bg-red-500/20 rounded active:scale-95 transition-all text-neutral-500 hover:text-red-400 border border-neutral-700"
        >
          <Minus className="w-3 h-3" />
        </button>

        <div className="flex flex-col items-center flex-1">
          <span className={cn("font-mono font-medium leading-none", isAdjusted ? "text-blue-300" : "text-neutral-300")}>
            {displayValue}
          </span>
          {isAdjusted && (
            <span className={cn("text-[9px] leading-tight", adjColor)}>
              {adjustment > 0 ? '+' : ''}{adjustment.toFixed(fixed)}
            </span>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); handleAdjustment(playerId, stat, step); }}
          className="w-6 h-6 flex items-center justify-center bg-neutral-800 hover:bg-green-500/20 rounded active:scale-95 transition-all text-neutral-500 hover:text-green-400 border border-neutral-700"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'Name',
        header: 'Player',
        cell: (info) => (
          <div className="flex flex-col">
            <span className="font-semibold text-white text-sm">{info.getValue()}</span>
            <span className="text-xs text-neutral-500">{info.row.original.Team}</span>
          </div>
        ),
      },
      {
        accessorKey: 'ERA',
        header: 'ERA',
        cell: (info) => <StatCell row={info.row} stat="ERA" step={0.05} fixed={2} />,
      },
      {
        accessorKey: 'WHIP',
        header: 'WHIP',
        cell: (info) => <StatCell row={info.row} stat="WHIP" step={0.01} fixed={2} />,
      },
      {
        accessorKey: 'W',
        header: 'W',
        cell: (info) => <StatCell row={info.row} stat="W" step={1} fixed={0} />,
      },
      {
        accessorKey: 'SV',
        header: 'SV',
        cell: (info) => <StatCell row={info.row} stat="SV" step={1} fixed={0} />,
      },
      {
        accessorKey: 'SO',
        header: 'SO',
        cell: (info) => <StatCell row={info.row} stat="SO" step={5} fixed={0} />,
      },
      {
        accessorKey: 'Value',
        header: 'Value',
        cell: (info) => {
          const val = info.getValue();
          const isPositive = val > 0;
          return (
            <div className={cn("font-bold text-base px-2 py-1 rounded text-center border",
              isPositive
                ? "text-green-400 bg-green-500/10 border-green-500/30"
                : "text-red-400 bg-red-500/10 border-red-500/30")}>
              ${val.toFixed(2)}
            </div>
          );
        },
      },
    ],
    [adjustments] // Re-render columns when adjustments change
  );

  const table = useReactTable({
    data: processedData,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-6 font-sans w-full">
      <div className="max-w-[1920px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-3">
              <Trophy className="w-10 h-10 text-indigo-500" />
              Fantasy Value Editor
            </h1>
            <p className="text-neutral-400 mt-2 flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4" />
              Interactive Valuation • Top 200 • $1500 Pool
            </p>
          </div>

          {/* Stats Cards */}
          <div className="flex gap-4">
            <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700/50 backdrop-blur-sm">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Pool</span>
              <div className="text-2xl font-mono text-green-400 flex items-center gap-1">
                <DollarSign className="w-5 h-5" />
                1,500
              </div>
            </div>
            <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700/50 backdrop-blur-sm">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Adjustments</span>
              <div className="text-2xl font-mono text-blue-400 flex items-center gap-1">
                <Save className="w-5 h-5" />
                {Object.keys(adjustments).length}
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="w-full">
          <div className="relative group max-w-md">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-neutral-500 group-focus-within:text-blue-400 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Search players..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="block w-full pl-12 pr-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:outline-none transition-all shadow-lg"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="bg-neutral-800 text-neutral-400 border-b border-neutral-700">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className="p-3 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-neutral-700 transition-colors select-none border-r border-neutral-700 last:border-r-0 text-center"
                      >
                        <div className="flex items-center justify-center gap-2">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {{
                            asc: ' ▲',
                            desc: ' ▼',
                          }[header.column.getIsSorted()] ?? null}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} className="p-8 text-center text-neutral-500">
                      Loading data...
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-neutral-800 hover:bg-neutral-800/50 transition-colors group"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-2 text-center border-r border-neutral-800 last:border-r-0 relative">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-neutral-800 bg-neutral-900 text-xs text-neutral-500 flex justify-end">
            Showing {table.getRowModel().rows.length} players
          </div>
        </div>
      </div>
    </div>
  );
}

function calculateFromRawData(rawData, adjustments) {
  // Filter only rows with valid stats
  const players = rawData
    .filter(p => p.Name && p.PlayerId)
    .map(p => {
      // Apply Adjustments
      const pid = p.PlayerId;
      return {
        ...p,
        ERA: p.ERA + (adjustments[`${pid}-ERA`] || 0),
        WHIP: p.WHIP + (adjustments[`${pid}-WHIP`] || 0),
        W: p.W + (adjustments[`${pid}-W`] || 0),
        SV: p.SV + (adjustments[`${pid}-SV`] || 0),
        SO: p.SO + (adjustments[`${pid}-SO`] || 0),
      };
    });

  // Calculate Mean and StdDev for each category
  const stats = ['ERA', 'WHIP', 'W', 'SV', 'SO'];
  const means = {};
  const stds = {};

  stats.forEach(stat => {
    const values = players.map(p => p[stat]);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;

    means[stat] = mean;
    stds[stat] = Math.sqrt(variance);
  });

  const scoredPlayers = players.map(p => {
    let zSum = 0;
    // Lower is better (inverted Z) - Avoid division by zero
    zSum += stds['ERA'] ? (means['ERA'] - p.ERA) / stds['ERA'] : 0;
    zSum += stds['WHIP'] ? (means['WHIP'] - p.WHIP) / stds['WHIP'] : 0;

    // Higher is better (standard Z)
    zSum += stds['W'] ? (p.W - means['W']) / stds['W'] : 0;
    zSum += stds['SV'] ? (p.SV - means['SV']) / stds['SV'] : 0;
    zSum += stds['SO'] ? (p.SO - means['SO']) / stds['SO'] : 0;

    return { ...p, rawZ: zSum };
  });

  // Sort by raw Z-score descending to find the top players
  scoredPlayers.sort((a, b) => b.rawZ - a.rawZ);

  // Identify Replacement Level (Player 201 => Index 200)
  // Ensure we have enough players
  const replacementIdx = Math.min(200, scoredPlayers.length - 1);
  const replacementLevelZ = scoredPlayers[replacementIdx].rawZ;

  // Calculate Adjusted Score (Value Over Replacement)
  const evaluatedPlayers = scoredPlayers.map(p => ({
    ...p,
    valOverReplacement: p.rawZ - replacementLevelZ
  }));

  // Calculate sum of positive scores for pool distribution
  const positiveSum = evaluatedPlayers
    .filter(p => p.valOverReplacement > 0)
    .reduce((sum, p) => sum + p.valOverReplacement, 0);

  // Distribute $1500 pool
  return evaluatedPlayers.map(p => {
    let dollarValue = 0;
    if (positiveSum > 0) {
      dollarValue = (p.valOverReplacement / positiveSum) * 1500;
    }
    return { ...p, Value: dollarValue };
  });
}

export default App;
