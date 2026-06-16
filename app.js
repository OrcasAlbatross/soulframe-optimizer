let gameData = {
    armor: [],
    weapons: []
};

// Fetch and load data on initialization
async function initializeApp() {
    console.log("Loading live data from Soulframe Wiki...");
    document.getElementById('status-msg').innerText = "Fetching live data from the wiki...";

    try {
        // Fetch and parse Armor
        const rawArmor = await fetchWikiModule('Module:Data/Armour', 'sf_raw_armor');
        gameData.armor = parseArmorData(rawArmor);
        sessionStorage.setItem('sf_raw_armor', JSON.stringify(rawArmor));

        // Fetch and parse Weapons
        const rawWeapons = await fetchWikiModule('Module:Data/Weapons', 'sf_raw_weapons');
        gameData.weapons = parseWeaponData(rawWeapons);
        sessionStorage.setItem('sf_raw_weapons', JSON.stringify(rawWeapons));
        populateFilters();

        document.getElementById('status-msg').innerText = `Loaded ${gameData.armor.length} Armor pieces and ${gameData.weapons.length} Weapons successfully!`;
        console.log("Data loaded successfully:", gameData);

    } catch (error) {
        console.error("Failed to load data:", error);
        document.getElementById('status-msg').innerText = "Error loading wiki data. Check browser console.";
    }
}

// Dynamically build dropdown filter options from parsed wiki data
function populateFilters() {
    const primaryFilter = document.getElementById('primary-filter');
    const sidearmFilter = document.getElementById('sidearm-filter');

    // Reset dropdowns to the default option
    primaryFilter.innerHTML = '<option value="all">All Primaries</option>';
    sidearmFilter.innerHTML = '<option value="all">All Sidearms</option>';

    const primaryTypes = new Set();
    const sidearmTypes = new Set();

    // Collect all unique weapon types currently in the dataset
    gameData.weapons.forEach(w => {
        if (w.slot === "Weapon" && w.type) {
            primaryTypes.add(w.type);
        } else if (w.slot === "Sidearm" && w.type) {
            sidearmTypes.add(w.type);
        }
    });

    // Populate Primary Dropdown
    Array.from(primaryTypes).sort().forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        primaryFilter.appendChild(opt);
    });

    // Populate Sidearm Dropdown
    Array.from(sidearmTypes).sort().forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        sidearmFilter.appendChild(opt);
    });
}


