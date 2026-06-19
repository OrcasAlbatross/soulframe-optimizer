/**
 * Soulframe Math Engine (High-Performance Procedural Version)
 * Standalone calculation formulas for equipment scaling optimized to eliminate closure overhead.
 */

// Global constant for Joineries to prevent code duplication
const GLOBAL_JOINERIES = [
    { name: "Blessed by Mora", virtue: "courage", tier: 1 },
    { name: "Twice Blessed by Mora", virtue: "courage", tier: 2 },
    { name: "Thrice Blessed by Mora", virtue: "courage", tier: 3 },
    { name: "Blessed by Sapehene", virtue: "grace", tier: 1 },
    { name: "Twice Blessed by Sapehene", virtue: "grace", tier: 2 },
    { name: "Thrice Blessed by Sapehene", virtue: "grace", tier: 3 },
    { name: "Blessed by Iridis", virtue: "spirit", tier: 1 },
    { name: "Twice Blessed by Iridis", virtue: "spirit", tier: 2 },
    { name: "Thrice Blessed by Iridis", virtue: "spirit", tier: 3 }
];

function getJoineryList(joineryEnabled) {
    return [
        { name: "None", virtue: null, tier: 0 },
        ...(joineryEnabled ? GLOBAL_JOINERIES : [])
    ];
}

/**
 * Helper to check if the Envoy meets all virtue requirements for a piece of gear.
 */
function checkRequirements(requirements, envoyStats) {
    return (
        envoyStats.courage >= (requirements.courage || 0) &&
        envoyStats.spirit >= (requirements.spirit || 0) &&
        envoyStats.grace >= (requirements.grace || 0)
    );
}

/**
 * Calculates the absolute maximum damage a weapon can ever reach, 
 * utilizing its explicit cap or the 1.5x Base Attack rule.
 */
function getWeaponMaxPossibleDamage(weapon, useMaxLevel = true) {
    const baseDamage = useMaxLevel ? weapon.maxAttack : weapon.baseAttack;
    if (weapon.damageCap && weapon.damageCap > 0) {
        return weapon.damageCap;
    }
    return baseDamage + (weapon.baseAttack * 1.5);
}

/**
 * Flat armor calculator. 
 * Avoids .forEach and object allocations to prevent Garbage Collection freezes.
 */
function calculateArmorStats(armorPiece, envoyStats) {
    const base = armorPiece.baseStats;
    const reqs = armorPiece.requirements;

    // Inline requirement check (avoiding function call overhead)
    if (envoyStats.courage < (reqs.courage || 0) || 
        envoyStats.spirit < (reqs.spirit || 0) || 
        envoyStats.grace < (reqs.grace || 0)) {
        return {
            physical: base.physical,
            magick: base.magick,
            stability: base.stability,
            total: base.physical + base.magick + base.stability,
            requirementsMet: false
        };
    }

    const c = envoyStats.courage;
    const s = envoyStats.spirit;
    const g = envoyStats.grace;

    // Physical
    const physPips = armorPiece.attunement.physical;
    const physBonus = Math.floor(
        c * (physPips.courage || 0) * 0.12 +
        s * (physPips.spirit || 0) * 0.12 +
        g * (physPips.grace || 0) * 0.12
    );

    // Magick
    const magPips = armorPiece.attunement.magick;
    const magBonus = Math.floor(
        c * (magPips.courage || 0) * 0.12 +
        s * (magPips.spirit || 0) * 0.12 +
        g * (magPips.grace || 0) * 0.12
    );

    // Stability
    const stabPips = armorPiece.attunement.stability;
    const stabBonus = Math.floor(
        c * (stabPips.courage || 0) * 0.12 +
        s * (stabPips.spirit || 0) * 0.12 +
        g * (stabPips.grace || 0) * 0.12
    );

    const physical = base.physical + physBonus;
    const magick = base.magick + magBonus;
    const stability = base.stability + stabBonus;

    return {
        physical,
        magick,
        stability,
        total: physical + magick + stability,
        requirementsMet: true
    };
}

/**
 * Calculates the scaled damage of a weapon.
 */
function calculateWeaponStats(weapon, envoyStats, joinery = null, useMaxLevel = true) {
    const baseDamage = useMaxLevel ? weapon.maxAttack : weapon.baseAttack;
    const requirementsMet = checkRequirements(weapon.requirements, envoyStats);

    if (!requirementsMet) {
        return {
            baseDamage: baseDamage,
            bonusDamage: 0,
            finalDamage: baseDamage,
            requirementsMet: false
        };
    }

    const pips = {
        courage: weapon.attunement.courage || 0,
        spirit: weapon.attunement.spirit || 0,
        grace: weapon.attunement.grace || 0
    };

    if (joinery && joinery.enabled) {
        if (joinery.virtue === "courage") pips.courage += joinery.tier;
        else if (joinery.virtue === "spirit") pips.spirit += joinery.tier;
        else if (joinery.virtue === "grace") pips.grace += joinery.tier;
    }

    pips.courage = Math.min(5, pips.courage);
    pips.spirit = Math.min(5, pips.spirit);
    pips.grace = Math.min(5, pips.grace);

    let bonusDamage = 
        envoyStats.courage * (pips.courage / 2) +
        envoyStats.spirit * (pips.spirit / 2) +
        envoyStats.grace * (pips.grace / 2);

    let finalDamage = baseDamage + bonusDamage;
    const effectiveCap = getWeaponMaxPossibleDamage(weapon, useMaxLevel);

    if (finalDamage > effectiveCap) {
        finalDamage = effectiveCap;
        bonusDamage = effectiveCap - baseDamage;
    }

    return {
        baseDamage: baseDamage,
        bonusDamage: Number(bonusDamage.toFixed(1)),
        finalDamage: Number(finalDamage.toFixed(1)),
        requirementsMet: true
    };
}

