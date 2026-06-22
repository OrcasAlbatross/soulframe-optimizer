/**
 * Soulframe Math Engine (Time-Budgeted, Inlined High-Performance Version)
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
 * Generates the 64 possible combinations of Pact Point Exchanges.
 * If disabled, returns only a (0, 0, 0) placeholder with a cost of 0.
 */
function getPactCombinations(pactEnabled, availablePactPoints) {
    if (!pactEnabled || availablePactPoints <= 0) {
        return [{ courage: 0, spirit: 0, grace: 0, cost: 0 }];
    }
    const TIERS = [0, 1, 3, 6];
    const combinations = [];

    for (let c of TIERS) {
        for (let s of TIERS) {
            for (let g of TIERS) {
                const cost = c + s + g;
                if (cost <= availablePactPoints) {
                    combinations.push({ courage: c, spirit: s, grace: g, cost: cost });
                }
            }
        }
    }
    return combinations;
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
 * Calculates the absolute maximum damage a weapon can ever reach.
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
 */
function calculateArmorStats(armorPiece, envoyStats) {
    const base = armorPiece.baseStats;
    const reqs = armorPiece.requirements;

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
    const physBonus = Math.floor(c * (physPips.courage || 0) * 0.12 + s * (physPips.spirit || 0) * 0.12 + g * (physPips.grace || 0) * 0.12);

    // Magick
    const magPips = armorPiece.attunement.magick;
    const magBonus = Math.floor(c * (magPips.courage || 0) * 0.12 + s * (magPips.spirit || 0) * 0.12 + g * (magPips.grace || 0) * 0.12);

    // Stability
    const stabPips = armorPiece.attunement.stability;
    const stabBonus = Math.floor(c * (stabPips.courage || 0) * 0.12 + s * (stabPips.spirit || 0) * 0.12 + g * (stabPips.grace || 0) * 0.12);

    const physical = base.physical + physBonus;
    const magick = base.magick + magBonus;
    const stability = base.stability + stabBonus;

    return {
        physical, magick, stability,
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
        return { baseDamage, bonusDamage: 0, finalDamage: baseDamage, requirementsMet: false };
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

    let bonusDamage = envoyStats.courage * (pips.courage / 2) + envoyStats.spirit * (pips.spirit / 2) + envoyStats.grace * (pips.grace / 2);
    let finalDamage = baseDamage + bonusDamage;
    const effectiveCap = getWeaponMaxPossibleDamage(weapon, useMaxLevel);

    if (finalDamage > effectiveCap) {
        finalDamage = effectiveCap;
        bonusDamage = effectiveCap - baseDamage;
    }

    return {
        baseDamage,
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

    for (let i = 0; i < filtered.length; i++) {
        const weapon = filtered[i];
        let weaponMax = -1;

        for (let j = 0; j < joineriesToTest.length; j++) {
            const joinery = joineriesToTest[j];
            const jState = joinery.tier === 0 ? null : { enabled: true, virtue: joinery.virtue, tier: joinery.tier };
            const calc = calculateWeaponStats(weapon, envoyStats, jState);
            if (calc.finalDamage > weaponMax) weaponMax = calc.finalDamage;
        }

        for (let j = 0; j < joineriesToTest.length; j++) {
            const joinery = joineriesToTest[j];
            const jState = joinery.tier === 0 ? null : { enabled: true, virtue: joinery.virtue, tier: joinery.tier };
            const calc = calculateWeaponStats(weapon, envoyStats, jState);
            if (calc.finalDamage === weaponMax) {
                const isBetter = weaponMax > maxDamage || (weaponMax === maxDamage && joinery.tier < (bestWeaponConfig ? bestWeaponConfig.joineryTier : 999));
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
 * High-Performance Asynchronous Solver (Time-Budgeted Inlined Iteration)
 */
function solveStatMaxerAsync(totalPoints, minReqs, targetObjective, weapon, allowedTalismans, allowedArmor, skews, joineryEnabled, pactEnabled, availablePactPoints, pactPref, onProgress, onComplete) {
    const joineriesToTest = getJoineryList(joineryEnabled);
    const pactCombinations = getPactCombinations(pactEnabled, availablePactPoints);
    const requiredDamageCap = getWeaponMaxPossibleDamage(weapon);
    const weaponBase = weapon.maxAttack;

    // PRE-CALCULATE MODIFIERS: Flatten Talismans + Pacts into a single array to remove an inner loop
    const modifiers = [];
    for (let p = 0; p < pactCombinations.length; p++) {
        for (let t = 0; t < allowedTalismans.length; t++) {
            const pact = pactCombinations[p];
            const talisman = allowedTalismans[t];
            modifiers.push({
                pact, talisman,
                c: pact.courage + talisman.stats.courage,
                s: pact.spirit + talisman.stats.spirit,
                g: pact.grace + talisman.stats.grace
            });
        }
    }

    // PRE-CALCULATE JOINERIES: Pre-compute exact pip scaling math to inline weapon checks
    const weaponJoineries = [];
    for (let j = 0; j < joineriesToTest.length; j++) {
        const joinery = joineriesToTest[j];
        let cPip = weapon.attunement.courage || 0;
        let sPip = weapon.attunement.spirit || 0;
        let gPip = weapon.attunement.grace || 0;
        
        if (joinery.tier > 0) {
            if (joinery.virtue === "courage") cPip += joinery.tier;
            else if (joinery.virtue === "spirit") sPip += joinery.tier;
            else if (joinery.virtue === "grace") gPip += joinery.tier;
        }

        weaponJoineries.push({
            name: joinery.name,
            tier: joinery.tier,
            cHalf: Math.min(5, cPip) / 2,
            sHalf: Math.min(5, sPip) / 2,
            gHalf: Math.min(5, gPip) / 2
        });
    }

    // Fast inline armor solver (Only called when optimizing for armor)
    const findBestArmorScore = (totalC, totalS, totalG) => {
        let helmMax = -1, cuirassMax = -1, leggingsMax = -1;

        for (let i = 0; i < allowedArmor.length; i++) {
            const p = allowedArmor[i];
            const req = p.requirements;
            if (totalC < (req.courage || 0) || totalS < (req.spirit || 0) || totalG < (req.grace || 0)) continue;

            const base = p.baseStats;
            const physBonus = Math.floor(totalC * (p.attunement.physical.courage || 0) * 0.12 + totalS * (p.attunement.physical.spirit || 0) * 0.12 + totalG * (p.attunement.physical.grace || 0) * 0.12);
            const magBonus = Math.floor(totalC * (p.attunement.magick.courage || 0) * 0.12 + totalS * (p.attunement.magick.spirit || 0) * 0.12 + totalG * (p.attunement.magick.grace || 0) * 0.12);
            const stabBonus = Math.floor(totalC * (p.attunement.stability.courage || 0) * 0.12 + totalS * (p.attunement.stability.spirit || 0) * 0.12 + totalG * (p.attunement.stability.grace || 0) * 0.12);

            const weighted = ((base.physical + physBonus) * skews.physical) + ((base.magick + magBonus) * skews.magick) + ((base.stability + stabBonus) * skews.stability);

            if (p.slot === "Helm" && weighted > helmMax) helmMax = weighted;
            else if (p.slot === "Cuirass" && weighted > cuirassMax) cuirassMax = weighted;
            else if (p.slot === "Leggings" && weighted > leggingsMax) leggingsMax = weighted;
        }

        if (helmMax > -1 && cuirassMax > -1 && leggingsMax > -1) return helmMax + cuirassMax + leggingsMax;
        return 0;
    };

    let bestConfig = null;
    let bestObjectiveValue = -1;
    let bestTiebreakerArmorDef = -1;

    let allocC = 0;
    let allocS = 0;

    // --- TIME-BUDGETED EXECUTION LOOP ---
    function runTimeChunk() {
        const startTick = performance.now();
        let loopCounter = 0;

        while (allocC <= totalPoints) {
            const allocG = totalPoints - allocC - allocS;

            for (let mIdx = 0; mIdx < modifiers.length; mIdx++) {
                const mod = modifiers[mIdx];
                const tC = allocC + mod.c;
                const tS = allocS + mod.s;
                const tG = allocG + mod.g;

                // Thresholds Check
                if (tC < minReqs.courage || tS < minReqs.spirit || tG < minReqs.grace) continue;
                if (tC < (weapon.requirements.courage || 0) || tS < (weapon.requirements.spirit || 0) || tG < (weapon.requirements.grace || 0)) continue;

                // Inline Damage Eval
                let maxDamageFound = -1;
                let optJoinery = null;

                for (let jIdx = 0; jIdx < weaponJoineries.length; jIdx++) {
                    const wj = weaponJoineries[jIdx];
                    let dmg = weaponBase + (tC * wj.cHalf) + (tS * wj.sHalf) + (tG * wj.gHalf);
                    if (dmg > requiredDamageCap) dmg = requiredDamageCap;
                    if (dmg > maxDamageFound) {
                        maxDamageFound = dmg;
                        optJoinery = wj;
                    }
                }

                if (maxDamageFound < requiredDamageCap) continue; // Discard invalid builds

                // Tie-breaker Joinery Check
                for (let jIdx = 0; jIdx < weaponJoineries.length; jIdx++) {
                    const wj = weaponJoineries[jIdx];
                    let dmg = weaponBase + (tC * wj.cHalf) + (tS * wj.sHalf) + (tG * wj.gHalf);
                    if (dmg > requiredDamageCap) dmg = requiredDamageCap;
                    if (dmg === maxDamageFound) {
                        optJoinery = wj;
                        break;
                    }
                }

                // Armor Score Evaluation
                let armorScore = 0;
                if (targetObjective === 'armor') {
                    armorScore = findBestArmorScore(tC, tS, tG);
                }

                // Objective Evaluation
                let score = 0;
                if (targetObjective === 'courage') score = tC;
                else if (targetObjective === 'spirit') score = tS;
                else if (targetObjective === 'grace') score = tG;
                else if (targetObjective === 'armor') score = armorScore;

                let isBetter = false;
                if (score > bestObjectiveValue) {
                    isBetter = true;
                } else if (score === bestObjectiveValue) {
                    if (armorScore > bestTiebreakerArmorDef) {
                        isBetter = true;
                    } else if (armorScore === bestTiebreakerArmorDef) {
                        if (pactPref === 'minimize') {
                            isBetter = mod.pact.cost < (bestConfig ? bestConfig.pact.cost : 999);
                        } else {
                            isBetter = mod.pact.cost > (bestConfig ? bestConfig.pact.cost : -1);
                        }
                    }
                }

                if (isBetter) {
                    bestObjectiveValue = score;
                    bestTiebreakerArmorDef = armorScore;
                    bestConfig = {
                        allocation: { courage: allocC, spirit: allocS, grace: allocG },
                        talisman: mod.talisman,
                        pact: mod.pact,
                        totalStats: { courage: tC, spirit: tS, grace: tG },
                        optimalJoinery: { name: optJoinery.name, tier: optJoinery.tier },
                        weapon: weapon
                    };
                }
            }

            // State Machine Increments
            allocS++;
            if (allocS > totalPoints - allocC) {
                allocC++;
                allocS = 0;
                
                // Update Progress accurately based on the triangular area progression
                const completedPoints = allocC;
                const totalTriangle = (totalPoints * (totalPoints + 1)) / 2;
                const currentTriangle = (completedPoints * (2 * totalPoints - completedPoints + 1)) / 2;
                const percent = Math.min(99, Math.round((currentTriangle / totalTriangle) * 100));
                onProgress(percent);
            }

            // Time-Budget Yield Check (Check clock every 1000 inner loops)
            loopCounter++;
            if (loopCounter % 1000 === 0 && performance.now() - startTick > 15) {
                setTimeout(runTimeChunk, 0); // Yield thread back to browser
                return;
            }
        }

        // --- SEARCH COMPLETE ---
        onProgress(100);

        if (bestConfig) {
            // Re-hydrate the full object details for the UI exactly once at the end
            const fullJoineryState = bestConfig.optimalJoinery.tier === 0 ? null : { enabled: true, virtue: bestConfig.optimalJoinery.name.includes("Mora") ? "courage" : bestConfig.optimalJoinery.name.includes("Iridis") ? "spirit" : "grace", tier: bestConfig.optimalJoinery.tier };
            bestConfig.optimalJoinery.calc = calculateWeaponStats(weapon, bestConfig.totalStats, fullJoineryState);

            const getFullArmor = (slot) => {
                let best = null, maxW = -1;
                allowedArmor.filter(p => p.slot === slot).forEach(p => {
                    const c = calculateArmorStats(p, bestConfig.totalStats);
                    let w = (c.physical * skews.physical) + (c.magick * skews.magick) + (c.stability * skews.stability);
                    c.weightedTotal = Math.round(w * 10) / 10;
                    if (w > maxW) { maxW = w; best = { piece: p, calculated: c, weightedTotal: c.weightedTotal }; }
                });
                return best;
            };

            bestConfig.armor = {
                bestHelm: getFullArmor("Helm"),
                bestCuirass: getFullArmor("Cuirass"),
                bestLeggings: getFullArmor("Leggings")
            };
            if(bestConfig.armor.bestHelm) {
                 bestConfig.armor.total = bestConfig.armor.bestHelm.weightedTotal + bestConfig.armor.bestCuirass.weightedTotal + bestConfig.armor.bestLeggings.weightedTotal;
            }
        }

        onComplete(bestConfig);
    }

    // Begin time-budgeted execution
    runTimeChunk();
}
