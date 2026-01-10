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
import { StatCell } from './components/StatCell';
import { ValueCell } from './components/ValueCell';
import { CheckboxCell } from './components/CheckboxCell';
import { calculateBaseValues, applyDisplayAdjustments } from './lib/valuation';

const API_URL = 'http://localhost:3000/api';

function App() {
  const [rawData, setRawData] = useState([]);
  const [committedAdjustments, setCommittedAdjustments] = useState({}); // Values from DB
  const [pendingAdjustments, setPendingAdjustments] = useState({}); // Local edits
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [poolAmount, setPoolAmount] = useState(1500);
  const [valuationConstants, setValuationConstants] = useState(null);
  const [excludedPlayerIds, setExcludedPlayerIds] = useState(new Set());

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

      // Also save values
      // We need to calculate the values based on CURRENT state (merged).
      // processedData is the latest view, so let's use that.
      if (processedData.length > 0) {
        // processedData contains ALL players. If we only want to save those with values...
        // Assuming we save ALL values as they are essentially a snapshot of the valuation model.
        const valuesToSave = processedData.map(p => ({
          playerId: p.PlayerId,
          value: p.Value
        }));

        await fetch(`${API_URL}/values`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(valuesToSave)
        });
      }

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

  // 5. Toggle Exclusion
  const toggleExclusion = useCallback((playerId) => {
    setExcludedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }, []);

  // 6. Calculate Data
  // Heavy calculation: only runs when rawData or committedAdjustments change (not on pending edits)
  const baseData = useMemo(() => {
    if (loading || !rawData.length) return [];

    // Filter out excluded players BEFORE base calculation
    const activePlayers = rawData.filter(p => !excludedPlayerIds.has(p.PlayerId));

    const { players, constants } = calculateBaseValues(activePlayers, committedAdjustments, poolAmount);
    return { players, constants };
  }, [rawData, committedAdjustments, loading, poolAmount, excludedPlayerIds]);

  // Light calculation: runs on every pending edit to update display values
  const processedData = useMemo(() => {
    if (!baseData || !baseData.players) return [];

    // We use the constants derived from the *Base* state to project the new values instantly
    return applyDisplayAdjustments(baseData.players, pendingAdjustments, committedAdjustments, baseData.constants, poolAmount);
  }, [baseData, pendingAdjustments, committedAdjustments, poolAmount]);

  // UI Components
  // (Moved to external files)


  // Re-define columns in memo (no significant change except removing className helpers if any)
  const columns = useMemo(
    () => [
      {
        id: 'exclude',
        header: 'Ex',
        cell: (info) => (
          <CheckboxCell
            row={info.row}
            isExcluded={false} // Since we filter them out of data, they are by definition NOT excluded in the list .. wait.
            // If we filter them out, they don't appear in the table.
            // The user said: "if the user clicks on the check box for Paul Skenes, then he will be removed from the list."
            // So yes, clicking it removes them.
            // But then how do you bring them back? 
            // "This is display only".
            // Usually "Exclude" implies they stay in list but are greyed out or value is 0.
            // BUT user said "removed from the list".
            // So I guess they are gone. To bring them back, user probably needs a "Show Hidden" toggle or refresh.
            // I will implement "Remove from list" behavior as requested.
            onToggle={toggleExclusion}
          />
        ),
      },
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
        cell: (info) => <StatCell row={info.row} stat="ERA" step={0.05} fixed={2} onStatChange={handleStatChange} />,
      },
      {
        accessorKey: 'WHIP',
        header: 'WHIP',
        cell: (info) => <StatCell row={info.row} stat="WHIP" step={0.01} fixed={2} onStatChange={handleStatChange} />,
      },
      {
        accessorKey: 'W',
        header: 'W',
        cell: (info) => <StatCell row={info.row} stat="W" step={1} fixed={0} onStatChange={handleStatChange} />,
      },
      {
        accessorKey: 'SV',
        header: 'SV',
        cell: (info) => <StatCell row={info.row} stat="SV" step={1} fixed={0} onStatChange={handleStatChange} />,
      },
      {
        accessorKey: 'SO',
        header: 'SO',
        cell: (info) => <StatCell row={info.row} stat="SO" step={5} fixed={0} onStatChange={handleStatChange} />,
      },
      {
        accessorKey: 'Value',
        header: 'Value',
        cell: (info) => <ValueCell value={info.getValue()} />,
      },
    ],
    // Dependencies: handleStatChange is stable. toggleExclusion is stable.
    [handleStatChange, toggleExclusion]
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
              Koko's Pitcher Prognosticator
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
                <div className="stat-value text-green">
                  <div className="flex items-center gap-1">
                    $
                    <input
                      type="number"
                      className="bg-transparent text-green border-none focus:ring-0 p-0 w-16 text-right font-bold"
                      value={poolAmount}
                      onChange={(e) => setPoolAmount(Number(e.target.value))}
                    />
                  </div>
                </div>
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
            Showing {table.getRowModel().rows.length} players • Version 10
          </div>
        </div>
      </div>
    </div>
  );
}



export default App;
