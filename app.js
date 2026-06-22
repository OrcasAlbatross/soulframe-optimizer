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
let guidedSetupPerformed = false; // Tracks if the user has consulted the Wazzard

// Fetch and load data on initialization
async function initializeApp() {
    console.log("Loading live data from Soulframe Wiki...");
    document.getElementById('status-msg').innerText = "Fetching live data from the wiki...";

    // Apply saved theme preference immediately on load
    const savedTheme = localStorage.getItem('sf_theme_preference');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('theme-toggle-btn').innerText = "Dark Mode";
    }

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

        // Call dynamically built filter generators in ui.js
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

    const helms = calculatedArmor.filter(item => item.piece.slot === "Helm").sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);
    const cuirasses = calculatedArmor.filter(item => item.piece.slot === "Cuirass").sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);
    const leggings = calculatedArmor.filter(item => item.piece.slot === "Leggings").sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);

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
    const joineriesToTest = getJoineryList(joineryEnabled);
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
        if (b.calculated.finalDamage !== a.calculated.finalDamage) return b.calculated.finalDamage - a.calculated.finalDamage;
        if (a.joineryTier !== b.joineryTier) return a.joineryTier - b.joineryTier;
        return a.weapon.name.localeCompare(b.weapon.name);
    };

    const primaries = weaponCombinations.filter(w => w.weapon.slot === "Weapon").sort(sortWeapons);
    const sidearms = weaponCombinations.filter(w => w.weapon.slot === "Sidearm").sort(sortWeapons);

    // Call view engine in ui.js to update the UI
    renderResults(helms, cuirasses, leggings, primaries, sidearms);
}

// ----------------------------------------------------------------------
// STAT MAXER ORCHESTRATOR
// ----------------------------------------------------------------------
function runStatMaxer() {
    if (gameData.armor.length === 0 || gameData.weapons.length === 0) {
        alert("Data is still loading or failed to load. Please try again in a moment.");
        return;
    }

    if (!selectedMaxerWeapon) {
        alert("Please select a weapon first using the modal.");
        return;
    }

    // Show loading spinner
    const loader = document.getElementById('loading-overlay');
    const progressBar = document.getElementById('loading-progress');
    const percentLabel = document.getElementById('loading-percent');
    
    if (loader) {
        progressBar.style.width = "0%";
        percentLabel.innerText = "0%";
        loader.classList.add('open');
    }

    // Yield thread to paint the loader
    setTimeout(() => {
        // Retrieve Points and Thresholds
        const points = Math.min(500, parseInt(document.getElementById('maxer-points').value, 10) || 0);
        const minC = parseInt(document.getElementById('min-courage').value, 10) || 0;
        const minS = parseInt(document.getElementById('min-spirit').value, 10) || 0;
        const minG = parseInt(document.getElementById('min-grace').value, 10) || 0;
        const minReqs = { courage: minC, spirit: minS, grace: minG };

        const targetObjective = document.getElementById('maxer-target').value;
        const talismanEnabled = document.getElementById('maxer-talisman-enable').checked;

        // Retrieve Pact Points Inputs
        const pactEnabled = document.getElementById('maxer-pact-enable').checked;
        const pactPoints = Math.min(60, parseInt(document.getElementById('maxer-pact-points').value, 10) || 0);
        const pactPref = document.getElementById('maxer-pact-pref').value;

        // Retrieve Advanced Skews
        const skewPhys = parseFloat(document.getElementById('maxer-skew-phys').value) || 0;
        const skewMag = parseFloat(document.getElementById('maxer-skew-mag').value) || 0;
        const skewStab = parseFloat(document.getElementById('maxer-skew-stab').value) || 0;
        const maxerSkews = { physical: skewPhys, magick: skewMag, stability: skewStab };

        // Filter Datasets
        const allowedArmor = gameData.armor.filter(p => !excludedItems.has(p.name));
        const allowedWeapons = gameData.weapons.filter(w => !excludedItems.has(w.name));
        
        const allowedTalismans = [ { name: "None", stats: { courage: 0, spirit: 0, grace: 0 } } ];
        if (talismanEnabled) {
            gameData.talismans.filter(t => !excludedItems.has(t.name)).forEach(t => allowedTalismans.push(t));
        }

        solveStatMaxerAsync(
            points, minReqs, targetObjective, selectedMaxerWeapon, allowedTalismans, allowedArmor, maxerSkews, true, pactEnabled, pactPoints, pactPref,
            (percent) => {
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (percentLabel) percentLabel.innerText = `${percent}%`;
            },
            // onComplete Callback: Runs on loop completion
            (result) => {
                // Pair the best secondary weapon
                if (result) {
                    const pairedSlot = selectedMaxerWeapon.slot === "Weapon" ? "Sidearm" : "Weapon";
                    result.pairedWeapon = getBestWeaponForSlot(pairedSlot, result.totalStats, allowedWeapons, true);
                }

                // Render 
                renderMaxerResults(result, targetObjective);

                // Hide loader
                if (loader) loader.classList.remove('open');
            }
        );
    }, 50);
}

