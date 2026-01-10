import React, { memo, useState, useEffect } from 'react';
import { Plus, Minus } from 'lucide-react';

export const StatCell = memo(({ row, stat, step = 1, fixed = 0, onStatChange }) => {
    const originalValue = row.original[stat]; // Upstream value (Effective = Raw + Committed + Pending)
    if (typeof originalValue !== 'number') return null;

    const playerId = row.original.PlayerId;
    const statusClass = row.original[`_status_${stat}`] || 'default';

    // Optimistic State
    // We initialize with upstream.
    const [displayValue, setDisplayValue] = useState(originalValue);

    // Track if we are in "optimistic mode" - i.e. user queried a change that hasn't reflected upstream yet.
    // Actually, simpler: Always show local state. Sync local state to upstream when upstream changes (and isn't stale).

    // To detect if upstream changed due to external factors (or our own commit loop),
    // we need to compare it.
    useEffect(() => {
        setDisplayValue(originalValue);
    }, [originalValue]);

    // Handler
    const handleClick = (delta) => {
        // 1. Instant Update
        const newValue = displayValue + delta;
        setDisplayValue(newValue);

        // 2. Propagate (this will eventually come back as new originalValue)
        onStatChange(playerId, stat, delta);
    };

    // Format for display
    const formattedValue = typeof displayValue === 'number' ? displayValue.toFixed(fixed) : '';

    return (
        <div className="stat-stepper">
            <button
                onClick={(e) => { e.stopPropagation(); handleClick(-step); }}
                className="btn-step minus"
            >
                <Minus size={12} />
            </button>

            <div className="flex flex-col items-center flex-1 px-1">
                <span className={`stat-value-display ${statusClass}`}>
                    {formattedValue}
                </span>
            </div>

            <button
                onClick={(e) => { e.stopPropagation(); handleClick(step); }}
                className="btn-step plus"
            >
                <Plus size={12} />
            </button>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison function for React.memo
    // We only re-render if:
    // 1. The value changed
    // 2. The status changed
    // 3. The row changed (this usually implies 1/2 but explicit check is safer)

    // row.original is a new object every time processedData updates (which is every click).
    // So simple shallow compare of props will ALWAYS return false (re-render).
    // However, if we look at the specific stat values:
    const prevRow = prevProps.row.original;
    const nextRow = nextProps.row.original;

    return (
        prevRow[prevProps.stat] === nextRow[nextProps.stat] &&
        prevRow[`_status_${prevProps.stat}`] === nextRow[`_status_${nextProps.stat}`]
    );
});