/**
 * Optimized paired weapon finder. Avoids closure allocations.
 */
function getBestWeaponForSlot(slot, envoyStats, allowedWeapons, joineryEnabled) {
    const joineriesToTest = getJoineryList(joineryEnabled);
    let bestWeaponConfig = null;
    let maxDamage = -1;

    const filtered = allowedWeapons.filter(w => w.slot === slot);

    for (let i = 0; i < filtered.length; i++) {
        const weapon = filtered[i];
        let weaponMax = -1;

        for (let j = 0; j < joineriesToTest.length; j++) {
            const joinery = joineriesToTest[j];
            const jState = joinery.tier === 0 ? null : { enabled: true, virtue: joinery.virtue, tier: joinery.tier };
            const calc = calculateWeaponStats(weapon, envoyStats, jState);
            if (calc.finalDamage > weaponMax) {
                weaponMax = calc.finalDamage;
            }
        }

        for (let j = 0; j < joineriesToTest.length; j++) {
            const joinery = joineriesToTest[j];
            const jState = joinery.tier === 0 ? null : { enabled: true, virtue: joinery.virtue, tier: joinery.tier };
            const calc = calculateWeaponStats(weapon, envoyStats, jState);
            if (calc.finalDamage === weaponMax) {
                const isBetter = weaponMax > maxDamage || 
                                 (weaponMax === maxDamage && joinery.tier < (bestWeaponConfig ? bestWeaponConfig.joineryTier : 999));
                if (isBetter) {
                    maxDamage = weaponMax;
                    bestWeaponConfig = {
                        weapon,
                        displayName: joinery.tier > 0 ? `${weapon.name}: ${joinery.name}` : weapon.name,
                        calculated: calc,
                        joineryTier: joinery.tier
                    };
                }
                break;
            }
        }
    }

    return bestWeaponConfig;
}

/**
 * Core Solver for the Stat Maxer
 */