// ----------------------------------------------------------------------
// GUIDED SETUP MODAL (The Wazzard's Math)
// ----------------------------------------------------------------------
function openGuidedModal() {
    document.getElementById('guided-modal').classList.add('open');
}

function closeGuidedModal() {
    document.getElementById('guided-modal').classList.remove('open');
}

function applyGuidedSetup() {
    // Gather Inputs
    const rank = parseInt(document.getElementById('guided-rank').value, 10) || 1;
    
    const hasCuraidh = document.getElementById('guided-elixir-c').checked;
    const hasDancing = document.getElementById('guided-elixir-s').checked;
    const hasShade = document.getElementById('guided-elixir-g').checked;

    const questWolf = document.getElementById('guided-quest-wolf').value;
    const questBear = document.getElementById('guided-quest-bear').value;

    const pactC = parseInt(document.getElementById('guided-pact-c').value, 10) || 0;
    const pactS = parseInt(document.getElementById('guided-pact-s').value, 10) || 0;
    const pactG = parseInt(document.getElementById('guided-pact-g').value, 10) || 0;

    const prefC = parseInt(document.getElementById('guided-pref-c').value, 10) || 0;
    const prefS = parseInt(document.getElementById('guided-pref-s').value, 10) || 0;
    const prefG = parseInt(document.getElementById('guided-pref-g').value, 10) || 0;
    
    const extraAny = parseInt(document.getElementById('guided-extra-any').value, 10) || 0;
    const extraC = parseInt(document.getElementById('guided-extra-c').value, 10) || 0;
    const extraS = parseInt(document.getElementById('guided-extra-s').value, 10) || 0;
    const extraG = parseInt(document.getElementById('guided-extra-g').value, 10) || 0;

    let totalPoints = 16 + rank + extraAny + extraC + extraS + extraG;
    let minC = 1 + pactC + extraC;
    let minS = 1 + pactS + extraS;
    let minG = 1 + pactG + extraG;

    if (hasCuraidh) { totalPoints += 10; minC += 10; }
    if (hasDancing) { totalPoints += 10; minS += 10; }
    if (hasShade) { totalPoints += 10; minG += 10; }

    // Quests
    if (questWolf === 'courage') { totalPoints += 1; minC += 1; }
    else if (questWolf === 'spirit') { totalPoints += 1; minS += 1; }
    else if (questWolf === 'grace') { totalPoints += 1; minG += 1; }

    if (questBear === 'courage') { totalPoints += 1; minC += 1; }
    else if (questBear === 'spirit') { totalPoints += 1; minS += 1; }
    else if (questBear === 'grace') { totalPoints += 1; minG += 1; }

    // Apply "Preferred Minimums" User Overrides
    minC = Math.max(minC, prefC);
    minS = Math.max(minS, prefS);
    minG = Math.max(minG, prefG);

    // Inject into Side Panel
    document.getElementById('maxer-points').value = totalPoints;
    document.getElementById('min-courage').value = minC;
    document.getElementById('min-spirit').value = minS;
    document.getElementById('min-grace').value = minG;

    // Toggle setup flag to True
    guidedSetupPerformed = true;

    // Hide the setup warning instantly since values were successfully calculated
    document.getElementById('maxer-warning-msg').style.display = 'none';

    if (pactC > 0 || pactS > 0 || pactG > 0) {
        const pactCheckbox = document.getElementById('maxer-pact-enable');
        pactCheckbox.checked = false;
        // Trigger the change event so the UI hides the box
        pactCheckbox.dispatchEvent(new Event('change'));
    }

    // Flash the side panel inputs to show they updated
    const inputsToFlash = ['maxer-points', 'min-courage', 'min-spirit', 'min-grace'];
    inputsToFlash.forEach(id => {
        const el = document.getElementById(id);
        el.style.transition = 'background-color 0.35s';
        el.style.backgroundColor = '#1e3040';
        setTimeout(() => el.style.backgroundColor = '', 450);
    });

    closeGuidedModal();
}

