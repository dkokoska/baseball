import React, { memo, useState, useEffect } from 'react';

export const StatCell = memo(({ row, stat, fixed = 0, onStatChange }) => {
    // Current Effective Value (Base + Committed + Pending)
    const effectiveValue = row.original[stat];
    if (typeof effectiveValue !== 'number') return null;

    const playerId = row.original.PlayerId;
    const statusClass = row.original[`_status_${stat}`] || 'default';

    // Local state for the input box
    const [displayValue, setDisplayValue] = useState(effectiveValue.toFixed(fixed));

    // Sync from props if external change happens (e.g. recalc, or revert)
    useEffect(() => {
        setDisplayValue(effectiveValue.toFixed(fixed));
    }, [effectiveValue, fixed]);

    const handleCommit = (e) => {
        const rawVal = e.target.value;
        const numVal = parseFloat(rawVal);

        if (isNaN(numVal)) {
            // Revert if invalid
            setDisplayValue(effectiveValue.toFixed(fixed));
            return;
        }

        // Calculate delta needed to reach this new value.
        // The `effectiveValue` ALREADY includes the current Pending Adjustment.
        // We need to apply a NEW delta relative to the *Previous Effective Value*? 
        // No, `handleStatChange` accumulates delta in App.jsx?
        // Let's check App.jsx:
        // const newDelta = Math.round((currentValue + deltaChange) * 100) / 100;
        // where `currentValue` is the EXISTING adjustment.
        // So we need to pass the DIFFERENCE between New Target and Current Effective.

        const delta = numVal - effectiveValue;

        if (delta !== 0) {
            onStatChange(playerId, stat, delta);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur(); // Triggers onBlur
        }
    };

    return (
        <div className="w-full flex justify-center px-1">
            <input
                type="text"
                value={displayValue}
                onChange={(e) => setDisplayValue(e.target.value)}
                onBlur={handleCommit}
                maxLength={8}
                className={`stat-input w-20 text-center bg-surface-200 text-white border border-transparent hover:border-surface-300 focus:border-accent focus:ring-1 focus:ring-accent rounded px-1 py-0.5 ${statusClass === 'pending' ? 'text-yellow-400 font-semibold' : ''}`}
            />
        </div>
    );
}, (prevProps, nextProps) => {
    const prevRow = prevProps.row.original;
    const nextRow = nextProps.row.original;

    return (
        prevRow[prevProps.stat] === nextRow[nextProps.stat] &&
        prevRow[`_status_${prevProps.stat}`] === nextRow[`_status_${nextProps.stat}`]
    );
});