function solveStatMaxer(totalPoints, minReqs, targetObjective, weapon, allowedTalismans, allowedArmor, skews, joineryEnabled) {
    let bestConfig = null;
    let bestObjectiveValue = -1;
    let bestTiebreakerArmorDef = -1;

    const joineriesToTest = getJoineryList(joineryEnabled);
    const requiredDamageCap = getWeaponMaxPossibleDamage(weapon);

    // Fast inline armor solver to prevent array allocations inside loop
    const findBestArmorForSlot = (slot, stats) => {
        let bestPiece = null;
        let maxWeighted = -1;

        const filtered = allowedArmor.filter(p => p.slot === slot);
        for (let i = 0; i < filtered.length; i++) {
            const piece = filtered[i];
            const calculated = calculateArmorStats(piece, stats);
            
            // Attach weighted total cleanly
            const weighted = (calculated.physical * skews.physical) + 
                             (calculated.magick * skews.magick) + 
                             (calculated.stability * skews.stability);
            
            // Attach to the calculated object for the UI renderer
            calculated.weightedTotal = Math.round(weighted * 10) / 10;

            if (weighted > maxWeighted) {
                maxWeighted = weighted;
                bestPiece = { piece, calculated, weightedTotal: calculated.weightedTotal };
            }
        }
        return bestPiece;
    };

    // PRUNING OPTIMIZATION: Determine the maximum stats any talisman can provide
    let maxTalismanC = 0, maxTalismanS = 0, maxTalismanG = 0;
    for (let i = 0; i < allowedTalismans.length; i++) {
        const t = allowedTalismans[i];
        if (t.stats.courage > maxTalismanC) maxTalismanC = t.stats.courage;
        if (t.stats.spirit > maxTalismanS) maxTalismanS = t.stats.spirit;
        if (t.stats.grace > maxTalismanG) maxTalismanG = t.stats.grace;
    }

    // PRUNING OPTIMIZATION: Start loops at the lowest mathematically possible spends
    const minCAlloc = Math.max(0, Math.max(minReqs.courage, weapon.requirements.courage || 0) - maxTalismanC);
    const minSAlloc = Math.max(0, Math.max(minReqs.spirit, weapon.requirements.spirit || 0) - maxTalismanS);
    const minGAlloc = Math.max(0, Math.max(minReqs.grace, weapon.requirements.grace || 0) - maxTalismanG);

    if (minCAlloc + minSAlloc + minGAlloc > totalPoints) {
        return null; // Stat configuration impossible to satisfy
    }

    // Main allocation search loops (standard for-loops, NO closures)
    for (let allocC = minCAlloc; allocC <= totalPoints; allocC++) {
        const remainingForSAndG = totalPoints - allocC;
        if (remainingForSAndG < minSAlloc + minGAlloc) continue;

        for (let allocS = minSAlloc; allocS <= remainingForSAndG; allocS++) {
            const allocG = remainingForSAndG - allocS;
            if (allocG < minGAlloc) continue;

            const allocation = { courage: allocC, spirit: allocS, grace: allocG };

            // Evaluate allowed Talismans
            for (let tIdx = 0; i = 0, tIdx < allowedTalismans.length; tIdx++) {
                const talisman = allowedTalismans[tIdx];
                const totalStats = {
                    courage: allocation.courage + talisman.stats.courage,
                    spirit: allocation.spirit + talisman.stats.spirit,
                    grace: allocation.grace + talisman.stats.grace
                };

                // Inline fast-validation check
                if (totalStats.courage < minReqs.courage || 
                    totalStats.spirit < minReqs.spirit || 
                    totalStats.grace < minReqs.grace) {
                    continue; 
                }

                if (totalStats.courage < (weapon.requirements.courage || 0) || 
                    totalStats.spirit < (weapon.requirements.spirit || 0) || 
                    totalStats.grace < (weapon.requirements.grace || 0)) {
                    continue;
                }

                // Inline fast-damage calculation to skip object instantiations
                let maxDamageFound = -1;
                let optimalJoinery = null;

                for (let jIdx = 0; jIdx < joineriesToTest.length; jIdx++) {
                    const j = joineriesToTest[jIdx];
                    const jState = j.tier === 0 ? null : { enabled: true, virtue: j.virtue, tier: j.tier };
                    const calc = calculateWeaponStats(weapon, totalStats, jState);
                    if (calc.finalDamage > maxDamageFound) {
                        maxDamageFound = calc.finalDamage;
                        optimalJoinery = { name: j.name, calc, tier: j.tier };
                    }
                }

                // Strict cap constraint
                if (maxDamageFound < requiredDamageCap) {
                    continue;
                }

                for (let jIdx = 0; jIdx < joineriesToTest.length; jIdx++) {
                    const j = joineriesToTest[jIdx];
                    const jState = j.tier === 0 ? null : { enabled: true, virtue: j.virtue, tier: j.tier };
                    const calc = calculateWeaponStats(weapon, totalStats, jState);
                    if (calc.finalDamage === maxDamageFound) {
                        optimalJoinery = { name: j.name, calc, tier: j.tier };
                        break;
                    }
                }

                // Evaluate Armor Score
                let bestHelm = null, bestCuirass = null, bestLeggings = null;
                let armorScore = 0;

                if (targetObjective === 'armor') {
                    bestHelm = findBestArmorForSlot("Helm", totalStats);
                    bestCuirass = findBestArmorForSlot("Cuirass", totalStats);
                    bestLeggings = findBestArmorForSlot("Leggings", totalStats);
                    if (bestHelm && bestCuirass && bestLeggings) {
                        armorScore = bestHelm.weightedTotal + bestCuirass.weightedTotal + bestLeggings.weightedTotal;
                    }
                }

                // Compute primary objective score
                let score = 0;
                if (targetObjective === 'courage') score = totalStats.courage;
                else if (targetObjective === 'spirit') score = totalStats.spirit;
                else if (targetObjective === 'grace') score = totalStats.grace;
                else if (targetObjective === 'armor') score = armorScore;

                const isBetter = score > bestObjectiveValue || 
                                 (score === bestObjectiveValue && armorScore > bestTiebreakerArmorDef);

                if (isBetter) {
                    bestObjectiveValue = score;
                    bestTiebreakerArmorDef = armorScore;

                    bestConfig = {
                        allocation,
                        talisman,
                        totalStats,
                        optimalJoinery,
                        weapon,
                        armor: targetObjective === 'armor' ? { bestHelm, bestCuirass, bestLeggings, total: armorScore } : null
                    };
                }
            }
        }
    }

    // Resolve optimal armor once at the end for virtue-maxing objectives
    if (bestConfig && !bestConfig.armor) {
        const bestHelm = findBestArmorForSlot("Helm", bestConfig.totalStats);
        const bestCuirass = findBestArmorForSlot("Cuirass", bestConfig.totalStats);
        const bestLeggings = findBestArmorForSlot("Leggings", bestConfig.totalStats);
        if (bestHelm && bestCuirass && bestLeggings) {
            bestConfig.armor = {
                bestHelm,
                bestCuirass,
                bestLeggings,
                total: bestHelm.weightedTotal + bestCuirass.weightedTotal + bestLeggings.weightedTotal
            };
        }
    }

    return bestConfig;
}
