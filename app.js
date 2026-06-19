/**
 * Soulframe Controller (app.js)
 * Orchestrates event listeners, states, calculations, and triggers rendering.
 */

let gameData = {
    armor: [],
    weapons: []
};

const excludedItems = new Set();

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
        
        // Call dynamically built filter generator in ui.js
        populateFilters();
        populateExclusionsUI();

        document.getElementById('status-msg').innerText = `Loaded ${gameData.armor.length} Armor pieces and ${gameData.weapons.length} Weapons successfully!`;
        console.log("Data loaded successfully:", gameData);

    } catch (error) {
        console.error("Failed to load data:", error);
        document.getElementById('status-msg').innerText = "Error loading wiki data. Check browser console.";
    }
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

    // Retrieve Stat Skews (Advanced Settings)
    const skewPhys = parseFloat(document.getElementById('skew-phys').value) || 0;
    const skewMag = parseFloat(document.getElementById('skew-mag').value) || 0;
    const skewStab = parseFloat(document.getElementById('skew-stab').value) || 0;

    // Process Filtered Armor through math engine (calculator.js) and apply stat skews
    const allowedArmor = gameData.armor.filter(piece => !excludedItems.has(piece.name));

    const calculatedArmor = allowedArmor.map(piece => {
        const calculated = calculateArmorStats(piece, envoyStats);
        
        // Compute the skewed total based on user multipliers
        let weighted = (calculated.physical * skewPhys) + 
                       (calculated.magick * skewMag) + 
                       (calculated.stability * skewStab);
                       
        calculated.weightedTotal = Math.round(weighted * 10) / 10;
        return { piece, calculated };
    });

    // Sort armor by weighted total defense
    const helms = calculatedArmor.filter(item => item.piece.slot === "Helm")
        .sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);

    const cuirasses = calculatedArmor.filter(item => item.piece.slot === "Cuirass")
        .sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);

    const leggings = calculatedArmor.filter(item => item.piece.slot === "Leggings")
        .sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);

    // Filter out excluded weapons, then apply separate weapon filters
    const allowedWeapons = gameData.weapons.filter(w => !excludedItems.has(w.name));

    let filteredPrimaries = allowedWeapons.filter(w => w.slot === "Weapon");
    if (primaryFilterVal !== "all") {
        filteredPrimaries = filteredPrimaries.filter(w => w.type === primaryFilterVal);
    }

    let filteredSidearms = allowedWeapons.filter(w => w.slot === "Sidearm");
    if (sidearmFilterVal !== "all") {
        filteredSidearms = filteredSidearms.filter(w => w.type === sidearmFilterVal);
    }

    const filteredWeapons = [...filteredPrimaries, ...filteredSidearms];

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

    // Generate weapon permutations
    const weaponCombinations = [];

    filteredWeapons.forEach(weapon => {
        const baseCalc = calculateWeaponStats(weapon, envoyStats, null);
        weaponCombinations.push({
            weapon: weapon,
            displayName: weapon.name,
            calculated: baseCalc,
            joineryTier: 0
        });

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

    const sortWeapons = (a, b) => {
        if (b.calculated.finalDamage !== a.calculated.finalDamage) {
            return b.calculated.finalDamage - a.calculated.finalDamage;
        }
        if (a.joineryTier !== b.joineryTier) {
            return a.joineryTier - b.joineryTier;
        }
        return a.weapon.name.localeCompare(b.weapon.name);
    };

    const primaries = weaponCombinations.filter(w => w.weapon.slot === "Weapon")
        .sort(sortWeapons);

    const sidearms = weaponCombinations.filter(w => w.weapon.slot === "Sidearm")
        .sort(sortWeapons);

    // Call view engine in ui.js to update the UI
    renderResults(helms, cuirasses, leggings, primaries, sidearms);
}

// Bind Global Listeners
window.onload = initializeApp;
document.getElementById('optimize-btn').addEventListener('click', runOptimization);
// Tab Switching Controller
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');
        if (!targetTab) return;

        // Toggle buttons active class
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Toggle content containers active class
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.getElementById(targetTab).classList.add('active');
    });
});

// Initialize on page load
window.onload = initializeApp;
document.getElementById('optimize-btn').addEventListener('click', runOptimization);
