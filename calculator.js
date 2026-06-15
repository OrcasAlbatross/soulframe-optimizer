/**
 * Soulframe Math Engine
 * Standalone calculation formulas for equipment scaling.
 */

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
 * Calculates the scaled defense values of an armor piece.
 * Formula: Base + Floor(Sum of (Envoy Stat * Pip * 0.12))
 */
function calculateArmorStats(armorPiece, envoyStats) {
    const base = armorPiece.baseStats;
    const requirementsMet = checkRequirements(armorPiece.requirements, envoyStats);

    // If requirements are not met, return base stats with zero bonus scaling
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
        
        // Sum the virtue bonuses first, then truncate (round down)
        finalStats[stat] = base[stat] + Math.floor(bonusSum);
    });

    finalStats.total = finalStats.physical + finalStats.magick + finalStats.stability;
    return finalStats;
}

/**
 * Calculates the scaled damage of a weapon.
 * Formula: Base + (Courage * C_Pips/2) + (Spirit * S_Pips/2) + (Grace * G_Pips/2)
 * Limits: Max final damage is capped by weapon's damageCap.
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

    // Default pips from the weapon
    const pips = {
        courage: weapon.attunement.courage || 0,
        spirit: weapon.attunement.spirit || 0,
        grace: weapon.attunement.grace || 0
    };

    // Apply Joinery bonuses if enabled and valid
    const virtues = ["courage", "spirit", "grace"];
    if (joinery && joinery.enabled && virtues.includes(joinery.virtue)) {
        pips[joinery.virtue] += (joinery.tier || 0); // tier can be 1, 2, or 3 pips
    }

    // Calculate Attunement Bonus
    let bonusDamage = 
        envoyStats.courage * (pips.courage / 2) +
        envoyStats.spirit * (pips.spirit / 2) +
        envoyStats.grace * (pips.grace / 2);

    // Enforce Weapon Damage Cap
    let finalDamage = baseDamage + bonusDamage;
    if (weapon.damageCap && finalDamage > weapon.damageCap) {
        finalDamage = weapon.damageCap;
        bonusDamage = weapon.damageCap - baseDamage; // Cap the bonus to match
    }

    return {
        baseDamage: baseDamage,
        bonusDamage: Number(bonusDamage.toFixed(1)), // Keep to 1 decimal place
        finalDamage: Number(finalDamage.toFixed(1)),
        requirementsMet: true
    };
}