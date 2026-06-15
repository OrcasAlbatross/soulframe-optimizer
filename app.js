let gameData = {
    armor: [],
    weapons: []
};

async function initializeApp() {
    console.log("Loading live data from Soulframe Wiki...");
    document.getElementById('status-msg').innerText = "Fetching live data from the wiki...";

    try {
        // Fetch and parse Armor
        const rawArmor = await fetchWikiModule('Module:Data/Armour', 'sf_raw_armor');
        gameData.armor = parseArmorData(rawArmor);
        sessionStorage.setItem('sf_raw_armor', JSON.stringify(rawArmor)); // Save raw text to cache

        // Fetch and parse Weapons
        const rawWeapons = await fetchWikiModule('Module:Data/Weapons', 'sf_raw_weapons');
        gameData.weapons = parseWeaponData(rawWeapons);
        sessionStorage.setItem('sf_raw_weapons', JSON.stringify(rawWeapons));

        document.getElementById('status-msg').innerText = `Loaded ${gameData.armor.length} Armor pieces and ${gameData.weapons.length} Weapons!`;
        console.log("Data loaded successfully:", gameData);

    } catch (error) {
        console.error("Failed to load data:", error);
        document.getElementById('status-msg').innerText = "Error loading data. Check console.";
    }
}

function runOptimization() {
    const armorList = document.getElementById('armor-results');
    const weaponList = document.getElementById('weapon-results');
    
    armorList.innerHTML = ''; 
    weaponList.innerHTML = '';

    // Test output: show first 5 armors
    gameData.armor.slice(0, 5).forEach(item => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `<strong>${item.name}</strong> (${item.slot}) - Phys: ${item.baseStats.physical}`;
        armorList.appendChild(div);
    });

    // Test output: show first 5 weapons
    gameData.weapons.slice(0, 5).forEach(item => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `<strong>${item.name}</strong> (${item.type}) - Base DMG: ${item.baseAttack}`;
        weaponList.appendChild(div);
    });
}

// Event Listeners
document.getElementById('optimize-btn').addEventListener('click', runOptimization);
window.onload = initializeApp;
