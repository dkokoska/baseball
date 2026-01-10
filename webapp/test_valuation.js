
import { calculateBaseValues } from './src/lib/valuation.js';

const mockPlayers = [
    { PlayerId: '1', Name: 'Ace High', Team: 'A', ERA: 3.00, WHIP: 1.00, W: 15, SV: 0, SO: 200, IP: 200 },
    { PlayerId: '2', Name: 'Ace Low', Team: 'B', ERA: 3.00, WHIP: 1.00, W: 15, SV: 0, SO: 200, IP: 50 },
    { PlayerId: '3', Name: 'Avg Joe', Team: 'C', ERA: 4.00, WHIP: 1.30, W: 10, SV: 0, SO: 100, IP: 150 }, // Assuming this is close to mean
];

// Mock basic committed adjustments
const committed = {};

const result = calculateBaseValues(mockPlayers, committed, 1500);

console.log("Valuation Constants:", JSON.stringify(result.constants, null, 2));

const aceHigh = result.players.find(p => p.Name === 'Ace High');
const aceLow = result.players.find(p => p.Name === 'Ace Low');

console.log(`Ace High ($${aceHigh.Value.toFixed(2)}) vs Ace Low ($${aceLow.Value.toFixed(2)})`);

if (aceHigh.Value > aceLow.Value) {
    console.log("SUCCESS: High IP pitcher has higher value.");
} else {
    console.log("FAILURE: High IP pitcher does NOT have higher value.");
}
