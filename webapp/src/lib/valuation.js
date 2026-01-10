// Modified to accept 'poolAmount' (default 1500) and 'excludedPlayerIds'
// Returns { players: [], constants: {} }
export function calculateBaseValues(rawData, committedAdjustments, poolAmount = 1500, excludedPlayerIds = new Set()) {
    if (!rawData || !rawData.length) return { players: [], constants: {} };

    // 1. Parse and augment with Committed Stats
    const distinctStats = ['ERA', 'WHIP', 'W', 'SV', 'SO'];
    const sums = { ERA: 0, WHIP: 0, W: 0, SV: 0, SO: 0 };
    // const sqSums = { ERA: 0, WHIP: 0, W: 0, SV: 0, SO: 0 }; // Not needed for first pass means? Actually we never used sqSums for base means.
    let count = 0;

    // First pass: Calculate committed stats and prepare objects
    // We also mark "isExcluded" here.
    const allPlayers = rawData
        .filter(p => p.Name && p.PlayerId)
        .map(p => {
            const pid = p.PlayerId;
            const isExcluded = excludedPlayerIds.has(pid);

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
            const IP = p.IP || 0;

            return {
                ...p,
                IP: IP,
                isExcluded, // New flag
                _cERA: cERA,
                _cWHIP: cWHIP,
                _cW: cW,
                _cSV: cSV,
                _cSO: cSO,
            };
        });

    if (allPlayers.length === 0) return { players: [], constants: {} };

    // Filter Active Players for Stat Calculation
    const activePlayers = allPlayers.filter(p => !p.isExcluded);

    // If no active players, just return everything zeroed out (or standard behavior)
    // But we might still want to see the list.
    if (activePlayers.length === 0) {
        // Just return all players with 0 value
        const finalPlayers = allPlayers.map(p => ({ ...p, Value: 0 }));
        return { players: finalPlayers, constants: null };
    }

    // Calculate Means on ACTIVE players only
    activePlayers.forEach(p => {
        sums.ERA += p._cERA;
        sums.WHIP += p._cWHIP;
        sums.W += p._cW;
        sums.SV += p._cSV;
        sums.SO += p._cSO;
        count++;
    });

    // 2. Calculate Means (Base Levels for comparison)
    const means = {};
    distinctStats.forEach(stat => {
        means[stat] = sums[stat] / count;
    });

    // 3. Comparison Logic (Weighted for Rates)
    // We calculate "Value Metrics" (_v*) for ACTIVE players to establish the scale (StdDev).

    const intermediateActive = activePlayers.map(p => {
        // Impact values (Higher is better)
        const diffERA = (means['ERA'] - p._cERA);
        const valERA = diffERA * (p.IP / 9);

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

    // Calculate Standard Deviations for these 5 value metrics (on ACTIVE players)
    const iSums = { _vERA: 0, _vWHIP: 0, _vW: 0, _vSV: 0, _vSO: 0 };
    const iSqSums = { _vERA: 0, _vWHIP: 0, _vW: 0, _vSV: 0, _vSO: 0 };

    intermediateActive.forEach(p => {
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

    // 4. Calculate Final Z-Scores for ACTIVE players
    const scoredActive = intermediateActive.map(p => {
        let zSum = 0;
        zSum += iStds['_vERA'] ? (p._vERA - iMeans['_vERA']) / iStds['_vERA'] : 0;
        zSum += iStds['_vWHIP'] ? (p._vWHIP - iMeans['_vWHIP']) / iStds['_vWHIP'] : 0;
        zSum += iStds['_vW'] ? (p._vW - iMeans['_vW']) / iStds['_vW'] : 0;
        zSum += iStds['_vSV'] ? (p._vSV - iMeans['_vSV']) / iStds['_vSV'] : 0;
        zSum += iStds['_vSO'] ? (p._vSO - iMeans['_vSO']) / iStds['_vSO'] : 0;

        return { ...p, rawZ: zSum };
    });

    // 4b. Calculate Shadow Z-Scores for EXCLUDED players (so they stay in list relative to performance)
    const excludedPlayers = allPlayers.filter(p => p.isExcluded);

    // We need to calculate their _v* stats using the SAME MEANS as active players
    const scoredExcluded = excludedPlayers.map(p => {
        // Impact values 
        const diffERA = (means['ERA'] - p._cERA);
        const valERA = diffERA * (p.IP / 9);

        const diffWHIP = (means['WHIP'] - p._cWHIP);
        const valWHIP = diffWHIP * p.IP;

        // Value metrics
        const vERA = valERA;
        const vWHIP = valWHIP;
        const vW = p._cW;
        const vSV = p._cSV;
        const vSO = p._cSO;

        let zSum = 0;
        zSum += iStds['_vERA'] ? (vERA - iMeans['_vERA']) / iStds['_vERA'] : 0;
        zSum += iStds['_vWHIP'] ? (vWHIP - iMeans['_vWHIP']) / iStds['_vWHIP'] : 0;
        zSum += iStds['_vW'] ? (vW - iMeans['_vW']) / iStds['_vW'] : 0;
        zSum += iStds['_vSV'] ? (vSV - iMeans['_vSV']) / iStds['_vSV'] : 0;
        zSum += iStds['_vSO'] ? (vSO - iMeans['_vSO']) / iStds['_vSO'] : 0;

        return {
            ...p,
            _vERA: vERA, _vWHIP: vWHIP, _vW: vW, _vSV: vSV, _vSO: vSO,
            rawZ: zSum
        };
    });

    // Combine for Sorting
    const allScored = [...scoredActive, ...scoredExcluded];
    allScored.sort((a, b) => b.rawZ - a.rawZ);

    // 5. Calculate Replacement Level & Value (ACTIVE ONLY)
    // We must only use ACTIVE players to determine the replacement level and pool distribution
    // But we need the index of replacement level from the SORTED list of ACTIVE players only.

    // Let's re-extract active sorted to find replacement level
    // (This ensures excluded players don't push the replacement level down/up artificially)
    const sortedActiveOnly = allScored.filter(p => !p.isExcluded);

    const replacementIdx = Math.min(200, sortedActiveOnly.length - 1);
    const replacementLevelZ = sortedActiveOnly[replacementIdx] ? sortedActiveOnly[replacementIdx].rawZ : -999;

    const evaluatedPlayers = allScored.map(p => ({
        ...p,
        valOverReplacement: p.rawZ - replacementLevelZ
    }));

    const positiveSum = evaluatedPlayers
        .filter(p => !p.isExcluded && p.valOverReplacement > 0)
        .reduce((sum, p) => sum + p.valOverReplacement, 0);

    const finalPlayers = evaluatedPlayers.map(p => {
        let dollarValue = 0;
        if (!p.isExcluded && p.valOverReplacement > 0 && positiveSum > 0) {
            dollarValue = (p.valOverReplacement / positiveSum) * poolAmount;
        }
        // Excluded players get 0 value, but keep their calculated valOverReplacement/Z for sorting context logic if needed?
        // Actually, mapped Value is what matters for display.
        if (p.isExcluded) dollarValue = 0;

        return { ...p, Value: dollarValue };
    });

    // We don't need step 6 logic anymore since we merged them earlier.

    // Return players AND constants needed for dynamic updates
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
        // If excluded, force Value to 0 and skip math
        if (p.isExcluded) {
            return { ...p, Value: 0 };
        }

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
