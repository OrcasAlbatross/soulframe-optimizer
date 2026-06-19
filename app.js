/**
 * Soulframe Controller (app.js)
 * Orchestrates event listeners, states, calculations, and triggers rendering.
 */

let gameData = {
    armor: [],
    weapons: [],
    talismans: []
};

const excludedItems = new Set();
let selectedMaxerWeapon = null;

// Fetch and load data on initialization
async function initializeApp() {
    console.log("Loading live data from Soulframe Wiki...");
    document.getElementById('status-msg').innerText = "Fetching live data from the wiki...";

    try {
        // Fetch and parse Armor
        const rawArmor = await fetchWikiModule('Module:Data/Armour', 'sf_raw_armor');
        gameData.armor = parseArmorData(rawArmor);
        gameData.talismans = parseTalismanData(rawArmor);
        sessionStorage.setItem('sf_raw_armor', JSON.stringify(rawArmor));

        // Fetch and parse Weapons
        const rawWeapons = await fetchWikiModule('Module:Data/Weapons', 'sf_raw_weapons');
        gameData.weapons = parseWeaponData(rawWeapons);
        sessionStorage.setItem('sf_raw_weapons', JSON.stringify(rawWeapons));

        // Call dynamically built filter generator in ui.js
        populateFilters();
        populateExclusionsUI();
        
        // Find default weapon selection if nothing is currently selected
        const defaultWeapon = gameData.weapons.filter(w => !excludedItems.has(w.name))[0];
        selectMaxerWeapon(defaultWeapon); // Set default weapon in ui.js

        document.getElementById('status-msg').innerText = `Loaded ${gameData.armor.length} Armor pieces and ${gameData.weapons.length} Weapons successfully!`;
        console.log("Data loaded successfully:", gameData);

    } catch (error) {
        console.error("Failed to load data:", error);
        document.getElementById('status-msg').innerText = "Error loading wiki data. Check browser console.";
    }
}

