import React, { memo } from 'react';

export const ValueCell = memo(({ value }) => {
    const isPositive = value > 0;
    return (
        <div className="value-badge-container">
            <div className={`value-badge ${isPositive ? 'positive' : 'negative'}`}>
                ${value.toFixed(2)}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Only re-render if value changes significantly (display visible change)
    return Math.abs(prevProps.value - nextProps.value) < 0.005;
});