// Main optimization orchestrator
function runOptimization() {
    if (gameData.armor.length === 0 || gameData.weapons.length === 0) {
        alert("Data is still loading or failed to load. Please try again in a moment.");
        return;
    }

    // Retrieve Envoy stats
    const courage = parseInt(document.getElementById('courage').value, 10) || 0;
    const spirit = parseInt(document.getElementById('spirit').value, 10) || 0;
    const grace = parseInt(document.getElementById('grace').value, 10) || 0;
    const envoyStats = { courage, spirit, grace };

    // Retrieve Joinery setting
    const joineryEnabled = document.getElementById('joinery-enable').checked;

    // Retrieve Weapon filters
    const primaryFilterVal = document.getElementById('primary-filter').value;
    const sidearmFilterVal = document.getElementById('sidearm-filter').value;

    // Process Armor
    const calculatedArmor = gameData.armor.map(piece => {
        const calculated = calculateArmorStats(piece, envoyStats);
        return { piece, calculated };
    });

    // Sort armor by total defense
    const helms = calculatedArmor.filter(item => item.piece.slot === "Helm")
        .sort((a, b) => b.calculated.total - a.calculated.total);

    const cuirasses = calculatedArmor.filter(item => item.piece.slot === "Cuirass")
        .sort((a, b) => b.calculated.total - a.calculated.total);

    const leggings = calculatedArmor.filter(item => item.piece.slot === "Leggings")
        .sort((a, b) => b.calculated.total - a.calculated.total);

    // Apply weapon type filter
    let filteredPrimaries = gameData.weapons.filter(w => w.slot === "Weapon");
    if (primaryFilterVal !== "all") {
        filteredPrimaries = filteredPrimaries.filter(w => w.type === primaryFilterVal);
    }

    let filteredSidearms = gameData.weapons.filter(w => w.slot === "Sidearm");
    if (sidearmFilterVal !== "all") {
        filteredSidearms = filteredSidearms.filter(w => w.type === sidearmFilterVal);
    }

    // Combine both filtered arrays to run the joinery permutations
    const filteredWeapons = [...filteredPrimaries, ...filteredSidearms];

    // Define all possible Joineries
    const JOINERIES = [
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

    // Generate combinations
    const weaponCombinations = [];

    filteredWeapons.forEach(weapon => {
        // Base weapon (no joinery has a tier of 0)
        const baseCalc = calculateWeaponStats(weapon, envoyStats, null);
        weaponCombinations.push({
            weapon: weapon,
            displayName: weapon.name,
            calculated: baseCalc,
            joineryTier: 0
        });

        // Add 9 variations if Joinery is enabled
        if (joineryEnabled) {
            JOINERIES.forEach(j => {
                const jCalc = calculateWeaponStats(weapon, envoyStats, { enabled: true, virtue: j.virtue, tier: j.tier });
                weaponCombinations.push({
                    weapon: weapon,
                    displayName: `${weapon.name}: ${j.name}`,
                    calculated: jCalc,
                    joineryTier: j.tier
                });
            });
        }
    });

    // Separate slots and sort by final damage
    // Custom sort function with damage-cap and cost tiebreakers
    const sortWeapons = (a, b) => {
        // Primary Sort: Final Damage (highest first)
        if (b.calculated.finalDamage !== a.calculated.finalDamage) {
            return b.calculated.finalDamage - a.calculated.finalDamage;
        }
        // Secondary Sort: Joinery Tier (lowest tier / cheapest first)
        if (a.joineryTier !== b.joineryTier) {
            return a.joineryTier - b.joineryTier;
        }
        // Tertiary Sort: Alphabetical order of weapon name
        return a.weapon.name.localeCompare(b.weapon.name);
    };

    // Separate Primaries and Sidearms, then sort each using the tiebreaker
    const primaries = weaponCombinations.filter(w => w.weapon.slot === "Weapon")
        .sort(sortWeapons);

    const sidearms = weaponCombinations.filter(w => w.weapon.slot === "Sidearm")
        .sort(sortWeapons);

    // Render results
    renderResults(helms, cuirasses, leggings, primaries, sidearms);
}

// Generate HTML output
function renderResults(helms, cuirasses, leggings, primaries, sidearms) {
    const bestBuildOutput = document.getElementById('best-build-output');
    const helmRunnerUps = document.getElementById('helm-runner-ups');
    const cuirassRunnerUps = document.getElementById('cuirass-runner-ups');
    const leggingsRunnerUps = document.getElementById('leggings-runner-ups');
    const primaryRankings = document.getElementById('primary-rankings');
    const sidearmRankings = document.getElementById('sidearm-rankings');

    const bestHelm = helms[0];
    const bestCuirass = cuirasses[0];
    const bestLeggings = leggings[0];
    const bestPrimary = primaries[0];
    const bestSidearm = sidearms[0];

    if (!bestHelm || !bestCuirass || !bestLeggings) {
        bestBuildOutput.innerHTML = `<p class="placeholder-msg">Insufficient armor data to calculate.</p>`;
        return;
    }

    // Compute grand totals
    const grandPhys = bestHelm.calculated.physical + bestCuirass.calculated.physical + bestLeggings.calculated.physical;
    const grandMag = bestHelm.calculated.magick + bestCuirass.calculated.magick + bestLeggings.calculated.magick;
    const grandStab = bestHelm.calculated.stability + bestCuirass.calculated.stability + bestLeggings.calculated.stability;
    const grandTotal = grandPhys + grandMag + grandStab;

    // Summary Card HTML
    let buildHtml = `
        <div class="total-summary-card">
            <h3>Combined Build Defense</h3>
            <p><strong>Physical Defense:</strong> ${grandPhys}</p>
            <p><strong>Magick Defense:</strong> ${grandMag}</p>
            <p><strong>Stability:</strong> ${grandStab}</p>
            <p style="margin-top: 5px; border-top: 1px solid #444; padding-top: 5px;">
                <strong>Grand Total Defense Points:</strong> <span style="color: #82c91e;">${grandTotal}</span>
            </p>
        </div>
    `;

    const renderOptimalItem = (item, type) => {
        const reqMetText = item.calculated.requirementsMet ? "" : ` <span style="color: #ff6b6b; font-size: 0.8em;">(Reqs Not Met)</span>`;
        return `
            <div class="optimal-item">
                <h4>${type}: ${item.piece.name} ${reqMetText}</h4>
                <div class="optimal-stats-breakdown">
                    <span>Phys: ${item.calculated.physical}</span>
                    <span>Mag: ${item.calculated.magick}</span>
                    <span>Stab: ${item.calculated.stability}</span>
                    <span>(Total: ${item.calculated.total})</span>
                </div>
            </div>
        `;
    };

    buildHtml += renderOptimalItem(bestHelm, "Helm");
    buildHtml += renderOptimalItem(bestCuirass, "Cuirass");
    buildHtml += renderOptimalItem(bestLeggings, "Leggings");

    // Display Best Primary Weapon
    if (bestPrimary) {
        const reqMetText = bestPrimary.calculated.requirementsMet ? "" : ` <span style="color: #ff6b6b; font-size: 0.8em;">(Reqs Not Met)</span>`;
        buildHtml += `
            <div class="optimal-item" style="border-left: 3px solid #82c91e;">
                <h4>Optimal Primary: ${bestPrimary.displayName} ${reqMetText}</h4>
                <p style="font-size: 0.85em; color: #ccc;">Damage: <span style="color: #82c91e; font-weight: bold;">${bestPrimary.calculated.finalDamage}</span> (Base: ${bestPrimary.calculated.baseDamage}, Scaling: +${bestPrimary.calculated.bonusDamage})</p>
                <p style="font-size: 0.75em; color: #888;">Type: ${bestPrimary.weapon.type}</p>
            </div>
        `;
    }

    // Display Best Sidearm
    if (bestSidearm) {
        const reqMetText = bestSidearm.calculated.requirementsMet ? "" : ` <span style="color: #ff6b6b; font-size: 0.8em;">(Reqs Not Met)</span>`;
        buildHtml += `
            <div class="optimal-item" style="border-left: 3px solid #3498db;">
                <h4>Optimal Sidearm: ${bestSidearm.displayName} ${reqMetText}</h4>
                <p style="font-size: 0.85em; color: #ccc;">Damage: <span style="color: #3498db; font-weight: bold;">${bestSidearm.calculated.finalDamage}</span> (Base: ${bestSidearm.calculated.baseDamage}, Scaling: +${bestSidearm.calculated.bonusDamage})</p>
                <p style="font-size: 0.75em; color: #888;">Type: ${bestSidearm.weapon.type}</p>
            </div>
        `;
    }

    bestBuildOutput.innerHTML = buildHtml;

    // Render Runner-Ups (helms, cuirasses, leggings)
    const renderRunnerUpList = (container, list) => {
        container.innerHTML = '';
        list.slice(1, 6).forEach(item => {
            const row = document.createElement('div');
            row.className = 'gear-row';
            row.innerHTML = `
                <span class="gear-name">${item.piece.name}</span>
                <span class="gear-stats">P:${item.calculated.physical} M:${item.calculated.magick} S:${item.calculated.stability} (T:${item.calculated.total})</span>
            `;
            container.appendChild(row);
        });
        if (container.children.length === 0) {
            container.innerHTML = '<p class="placeholder-msg" style="margin: 10px 0;">No alternative runner-ups available.</p>';
        }
    };

    renderRunnerUpList(helmRunnerUps, helms);
    renderRunnerUpList(cuirassRunnerUps, cuirasses);
    renderRunnerUpList(leggingsRunnerUps, leggings);

    // Render Weapon lists helper
    const renderWeaponList = (container, list, highlightColor) => {
        container.innerHTML = '';
        list.forEach(item => {
            const row = document.createElement('div');
            row.className = 'gear-row';
            const reqStyle = item.calculated.requirementsMet ? "" : "color: #888; text-decoration: line-through;";
            const bonusText = item.calculated.requirementsMet ? `(+${item.calculated.bonusDamage})` : "(Reqs Not Met)";

            row.innerHTML = `
                <span class="gear-name" style="${reqStyle}">${item.displayName} <small style="color: #777;">(${item.weapon.type})</small></span>
                <span class="gear-stats">
                    <strong style="color: ${highlightColor};">${item.calculated.finalDamage}</strong> 
                    <small style="color: #666;">Base: ${item.calculated.baseDamage} ${bonusText}</small>
                </span>
            `;
            container.appendChild(row);
        });

        if (list.length === 0) {
            container.innerHTML = '<p class="placeholder-msg">No weapons found for active filters.</p>';
        }
    };

    renderWeaponList(primaryRankings, primaries, "#82c91e");
    renderWeaponList(sidearmRankings, sidearms, "#3498db");
}

// Initialize on page load
window.onload = initializeApp;
document.getElementById('optimize-btn').addEventListener('click', runOptimization);