// ----------------------------------------------------------------------
// VIRTUE ALLOCATOR ORCHESTRATOR
// ----------------------------------------------------------------------
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

    // Process Armor
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

    // Process Weapons
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
    const joineriesToTest = getJoineryList(joineryEnabled); // Using refactored helper
    const weaponCombinations = [];

    filteredWeapons.forEach(weapon => {
        joineriesToTest.forEach(j => {
            const jState = j.tier === 0 ? null : { enabled: true, virtue: j.virtue, tier: j.tier };
            const calc = calculateWeaponStats(weapon, envoyStats, jState);
            weaponCombinations.push({
                weapon: weapon,
                displayName: j.tier > 0 ? `${weapon.name}: ${j.name}` : weapon.name,
                calculated: calc,
                joineryTier: j.tier
            });
        });
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

    const primaries = weaponCombinations.filter(w => w.weapon.slot === "Weapon").sort(sortWeapons);
    const sidearms = weaponCombinations.filter(w => w.weapon.slot === "Sidearm").sort(sortWeapons);

    renderResults(helms, cuirasses, leggings, primaries, sidearms);
}

// ----------------------------------------------------------------------
// STAT MAXER ORCHESTRATOR
// ----------------------------------------------------------------------
// Stat Maxer optimization orchestrator (Deferred and Thread-Safe)
function runStatMaxer() {
    if (gameData.armor.length === 0 || gameData.weapons.length === 0) {
        alert("Data is still loading or failed to load. Please try again in a moment.");
        return;
    }

    if (!selectedMaxerWeapon) {
        alert("Please select a weapon first using the modal.");
        return;
    }

    // Show the loading spinner overlay instantly
    const loader = document.getElementById('loading-overlay');
    loader.classList.add('open');

    // Yield the execution thread to allow the browser to paint the loading screen
    setTimeout(() => {
        // Retrieve Points and Thresholds
        const points = Math.min(500, parseInt(document.getElementById('maxer-points').value, 10) || 0);
        const minC = parseInt(document.getElementById('min-courage').value, 10) || 0;
        const minS = parseInt(document.getElementById('min-spirit').value, 10) || 0;
        const minG = parseInt(document.getElementById('min-grace').value, 10) || 0;
        const minReqs = { courage: minC, spirit: minS, grace: minG };

        const targetObjective = document.getElementById('maxer-target').value;
        const talismanEnabled = document.getElementById('maxer-talisman-enable').checked;

        const skewPhys = parseFloat(document.getElementById('maxer-skew-phys').value) || 0;
        const skewMag = parseFloat(document.getElementById('maxer-skew-mag').value) || 0;
        const skewStab = parseFloat(document.getElementById('maxer-skew-stab').value) || 0;
        const maxerSkews = { physical: skewPhys, magick: skewMag, stability: skewStab };

        // Filter datasets
        const allowedArmor = gameData.armor.filter(p => !excludedItems.has(p.name));
        const allowedWeapons = gameData.weapons.filter(w => !excludedItems.has(w.name));
        
        const allowedTalismans = [ { name: "None", stats: { courage: 0, spirit: 0, grace: 0 } } ];
        if (talismanEnabled) {
            gameData.talismans
                .filter(t => !excludedItems.has(t.name))
                .forEach(t => allowedTalismans.push(t));
        }

        // Run Engine calculations
        console.log("Running Stat Maxer search...");
        const result = solveStatMaxer(
            points, 
            minReqs, 
            targetObjective, 
            selectedMaxerWeapon, 
            allowedTalismans, 
            allowedArmor, 
            maxerSkews, 
            true
        );

        // Pair the best secondary weapon
        if (result) {
            const pairedSlot = selectedMaxerWeapon.slot === "Weapon" ? "Sidearm" : "Weapon";
            result.pairedWeapon = getBestWeaponForSlot(pairedSlot, result.totalStats, allowedWeapons, true);
        }

        // Render the results
        renderMaxerResults(result, targetObjective);

        // Close the loading spinner overlay
        loader.classList.remove('open');
    }, 50); // 50ms to guarantee a paint cycle completes
}

// ----------------------------------------------------------------------
// EVENT BINDINGS
// ----------------------------------------------------------------------
window.onload = initializeApp;
document.getElementById('optimize-btn').addEventListener('click', runOptimization);
document.getElementById('maxer-btn').addEventListener('click', runStatMaxer);

// Tab Switching Controller
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');
        if (!targetTab) return;

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.getElementById(targetTab).classList.add('active');

        if (targetTab === "stat-maxer-tab") {
            if (!selectedMaxerWeapon || excludedItems.has(selectedMaxerWeapon.name)) {
                const defaultWeapon = gameData.weapons.filter(w => !excludedItems.has(w.name))[0];
                selectMaxerWeapon(defaultWeapon);
            }
        }
    });
});

// Weapon Modal Events
document.getElementById('open-weapon-modal-btn').addEventListener('click', openWeaponSelectorModal);
document.querySelector('.close-modal').addEventListener('click', closeWeaponSelectorModal);

window.addEventListener('click', (event) => {
    const modal = document.getElementById('weapon-modal');
    if (event.target === modal) {
        closeWeaponSelectorModal();
    }
});

// Modal Search/Filters
document.getElementById('modal-weapon-search').addEventListener('input', populateModalWeapons);
document.getElementById('modal-weapon-type-filter').addEventListener('change', populateModalWeapons);
document.getElementById('modal-weapon-slot-filter').addEventListener('change', populateModalWeapons);

// Toggle advanced skews conditionally
document.getElementById('maxer-target').addEventListener('change', function() {
    const advBox = document.getElementById('maxer-advanced-settings');
    if (this.value === 'armor') {
        advBox.style.display = 'block';
    } else {
        advBox.style.display = 'none';
    }
});

// Force the Virtue Pool input field to clamp between 0 and 500 dynamically
document.getElementById('maxer-points').addEventListener('input', function() {
    let val = parseInt(this.value, 10);
    if (isNaN(val)) return; // Allow the user to temporarily backspace and have an empty field

    if (val > 500) {
        this.value = 500;
    } else if (val < 0) {
        this.value = 0;
    }
});