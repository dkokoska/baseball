import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { Search, Trophy, DollarSign, TrendingUp, Activity } from 'lucide-react';
import { cn } from './lib/utils';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');

  useEffect(() => {
    fetch('/2026PC.csv')
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const processedData = calculateFromRawData(results.data);
            setData(processedData);
            setLoading(false);
          },
        });
      });
  }, []);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'Name',
        header: 'Player',
        cell: (info) => <span className="font-semibold text-white">{info.getValue()}</span>,
      },
      {
        accessorKey: 'Team',
        header: 'Team',
        cell: (info) => <span className="text-gray-400">{info.getValue()}</span>,
      },
      {
        accessorKey: 'ERA',
        header: 'ERA',
        cell: (info) => info.getValue()?.toFixed(2),
      },
      {
        accessorKey: 'W',
        header: 'W',
      },
      {
        accessorKey: 'SV',
        header: 'SV',
      },
      {
        accessorKey: 'WHIP',
        header: 'WHIP',
        cell: (info) => info.getValue()?.toFixed(2),
      },
      {
        accessorKey: 'SO',
        header: 'SO',
      },
      {
        accessorKey: 'Value',
        header: 'Value ($)',
        cell: (info) => {
          const val = info.getValue();
          return (
            <span className={cn("font-bold", val > 0 ? "text-green-400" : "text-gray-500")}>
              ${val.toFixed(2)}
            </span>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data,
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
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-8 font-sans w-full">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-3">
              <Trophy className="w-10 h-10 text-indigo-500" />
              Fantasy Value Tracker
            </h1>
            <p className="text-neutral-400 mt-2 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Real-time valuation based on 2026 Projections ($1500 Pool)
            </p>
          </div>

          {/* Stats Cards */}
          <div className="flex gap-4">
            <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700/50 backdrop-blur-sm">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Total Pool</span>
              <div className="text-2xl font-mono text-green-400 flex items-center gap-1">
                <DollarSign className="w-5 h-5" />
                1,500
              </div>
            </div>
            <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700/50 backdrop-blur-sm">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Players</span>
              <div className="text-2xl font-mono text-blue-400 flex items-center gap-1">
                <TrendingUp className="w-5 h-5" />
                {data.length}
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-neutral-500 group-focus-within:text-blue-400 transition-colors" />
          </div>
          <input
            type="text"
            placeholder="Search players..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="block w-full pl-12 pr-4 py-4 bg-neutral-800/50 border border-neutral-700 rounded-2xl text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:outline-none transition-all shadow-lg"
          />
        </div>

        {/* Table */}
        <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/50 overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-neutral-700/50 bg-neutral-800/80">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className="p-4 text-xs font-bold text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-700/50 transition-colors select-none"
                      >
                        <div className="flex items-center gap-2">
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
                      className="border-b border-neutral-800/50 hover:bg-neutral-700/30 transition-colors group"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-4 text-sm tabular-nums text-neutral-300">
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
          <div className="p-4 border-t border-neutral-700/50 bg-neutral-800/30 text-xs text-neutral-500 flex justify-end">
            Showing {table.getRowModel().rows.length} players
          </div>
        </div>
      </div>
    </div>
  );
}

function calculateFromRawData(rawData) {
  // Filter only rows with valid stats
  const players = rawData.filter(p =>
    p.Name &&
    typeof p.ERA === 'number' &&
    typeof p.WHIP === 'number' &&
    typeof p.W === 'number' &&
    typeof p.SV === 'number' &&
    typeof p.SO === 'number'
  );

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

  // Calculate Z-Scores
  // ERA and WHIP are better when lower => invert Z-score

  const scoredPlayers = players.map(p => {
    let zSum = 0;
    // Lower is better (inverted Z)
    zSum += (means['ERA'] - p.ERA) / stds['ERA'];
    zSum += (means['WHIP'] - p.WHIP) / stds['WHIP'];

    // Higher is better (standard Z)
    zSum += (p.W - means['W']) / stds['W'];
    zSum += (p.SV - means['SV']) / stds['SV'];
    zSum += (p.SO - means['SO']) / stds['SO'];

    return { ...p, rawZ: zSum };
  });

  // Sort by raw Z-score descending to find the top players
  scoredPlayers.sort((a, b) => b.rawZ - a.rawZ);

  // Identify Replacement Level (Player 201, considering 0-index that is index 200)
  // Requirement: "only the top 200 pitchers should have a value > 0.0"
  // So the 201st pitcher (index 200) defines the 0 line.
  const replacementPlayer = scoredPlayers[200];
  const replacementLevelZ = replacementPlayer ? replacementPlayer.rawZ : scoredPlayers[scoredPlayers.length - 1].rawZ;

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
      // We calculate a dollar value for everyone relative to the pool density
      // For negative players, this effectively shows "negative dollars" relative to the scale
      dollarValue = (p.valOverReplacement / positiveSum) * 1500;
    }
    return { ...p, Value: dollarValue };
  });
}

export default App;
