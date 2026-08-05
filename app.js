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
    console.log("Loading static data JSONs...");
    document.getElementById('status-msg').innerText = "Initializing database...";

    const savedTheme = localStorage.getItem('sf_theme_preference');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('theme-toggle-btn').innerText = "Dark Mode";
    }

    try {
        // Fetch pre-compiled JSONs
        const [armorRes, weaponsRes, talismansRes] = await Promise.all([
            fetch('./data/armor.json'),
            fetch('./data/weapons.json'),
            fetch('./data/talismans.json')
        ]);

        gameData.armor = await armorRes.json();
        gameData.weapons = await weaponsRes.json();
        gameData.talismans = await talismansRes.json();

        populateFilters();
        populateExclusionsUI();
        
        // Find default weapon selection if nothing is currently selected
        const defaultWeapon = gameData.weapons.filter(w => !excludedItems.has(w.name))[0];
        selectMaxerWeapon(defaultWeapon); // Set default weapon in ui.js

        document.getElementById('status-msg').innerText = `Loaded ${gameData.armor.length} Armor, ${gameData.weapons.length} Weapons, and ${gameData.talismans.length} Talismans successfully!`;
        console.log("Data loaded successfully:", gameData);

    } catch (error) {
        console.error("Failed to load data:", error);
        document.getElementById('status-msg').innerText = "Error loading static data. Check browser console.";
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
        
        // External Flat Buffs
        const extC = parseInt(document.getElementById('ext-courage').value, 10) || 0;
        const extS = parseInt(document.getElementById('ext-spirit').value, 10) || 0;
        const extG = parseInt(document.getElementById('ext-grace').value, 10) || 0;
        const extStats = { courage: extC, spirit: extS, grace: extG };

        // Final Target Minimums
        const minC = parseInt(document.getElementById('min-courage').value, 10) || 1;
        const minS = parseInt(document.getElementById('min-spirit').value, 10) || 1;
        const minG = parseInt(document.getElementById('min-grace').value, 10) || 1;
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
            points, minReqs, extStats, targetObjective, selectedMaxerWeapon, allowedTalismans, allowedArmor, maxerSkews, true, pactEnabled, pactPoints, pactPref,
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
    // Gather Status, Elixirs, Quests
    const rank = parseInt(document.getElementById('guided-rank').value, 10) || 1;
    
    const hasCuraidh = document.getElementById('guided-elixir-c').checked;
    const hasDancing = document.getElementById('guided-elixir-s').checked;
    const hasShade = document.getElementById('guided-elixir-g').checked;

    const questWolf = document.getElementById('guided-quest-wolf').value;
    const questBear = document.getElementById('guided-quest-bear').value;

    // Gather Manual Pacts
    const pactC = parseInt(document.getElementById('guided-pact-c').value, 10) || 0;
    const pactS = parseInt(document.getElementById('guided-pact-s').value, 10) || 0;
    const pactG = parseInt(document.getElementById('guided-pact-g').value, 10) || 0;

    // Gather Preferred Minimums and Extras
    const prefC = parseInt(document.getElementById('guided-pref-c').value, 10) || 0;
    const prefS = parseInt(document.getElementById('guided-pref-s').value, 10) || 0;
    const prefG = parseInt(document.getElementById('guided-pref-g').value, 10) || 0;
    
    const extraAny = parseInt(document.getElementById('guided-extra-any').value, 10) || 0;
    const extraC = parseInt(document.getElementById('guided-extra-c').value, 10) || 0;
    const extraS = parseInt(document.getElementById('guided-extra-s').value, 10) || 0;
    const extraG = parseInt(document.getElementById('guided-extra-g').value, 10) || 0;

    // Base Allocable Points
    let totalPoints = 16 + rank + extraAny;

    // Calculate External Buffs (Includes Elixirs, Quests, Manual Pacts, and Extra Virtues)
    let extC = extraC + pactC;
    let extS = extraS + pactS;
    let extG = extraG + pactG;

    if (hasCuraidh) extC += 10;
    if (hasDancing) extS += 10;
    if (hasShade) extG += 10;

    if (questWolf === 'courage') extC += 1;
    else if (questWolf === 'spirit') extS += 1;
    else if (questWolf === 'grace') extG += 1;

    if (questBear === 'courage') extC += 1;
    else if (questBear === 'spirit') extS += 1;
    else if (questBear === 'grace') extG += 1;

    // Inject calculated values directly into the side-panel UI Input Boxes!
    document.getElementById('maxer-points').value = totalPoints;
    
    document.getElementById('ext-courage').value = extC; //  Updates Extra C UI Box
    document.getElementById('ext-spirit').value = extS;   // Updates Extra S UI Box
    document.getElementById('ext-grace').value = extG;    // Updates Extra G UI Box

    document.getElementById('min-courage').value = Math.max(1, prefC);
    document.getElementById('min-spirit').value = Math.max(1, prefS);
    document.getElementById('min-grace').value = Math.max(1, prefG);

    // Toggle setup flag
    guidedSetupPerformed = true;

    // Hide the setup warning instantly since values were successfully calculated
    document.getElementById('maxer-warning-msg').style.display = 'none';

    // Auto-disable dynamic pacts if manual pact nodes were selected
    if (pactC > 0 || pactS > 0 || pactG > 0) {
        const pactCheckbox = document.getElementById('maxer-pact-enable');
        pactCheckbox.checked = false;
        // Trigger the change event so the UI hides the box
        pactCheckbox.dispatchEvent(new Event('change'));
    }

    // Flash UI fields to visually confirm the update
    const inputsToFlash = ['maxer-points', 'ext-courage', 'ext-spirit', 'ext-grace', 'min-courage', 'min-spirit', 'min-grace'];
    inputsToFlash.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.transition = 'background-color 0.35s';
            el.style.backgroundColor = '#1e3040';
            setTimeout(() => el.style.backgroundColor = '', 450);
        }
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
    
    // Include new fields in the lock/unlock array
    const inputs = ['maxer-points', 'ext-courage', 'ext-spirit', 'ext-grace', 'min-courage', 'min-spirit', 'min-grace'];
    
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

// Bulk Exclusion Controls
document.getElementById('disable-all-btn').addEventListener('click', () => {
    // Add every item to the excluded Set
    gameData.armor.forEach(i => excludedItems.add(i.name));
    gameData.weapons.forEach(i => excludedItems.add(i.name));
    gameData.talismans.forEach(i => excludedItems.add(i.name));
    
    populateExclusionsUI(); // Re-render the checkboxes
    document.getElementById('exclusion-search').dispatchEvent(new Event('input')); // Re-apply active search filter
});

document.getElementById('enable-all-btn').addEventListener('click', () => {
    // Clear the excluded Set entirely
    excludedItems.clear();
    
    populateExclusionsUI(); // Re-render the checkboxes
    document.getElementById('exclusion-search').dispatchEvent(new Event('input')); // Re-apply active search filter
});