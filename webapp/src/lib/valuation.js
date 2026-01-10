// Modified to accept 'poolAmount' (default 1500)
// Returns { players: [], constants: {} }
export function calculateBaseValues(rawData, committedAdjustments, poolAmount = 1500) {
    if (!rawData || !rawData.length) return { players: [], constants: {} };

    // 1. Parse and augment with Committed Stats
    const distinctStats = ['ERA', 'WHIP', 'W', 'SV', 'SO'];
    const sums = { ERA: 0, WHIP: 0, W: 0, SV: 0, SO: 0 };
    const sqSums = { ERA: 0, WHIP: 0, W: 0, SV: 0, SO: 0 };
    let count = 0;

    // First pass: Calculate committed stats and raw sums (mainly to get averages for rate stats)
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
            // We use safe arithmetic to avoid float issues later, though JS numbers are floats.
            const cERA = p.ERA + cERAAdj;
            const cWHIP = p.WHIP + cWHIPAdj;
            const cW = p.W + cWAdj;
            const cSV = p.SV + cSVAdj;
            const cSO = p.SO + cSOAdj;
            const IP = p.IP || 0; // Ensure IP exists

            // Accumulate for stats
            sums.ERA += cERA;
            sums.WHIP += cWHIP;
            sums.W += cW;
            sums.SV += cSV;
            sums.SO += cSO;

            count++;

            return {
                ...p,
                IP: IP,
                _cERA: cERA,
                _cWHIP: cWHIP,
                _cW: cW,
                _cSV: cSV,
                _cSO: cSO,
            };
        });

    if (count === 0) return { players: [], constants: {} };

    // 2. Calculate Means (Base Levels for comparison)
    const means = {};
    distinctStats.forEach(stat => {
        means[stat] = sums[stat] / count;
    });

    // 3. Comparison Logic (Weighted for Rates)
    // For W, SV, SO: Simple Z-score of the raw value.
    // For ERA, WHIP: "Runs Saved" and "WH Saved" weighted by IP.

    // We need to calculate the standard deviation of these *derived* values (or raw values for counting stats).
    // Let's do a second pass to calculate the values we will Z-score, and their variance.

    // Intermediate array to hold the values to score
    const intermediate = players.map(p => {
        // Impact values (Higher is better)

        // ERA Impact: (AvgERA - PlayerERA) * (IP / 9)  => Runs prevented vs average pitcher in that many innings
        const diffERA = (means['ERA'] - p._cERA);
        const valERA = diffERA * (p.IP / 9);

        // WHIP Impact: (AvgWHIP - PlayerWHIP) * IP => Walks/Hits prevented vs average pitcher
        const diffWHIP = (means['WHIP'] - p._cWHIP);
        const valWHIP = diffWHIP * p.IP;

        return {
            ...p,
            _vERA: valERA,
            _vWHIP: valWHIP,
            _vW: p._cW,
            _vSV: p._cSV,
            _vSO: p._cSO
        };
    });

    // Calculate Standard Deviations for these 5 value metrics
    const iSums = { _vERA: 0, _vWHIP: 0, _vW: 0, _vSV: 0, _vSO: 0 };
    const iSqSums = { _vERA: 0, _vWHIP: 0, _vW: 0, _vSV: 0, _vSO: 0 };

    intermediate.forEach(p => {
        ['_vERA', '_vWHIP', '_vW', '_vSV', '_vSO'].forEach(k => {
            const val = p[k];
            iSums[k] += val;
            iSqSums[k] += val * val;
        });
    });

    const iMeans = {};
    const iStds = {};

    ['_vERA', '_vWHIP', '_vW', '_vSV', '_vSO'].forEach(k => {
        const mean = iSums[k] / count;
        const variance = (iSqSums[k] / count) - (mean * mean);
        iMeans[k] = mean;
        iStds[k] = Math.sqrt(variance);
    });

    // 4. Calculate Final Z-Scores
    const scoredPlayers = intermediate.map(p => {
        let zSum = 0;
        // For all these derived metrics, HIGHER is BETTER.
        // Even for ERA/WHIP, we converted to "Runs Saved", where positive is good.
        zSum += iStds['_vERA'] ? (p._vERA - iMeans['_vERA']) / iStds['_vERA'] : 0;
        zSum += iStds['_vWHIP'] ? (p._vWHIP - iMeans['_vWHIP']) / iStds['_vWHIP'] : 0;
        zSum += iStds['_vW'] ? (p._vW - iMeans['_vW']) / iStds['_vW'] : 0;
        zSum += iStds['_vSV'] ? (p._vSV - iMeans['_vSV']) / iStds['_vSV'] : 0;
        zSum += iStds['_vSO'] ? (p._vSO - iMeans['_vSO']) / iStds['_vSO'] : 0;

        return { ...p, rawZ: zSum };
    });

    scoredPlayers.sort((a, b) => b.rawZ - a.rawZ);

    // 5. Calculate Replacement Level & Value
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

    // Return players AND constants needed for dynamic updates
    // We need the original Rate Means (to calculate impact) AND the Value Means/Stds (to calculate Z)
    return {
        players: finalPlayers,
        constants: {
            rateMeans: { ERA: means.ERA, WHIP: means.WHIP },
            valMeans: iMeans,
            valStds: iStds,
            replacementLevelZ,
            positiveSum
        }
    };
}

export function applyDisplayAdjustments(basePlayers, pendingAdjustments, committedAdjustments, constants, poolAmount = 1500) {
    if (!constants) return basePlayers;

    const { rateMeans, valMeans, valStds, replacementLevelZ, positiveSum } = constants;

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
        let projValue = p.Value; // Fallback

        if (rateMeans && valMeans && valStds && positiveSum) {
            // Calculate Impact Values using STATIC BASE MEANS (approximation)
            // Ideally if many players change, the means change, but for single-player edits we assume pool stability.
            const vERA = (rateMeans.ERA - era.val) * (p.IP / 9);
            const vWHIP = (rateMeans.WHIP - whip.val) * p.IP;
            const vW = w.val;
            const vSV = sv.val;
            const vSO = so.val;

            let zSum = 0;
            zSum += valStds['_vERA'] ? (vERA - valMeans['_vERA']) / valStds['_vERA'] : 0;
            zSum += valStds['_vWHIP'] ? (vWHIP - valMeans['_vWHIP']) / valStds['_vWHIP'] : 0;
            zSum += valStds['_vW'] ? (vW - valMeans['_vW']) / valStds['_vW'] : 0;
            zSum += valStds['_vSV'] ? (vSV - valMeans['_vSV']) / valStds['_vSV'] : 0;
            zSum += valStds['_vSO'] ? (vSO - valMeans['_vSO']) / valStds['_vSO'] : 0;

            const valOverRep = zSum - replacementLevelZ;

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
