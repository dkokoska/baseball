import { useState, useEffect, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import { Search, Trophy, Activity, Plus, Minus, Save, RefreshCw } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

const API_URL = 'http://localhost:3000/api';

function App() {
  const [rawData, setRawData] = useState([]);
  const [committedAdjustments, setCommittedAdjustments] = useState({}); // Values from DB
  const [pendingAdjustments, setPendingAdjustments] = useState({}); // Local edits
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');

  // 1. Fetch CSV and Initial Adjustments
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [csvResponse, adjResponse] = await Promise.all([
          fetch('/2026PC.csv').then((res) => res.text()),
          fetch(`${API_URL}/adjustments`).then((res) => res.json())
        ]);

        const parsed = Papa.parse(csvResponse, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });

        // Convert adjustments array to map
        const adjMap = {};
        if (adjResponse.data) {
          adjResponse.data.forEach(adj => {
            adjMap[`${adj.playerId}-${adj.stat}`] = adj.delta;
          });
        }

        setRawData(parsed.data);
        setCommittedAdjustments(adjMap);
        setLoading(false);
      } catch (error) {
        console.error("Failed to load data", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 2. Handle Stat Change (Update Pending State)
  const handleStatChange = useCallback((playerId, stat, deltaChange) => {
    const key = `${playerId}-${stat}`;

    // Get the base committed value or 0
    const committedValue = committedAdjustments[key] || 0;

    // Get current pending value, defaulting to the committed value if no pending edit exists
    const currentValue = pendingAdjustments.hasOwnProperty(key)
      ? pendingAdjustments[key]
      : committedValue;

    const newDelta = Math.round((currentValue + deltaChange) * 100) / 100;

    setPendingAdjustments(prev => ({
      ...prev,
      [key]: newDelta
    }));
  }, [committedAdjustments, pendingAdjustments]);

  // 3. Save Changes (Batch Commit)
  const saveChanges = async () => {
    setIsSaving(true);
    const updates = Object.entries(pendingAdjustments).map(([key, delta]) => {
      const [playerId, stat] = key.split('-');
      return { playerId, stat, delta };
    });

    try {
      await fetch(`${API_URL}/batch-adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      // On success, merge pending into committed and clear pending
      setCommittedAdjustments(prev => ({ ...prev, ...pendingAdjustments }));
      setPendingAdjustments({});
    } catch (err) {
      console.error("Failed to save adjustments", err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasPendingChanges = Object.keys(pendingAdjustments).length > 0;

  // 4. Calculate Data
  const processedData = useMemo(() => {
    if (loading || !rawData.length) return [];

    // Effective Adjustments for STATS display (Pending overrides Committed)
    const effectiveAdjustments = { ...committedAdjustments, ...pendingAdjustments };

    // Value Calculation uses ONLY committed adjustments (per "Recalc" requirement)
    return calculateFromRawData(rawData, committedAdjustments, effectiveAdjustments);
  }, [rawData, committedAdjustments, pendingAdjustments, loading]);

  // UI Components
  const StatCell = ({ row, stat, step = 1, fixed = 0 }) => {
    const originalValue = row.original[stat];
    if (typeof originalValue !== 'number') return null;

    const playerId = row.original.PlayerId;
    const key = `${playerId}-${stat}`;

    // Explicitly check pending first, then committed, then 0
    const currentDelta = pendingAdjustments.hasOwnProperty(key)
      ? pendingAdjustments[key]
      : (committedAdjustments[key] || 0);

    const displayValue = (originalValue + currentDelta).toFixed(fixed);
    const isPending = pendingAdjustments.hasOwnProperty(key);
    const isAdjusted = currentDelta !== 0;

    let statusClass = "default";
    if (isPending) statusClass = "pending";
    else if (isAdjusted) statusClass = "changed";

    return (
      <div className="stat-stepper">
        <button
          onClick={(e) => { e.stopPropagation(); handleStatChange(playerId, stat, -step); }}
          className="btn-step minus"
        >
          <Minus size={12} />
        </button>

        <div className="flex flex-col items-center flex-1 px-1">
          <span className={`stat-value-display ${statusClass}`}>
            {displayValue}
          </span>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); handleStatChange(playerId, stat, step); }}
          className="btn-step plus"
        >
          <Plus size={12} />
        </button>
      </div>
    );
  };

  // Re-define columns in memo (no significant change except removing className helpers if any)
  const columns = useMemo(
    () => [
      {
        id: 'place',
        header: 'Rank',
        cell: (info) => (
          <div className="rank-cell">
            {info.row.index + 1}
          </div>
        ),
      },
      {
        accessorKey: 'Name',
        header: 'Player',
        cell: (info) => (
          <div className="player-info">
            <span className="player-name">{info.getValue()}</span>
            <span className="player-team">{info.row.original.Team}</span>
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
            <div className="value-badge-container">
              <div className={`value-badge ${isPositive ? 'positive' : 'negative'}`}>
                ${val.toFixed(2)}
              </div>
            </div>
          );
        },
      },
    ],
    [committedAdjustments, pendingAdjustments]
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
    <div className="app-main isolate">
      {/* Background Image Layer */}
      <div className="app-background">
        <div className="app-overlay" />
      </div>

      <div className="app-container">
        {/* Header */}
        <div className="app-header">
          <div className="header-title-group">
            <h1>
              <Trophy className="icon-trophy" />
              Fantasy Value V10
            </h1>
            <p className="header-subtitle">
              <Activity className="icon-activity" />
              Interactive Editor • Live Rankings
            </p>
          </div>

          {/* Actions */}
          <div className="header-actions">
            <div className="stats-summary">
              <div className="stat-box">
                <div className="stat-label">Pool</div>
                <div className="stat-value text-green">$1,500</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Pending</div>
                <div className={`stat-value ${hasPendingChanges ? "text-yellow" : "text-neutral"}`}>
                  {Object.keys(pendingAdjustments).length}
                </div>
              </div>
            </div>

            <button
              onClick={saveChanges}
              disabled={!hasPendingChanges || isSaving}
              className={`btn-primary ${hasPendingChanges ? 'active' : 'disabled'}`}
            >
              {isSaving ? (
                <RefreshCw className="icon-spin" size={20} />
              ) : (
                <Save size={20} />
              )}
              {isSaving ? "Saving..." : "Recalc & Save"}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="search-container">
          <div className="search-wrapper">
            <div className="search-icon-wrapper">
              <Search className="icon-search" />
            </div>
            <input
              type="text"
              placeholder="Search players..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="table-header-row">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className="table-header th-cell"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
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
                    <td colSpan={columns.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading data...
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="table-row"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="td-cell">
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
          <div className="footer-info">
            Showing {table.getRowModel().rows.length} players
          </div>
        </div>
      </div>
    </div>
  );
}

function calculateFromRawData(rawData, committedAdjustments, effectiveAdjustments) {
  // Logic remains exactly the same as V9
  const players = rawData
    .filter(p => p.Name && p.PlayerId)
    .map(p => {
      const pid = p.PlayerId;
      return {
        ...p,
        ERA: p.ERA + (effectiveAdjustments[`${pid}-ERA`] || 0),
        WHIP: p.WHIP + (effectiveAdjustments[`${pid}-WHIP`] || 0),
        W: p.W + (effectiveAdjustments[`${pid}-W`] || 0),
        SV: p.SV + (effectiveAdjustments[`${pid}-SV`] || 0),
        SO: p.SO + (effectiveAdjustments[`${pid}-SO`] || 0),

        _cERA: p.ERA + (committedAdjustments[`${pid}-ERA`] || 0),
        _cWHIP: p.WHIP + (committedAdjustments[`${pid}-WHIP`] || 0),
        _cW: p.W + (committedAdjustments[`${pid}-W`] || 0),
        _cSV: p.SV + (committedAdjustments[`${pid}-SV`] || 0),
        _cSO: p.SO + (committedAdjustments[`${pid}-SO`] || 0),
      };
    });

  const stats = ['_cERA', '_cWHIP', '_cW', '_cSV', '_cSO'];
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
    zSum += stds['_cERA'] ? (means['_cERA'] - p._cERA) / stds['_cERA'] : 0;
    zSum += stds['_cWHIP'] ? (means['_cWHIP'] - p._cWHIP) / stds['_cWHIP'] : 0;
    zSum += stds['_cW'] ? (p._cW - means['_cW']) / stds['_cW'] : 0;
    zSum += stds['_cSV'] ? (p._cSV - means['_cSV']) / stds['_cSV'] : 0;
    zSum += stds['_cSO'] ? (p._cSO - means['_cSO']) / stds['_cSO'] : 0;

    return { ...p, rawZ: zSum };
  });

  scoredPlayers.sort((a, b) => b.rawZ - a.rawZ);

  const replacementIdx = Math.min(200, scoredPlayers.length - 1);
  const replacementLevelZ = scoredPlayers[replacementIdx].rawZ;

  const evaluatedPlayers = scoredPlayers.map(p => ({
    ...p,
    valOverReplacement: p.rawZ - replacementLevelZ
  }));

  const positiveSum = evaluatedPlayers
    .filter(p => p.valOverReplacement > 0)
    .reduce((sum, p) => sum + p.valOverReplacement, 0);

  return evaluatedPlayers.map(p => {
    let dollarValue = 0;
    if (positiveSum > 0) {
      dollarValue = (p.valOverReplacement / positiveSum) * 1500;
    }
    return { ...p, Value: dollarValue };
  });
}

export default App;
