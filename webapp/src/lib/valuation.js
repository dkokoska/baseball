// Modified to accept 'poolAmount' (default 1500)
// Returns { players: [], constants: {} }
export function calculateBaseValues(rawData, committedAdjustments, poolAmount = 1500) {
    if (!rawData || !rawData.length) return { players: [], constants: {} };

    // 1. Parse and augment with Committed Stats
    const distinctStats = ['ERA', 'WHIP', 'W', 'SV', 'SO'];
    const sums = { ERA: 0, WHIP: 0, W: 0, SV: 0, SO: 0 };
    const sqSums = { ERA: 0, WHIP: 0, W: 0, SV: 0, SO: 0 };
    let count = 0;

    const players = rawData
        .filter(p => p.Name && p.PlayerId)
        .map(p => {
            const pid = p.PlayerId;

            const cERAAdj = committedAdjustments[`${pid}-ERA`] || 0;
            const cWHIPAdj = committedAdjustments[`${pid}-WHIP`] || 0;
            const cWAdj = committedAdjustments[`${pid}-W`] || 0;
            const cSVAdj = committedAdjustments[`${pid}-SV`] || 0;
            const cSOAdj = committedAdjustments[`${pid}-SO`] || 0;

            // Calculate Committed Stats (_c*)
            const cERA = p.ERA + cERAAdj;
            const cWHIP = p.WHIP + cWHIPAdj;
            const cW = p.W + cWAdj;
            const cSV = p.SV + cSVAdj;
            const cSO = p.SO + cSOAdj;

            // Accumulate for stats
            sums.ERA += cERA;
            sqSums.ERA += cERA * cERA;
            sums.WHIP += cWHIP;
            sqSums.WHIP += cWHIP * cWHIP;
            sums.W += cW;
            sqSums.W += cW * cW;
            sums.SV += cSV;
            sqSums.SV += cSV * cSV;
            sums.SO += cSO;
            sqSums.SO += cSO * cSO;

            count++;

            return {
                ...p,
                _cERA: cERA,
                _cWHIP: cWHIP,
                _cW: cW,
                _cSV: cSV,
                _cSO: cSO,
            };
        });

    if (count === 0) return { players: [], constants: {} };

    // 2. Calculate Means and StdDevs
    const means = {};
    const stds = {};

    distinctStats.forEach(stat => {
        const mean = sums[stat] / count;
        const variance = (sqSums[stat] / count) - (mean * mean);

        means[stat] = mean;
        stds[stat] = Math.sqrt(variance);
    });

    // 3. Calculate Z-Scores and Sort
    const scoredPlayers = players.map(p => {
        let zSum = 0;
        zSum += stds['ERA'] ? (means['ERA'] - p._cERA) / stds['ERA'] : 0;
        zSum += stds['WHIP'] ? (means['WHIP'] - p._cWHIP) / stds['WHIP'] : 0;
        zSum += stds['W'] ? (p._cW - means['W']) / stds['W'] : 0;
        zSum += stds['SV'] ? (p._cSV - means['SV']) / stds['SV'] : 0;
        zSum += stds['SO'] ? (p._cSO - means['SO']) / stds['SO'] : 0;

        return { ...p, rawZ: zSum };
    });

    scoredPlayers.sort((a, b) => b.rawZ - a.rawZ);

    // 4. Calculate Replacement Level & Value
    const replacementIdx = Math.min(200, scoredPlayers.length - 1);
    const replacementLevelZ = scoredPlayers[replacementIdx].rawZ;

    const evaluatedPlayers = scoredPlayers.map(p => ({
        ...p,
        valOverReplacement: p.rawZ - replacementLevelZ
    }));

    const positiveSum = evaluatedPlayers
        .filter(p => p.valOverReplacement > 0)
        .reduce((sum, p) => sum + p.valOverReplacement, 0);

    const finalPlayers = evaluatedPlayers.map(p => {
        let dollarValue = 0;
        if (positiveSum > 0) {
            dollarValue = (p.valOverReplacement / positiveSum) * poolAmount;
        }
        return { ...p, Value: dollarValue };
    });

    // Return players AND constants for caching
    return {
        players: finalPlayers,
        constants: { means, stds, replacementLevelZ, positiveSum }
    };
}

export function applyDisplayAdjustments(basePlayers, pendingAdjustments, committedAdjustments, constants, poolAmount = 1500) {
    // If no constants provided (fallback), just return basePlayers but we can't do projection.
    // Actually we can just proceed with updating stats.
    const { means, stds, replacementLevelZ, positiveSum } = constants || {};

    return basePlayers.map(p => {
        const pid = p.PlayerId;

        const processStat = (statName, rawVal) => {
            const key = `${pid}-${statName}`;
            // Logic: If pending exists, use it. Else use committed.
            const isPending = pendingAdjustments.hasOwnProperty(key);
            const pendingVal = pendingAdjustments[key];
            const committedVal = committedAdjustments[key] || 0;

            const currentDelta = isPending ? pendingVal : committedVal;
            const isAdjusted = currentDelta !== 0;

            let status = "default";
            if (isPending) status = "pending";
            else if (isAdjusted) status = "changed";

            return {
                val: rawVal + currentDelta,
                status
            };
        };

        const era = processStat('ERA', p.ERA);
        const whip = processStat('WHIP', p.WHIP);
        const w = processStat('W', p.W);
        const sv = processStat('SV', p.SV);
        const so = processStat('SO', p.SO);

        // Provisional Value Calculation
        // Uses CONSTANTS from the Base Calculation (Mean/Std/PosSum).
        // This is an Approximation (Projected Value).
        let projValue = p.Value; // Start with base committed value

        if (means && stds && positiveSum) {
            let zSum = 0;
            zSum += stds['ERA'] ? (means['ERA'] - era.val) / stds['ERA'] : 0;
            zSum += stds['WHIP'] ? (means['WHIP'] - whip.val) / stds['WHIP'] : 0;
            zSum += stds['W'] ? (w.val - means['W']) / stds['W'] : 0;
            zSum += stds['SV'] ? (sv.val - means['SV']) / stds['SV'] : 0;
            zSum += stds['SO'] ? (so.val - means['SO']) / stds['SO'] : 0;

            const valOverRep = zSum - replacementLevelZ;
            // Note: positiveSum technically changes if this player moves, but we hold it constant for speed stability
            // However, if we change the poolAmount, we must re-scale.
            // The passed in p.Value was calculated with the Base Pool Amount.
            // We should recalculate fresh.

            if (valOverRep > 0) {
                projValue = (valOverRep / positiveSum) * poolAmount;
            } else {
                projValue = 0;
            }
        }

        return {
            ...p,
            ERA: era.val,
            WHIP: whip.val,
            W: w.val,
            SV: sv.val,
            SO: so.val,

            // Override Value with Projected
            Value: projValue,

            _status_ERA: era.status,
            _status_WHIP: whip.status,
            _status_W: w.status,
            _status_SV: sv.status,
            _status_SO: so.status
        };
    });
}