// ----------------------------------------------------------------------
// EVENT BINDINGS
// ----------------------------------------------------------------------
window.onload = initializeApp;
document.getElementById('optimize-btn').addEventListener('click', runOptimization);
document.getElementById('maxer-btn').addEventListener('click', runStatMaxer);

// Guided Modal Triggers
document.getElementById('open-guided-modal-btn').addEventListener('click', openGuidedModal);
document.querySelector('.close-guided-modal').addEventListener('click', closeGuidedModal);
document.getElementById('apply-guided-btn').addEventListener('click', applyGuidedSetup);

// Tab Switching
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

// Weapon Modal
document.getElementById('open-weapon-modal-btn').addEventListener('click', openWeaponSelectorModal);
document.querySelector('.close-modal').addEventListener('click', closeWeaponSelectorModal);
window.addEventListener('click', (event) => {
    const wModal = document.getElementById('weapon-modal');
    const gModal = document.getElementById('guided-modal');
    if (event.target === wModal) closeWeaponSelectorModal();
    if (event.target === gModal) closeGuidedModal();
});

// Modal Search/Filters
document.getElementById('modal-weapon-search').addEventListener('input', populateModalWeapons);
document.getElementById('modal-weapon-type-filter').addEventListener('change', populateModalWeapons);
document.getElementById('modal-weapon-slot-filter').addEventListener('change', populateModalWeapons);

// Toggle advanced skews conditionally
document.getElementById('maxer-target').addEventListener('change', function() {
    const advBox = document.getElementById('maxer-advanced-settings');
    advBox.style.display = (this.value === 'armor') ? 'block' : 'none';
});

// Manual Editing Checkbox Toggle
document.getElementById('manual-edit-enable').addEventListener('change', function() {
    const manualFieldsBox = document.getElementById('maxer-manual-fields');
    const warningMsg = document.getElementById('maxer-warning-msg');
    const isManual = this.checked;
    const inputs = ['maxer-points', 'min-courage', 'min-spirit', 'min-grace'];
    
    if (isManual) {
        manualFieldsBox.style.display = 'flex';
        warningMsg.style.display = 'none'; // Hide warning when manual editing is active
        inputs.forEach(id => {
            const el = document.getElementById(id);
            el.removeAttribute('readonly');
            el.classList.remove('locked-input');
        });
    } else {
        manualFieldsBox.style.display = 'none';
        // Restore warning ONLY if they toggled manual off and have not run guided setup
        if (!guidedSetupPerformed) {
            warningMsg.style.display = 'block';
        }
        inputs.forEach(id => {
            const el = document.getElementById(id);
            el.setAttribute('readonly', true);
            el.classList.add('locked-input');
        });
    }
});

// Clamping inputs
document.getElementById('maxer-points').addEventListener('input', function() {
    let val = parseInt(this.value, 10);
    if (isNaN(val)) return;
    if (val > 500) this.value = 500;
    else if (val < 0) this.value = 0;
});

document.getElementById('maxer-pact-points').addEventListener('input', function() {
    let val = parseInt(this.value, 10);
    if (isNaN(val)) return;
    if (val > 60) this.value = 60;
    else if (val < 0) this.value = 0;
});

// Toggle Pact Options visibility
document.getElementById('maxer-pact-enable').addEventListener('change', function() {
    document.getElementById('maxer-pact-options').style.display = this.checked ? 'block' : 'none';
});

// Theme Swapping Event Listener
document.getElementById('theme-toggle-btn').addEventListener('click', function() {
    const isLight = document.body.classList.toggle('light-mode');
    this.innerText = isLight ? "Dark Mode" : "Light Mode";
    localStorage.setItem('sf_theme_preference', isLight ? 'light' : 'dark');
});
