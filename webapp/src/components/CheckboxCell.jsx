import React, { memo } from 'react';

export const CheckboxCell = memo(({ row, isExcluded, onToggle }) => {
    const playerId = row.original.PlayerId;

    return (
        <div className="flex items-center justify-center">
            <input
                type="checkbox"
                checked={isExcluded}
                onChange={(e) => { e.stopPropagation(); onToggle(playerId); }}
                className="w-4 h-4 text-accent bg-surface-200 border-surface-300 rounded focus:ring-accent"
            />
        </div>
    );
});
