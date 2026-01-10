
import { calculateBaseValues } from './src/lib/valuation.js';

const mockData = [
    { PlayerId: '1', Name: 'Best Player', ERA: 2.00, WHIP: 0.90, W: 20, SV: 0, SO: 200, IP: 200 }, // Should be #1 z-score
    { PlayerId: '2', Name: 'Good Player', ERA: 3.50, WHIP: 1.10, W: 10, SV: 0, SO: 150, IP: 150 },
    { PlayerId: '3', Name: 'Avg Player', ERA: 4.00, WHIP: 1.30, W: 5, SV: 0, SO: 100, IP: 100 },
];

const adjustments = {};

console.log("--- Initial Calculation ---");
const initial = calculateBaseValues(mockData, adjustments, 1500, new Set());
const topPlayer = initial.players[0];
console.log("Top Player:", topPlayer.Name, "Value:", topPlayer.Value);

console.log("\n--- Excluding 'Best Player' ---");
const excluded = calculateBaseValues(mockData, adjustments, 1500, new Set(['1']));

console.log("All Players (Excluded State):");
excluded.players.forEach((p, i) => {
    console.log(`[${i}] ${p.Name} (Ex: ${p.isExcluded}): Z=${p.rawZ}, Val=${p.Value}`);
});

// Check where 'Best Player' is now
const idx = excluded.players.findIndex(p => p.PlayerId === '1');
const p1 = excluded.players[idx];

console.log("Best Player Index:", idx);
console.log("Best Player Value:", p1.Value);
console.log("Best Player Name Color (Simulated):", p1.isExcluded ? 'Blue' : 'Black');

// He should still be at or near the top (Index 0) based on Z-score, even if Value is 0.
// Wait, if he is Index 0, then the list is sorted by RawZ.
if (idx === 0) {
    console.log("SUCCESS: Excluded player retained position (Top of list).");
} else {
    console.log("FAILURE: Excluded player moved to index", idx);
}
