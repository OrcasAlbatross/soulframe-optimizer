/**
 * Soulframe Math Engine
 * Standalone calculation formulas for equipment scaling.
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
 * Calculates the scaled defense values of an armor piece.
 * Formula: Base + Floor(Sum of (Envoy Stat * Pip * 0.12))
 */
function calculateArmorStats(armorPiece, envoyStats) {
    const base = armorPiece.baseStats;
    const requirementsMet = checkRequirements(armorPiece.requirements, envoyStats);

    if (!requirementsMet) {
        return {
            physical: base.physical,
            magick: base.magick,
            stability: base.stability,
            total: base.physical + base.magick + base.stability,
            requirementsMet: false
        };
    }

    const statsToCalculate = ["physical", "magick", "stability"];
    const virtues = ["courage", "spirit", "grace"];
    const finalStats = { requirementsMet: true };

    statsToCalculate.forEach(stat => {
        let bonusSum = 0;
        virtues.forEach(virtue => {
            const pips = armorPiece.attunement[stat][virtue] || 0;
            const envoyPoints = envoyStats[virtue] || 0;
            bonusSum += envoyPoints * pips * 0.12;
        });
        finalStats[stat] = base[stat] + Math.floor(bonusSum);
    });

    finalStats.total = finalStats.physical + finalStats.magick + finalStats.stability;
    return finalStats;
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

    // Load default pips from the weapon
    const pips = {
        courage: weapon.attunement.courage || 0,
        spirit: weapon.attunement.spirit || 0,
        grace: weapon.attunement.grace || 0
    };

    // Apply Joinery bonuses if enabled
    const virtues = ["courage", "spirit", "grace"];
    if (joinery && joinery.enabled && virtues.includes(joinery.virtue)) {
        pips[joinery.virtue] += (joinery.tier || 0);
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
 * Automatically identifies and calculates the best weapon to pair in the other slot.
 */
function getBestWeaponForSlot(slot, envoyStats, allowedWeapons, joineryEnabled) {
    const joineriesToTest = getJoineryList(joineryEnabled);
    let bestWeaponConfig = null;
    let maxDamage = -1;

    const filtered = allowedWeapons.filter(w => w.slot === slot);

    filtered.forEach(weapon => {
        let weaponMax = -1;
        joineriesToTest.forEach(j => {
            const jState = j.tier === 0 ? null : { enabled: true, virtue: j.virtue, tier: j.tier };
            const calc = calculateWeaponStats(weapon, envoyStats, jState);
            if (calc.finalDamage > weaponMax) {
                weaponMax = calc.finalDamage;
            }
        });

        for (let j of joineriesToTest) {
            const jState = j.tier === 0 ? null : { enabled: true, virtue: j.virtue, tier: j.tier };
            const calc = calculateWeaponStats(weapon, envoyStats, jState);
            if (calc.finalDamage === weaponMax) {
                const isBetter = weaponMax > maxDamage || 
                                 (weaponMax === maxDamage && j.tier < (bestWeaponConfig ? bestWeaponConfig.joineryTier : 999));
                if (isBetter) {
                    maxDamage = weaponMax;
                    bestWeaponConfig = {
                        weapon,
                        displayName: j.tier > 0 ? `${weapon.name}: ${j.name}` : weapon.name,
                        calculated: calc,
                        joineryTier: j.tier
                    };
                }
                break;
            }
        }
    });

    return bestWeaponConfig;
}

/**
 * Core Solver for the Stat Maxer.
 */
function solveStatMaxer(totalPoints, minReqs, targetObjective, weapon, allowedTalismans, allowedArmor, skews, joineryEnabled) {
    let bestConfig = null;
    let bestObjectiveValue = -1;
    let bestTiebreakerArmorDef = -1;

    const joineriesToTest = getJoineryList(joineryEnabled);
    const requiredDamageCap = getWeaponMaxPossibleDamage(weapon);

    const findBestArmorForSlot = (slot, stats) => {
        let bestPiece = null;
        let maxWeighted = -1;

        const filtered = allowedArmor.filter(p => p.slot === slot);
        for (let piece of filtered) {
            const calculated = calculateArmorStats(piece, stats);
            const weighted = (calculated.physical * skews.physical) + 
                             (calculated.magick * skews.magick) + 
                             (calculated.stability * skews.stability);
            if (weighted > maxWeighted) {
                maxWeighted = weighted;
                bestPiece = { piece, calculated, weightedTotal: Math.round(weighted * 10) / 10 };
            }
        }
        return bestPiece;
    };

    for (let allocC = 0; allocC <= totalPoints; allocC++) {
        for (let allocS = 0; allocS <= totalPoints - allocC; allocS++) {
            const allocG = totalPoints - allocC - allocS;
            const allocation = { courage: allocC, spirit: allocS, grace: allocG };

            for (let talisman of allowedTalismans) {
                const totalStats = {
                    courage: allocation.courage + talisman.stats.courage,
                    spirit: allocation.spirit + talisman.stats.spirit,
                    grace: allocation.grace + talisman.stats.grace
                };

                // Threshold checks
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

                // Weapon Damage Cap Check (The new strict constraint)
                let maxDamageFound = -1;
                let optimalJoinery = null;

                for (let j of joineriesToTest) {
                    const jState = j.tier === 0 ? null : { enabled: true, virtue: j.virtue, tier: j.tier };
                    const calc = calculateWeaponStats(weapon, totalStats, jState);
                    if (calc.finalDamage > maxDamageFound) {
                        maxDamageFound = calc.finalDamage;
                        optimalJoinery = { name: j.name, calc, tier: j.tier };
                    }
                }

                // DISCARD build if it cannot hit the absolute weapon cap
                if (maxDamageFound < requiredDamageCap) {
                    continue;
                }

                // Find lowest joinery that hits this cap
                for (let j of joineriesToTest) {
                    const jState = j.tier === 0 ? null : { enabled: true, virtue: j.virtue, tier: j.tier };
                    const calc = calculateWeaponStats(weapon, totalStats, jState);
                    if (calc.finalDamage === maxDamageFound) {
                        optimalJoinery = { name: j.name, calc, tier: j.tier };
                        break;
                    }
                }

                // Evaluate Armor
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

                // Calculate Objective Score
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
