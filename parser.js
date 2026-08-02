const fs = require('fs');
const path = require('path');

// Helper to fetch raw text from MediaWiki API using Node.js native fetch
async function fetchWikiModule(moduleName) {
    console.log(`Fetching ${moduleName} from wiki...`);
    //Yeah yeah, api url here i know
    const apiUrl = `https://wiki.avakot.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${moduleName}&format=json`;
    const response = await fetch(apiUrl);
    const json = await response.json();
    const pages = json.query.pages;
    const pageId = Object.keys(pages)[0];
    return pages[pageId].revisions[0]['*'];
}

// Parses "3 C; 1 S" into an object: { courage: 3, spirit: 1, grace: 0 }
function parsePips(attStr) {
    const res = { courage: 0, spirit: 0, grace: 0 };
    if (!attStr || attStr === "Unknown") return res;
    
    const parts = attStr.split(';');
    for (let p of parts) {
        const match = p.match(/(\d+)\s*([CSG])/i);
        if (match) {
            const val = parseInt(match[1], 10);
            const stat = match[2].toUpperCase();
            if (stat === 'C') res.courage = val;
            if (stat === 'S') res.spirit = val;
            if (stat === 'G') res.grace = val;
        }
    }
    return res;
}

// ARMOR PARSER
function parseArmorData(data) {
    const parsedList = [];
    const itemBlocks = data.split(/\n\s*\["/);
    itemBlocks.shift();

    for (let block of itemBlocks) {
        block = '["' + block;
        const nameMatch = block.match(/\["(.*?)"\]/);
        if (!nameMatch) continue;

        const getString = (key) => {
            const match = block.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
            return match ? match[1] : "Unknown";
        };
        const getNumber = (key) => {
            const match = block.match(new RegExp(`${key}\\s*=\\s*([0-9.]+)`));
            return match ? parseFloat(match[1]) : 0;
        };

        const slot = getString("Slot");
        if (!['Helm', 'Cuirass', 'Leggings'].includes(slot)) continue;

        parsedList.push({
            name: nameMatch[1],
            slot: slot,
            set: getString("ArmorSet"),
            baseStats: {
                physical: getNumber("PhysicalDefence"),
                magick: getNumber("MagickDefence"),
                stability: getNumber("StabilityIncrease")
            },
            requirements: parsePips(getString("VirtueReq")),
            attunement: {
                physical: parsePips(getString("PhysicalAttunement")),
                magick: parsePips(getString("MagickAttunement")),
                stability: parsePips(getString("StabilityAttunement"))
            }
        });
    }
    return parsedList;
}

// WEAPON PARSER
function parseWeaponData(data) {
    const parsedList = [];
    const itemBlocks = data.split(/\n\s*\["/);
    itemBlocks.shift(); 

    for (let block of itemBlocks) {
        block = '["' + block;
        const nameMatch = block.match(/\["(.*?)"\]/);
        if (!nameMatch) continue;

        const getString = (key) => {
            const match = block.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
            return match ? match[1] : "Unknown";
        };
        
        // Custom function to find numbers inside nested Lua tables (e.g. Lvl0 = { Attack = 45 })
        const getNestedNumber = (parentObj, key) => {
            const regex = new RegExp(`${parentObj}\\s*=\\s*\\{[^}]*?${key}\\s*=\\s*(\\d+)`);
            const match = block.match(regex);
            return match ? parseInt(match[1], 10) : 0;
        };

        const lvl0Attack = getNestedNumber("Lvl0", "Attack");
        const lvl30Attack = getNestedNumber("Lvl30", "Attack");
        const damageCap = getNestedNumber("DamageCaps", "LightAttack");

        // Skip unreleased weapons that have no attack stats defined yet
        if (lvl0Attack === 0 && lvl30Attack === 0) continue;

        parsedList.push({
            name: nameMatch[1],
            slot: getString("Slot"), // Weapon or Sidearm
            type: getString("Art"),  // Bow, Shield, Long Blade, etc.
            requirements: parsePips(getString("ReqVirtue")),
            attunement: parsePips(getString("Attunement")),
            baseAttack: lvl0Attack,
            maxAttack: lvl30Attack,
            damageCap: damageCap
        });
    }
    return parsedList;
}

// TALISMAN PARSER
function parseTalismanData(data) {
    const parsedList = [];
    const itemBlocks = data.split(/\n\s*\["/);
    itemBlocks.shift();

    for (let block of itemBlocks) {
        block = '["' + block;
        const nameMatch = block.match(/\["(.*?)"\]/);
        if (!nameMatch) continue;

        const getString = (key) => {
            const match = block.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
            return match ? match[1] : "Unknown";
        };
        const getNumber = (key) => {
            const match = block.match(new RegExp(`${key}\\s*=\\s*([0-9.]+)`));
            return match ? parseFloat(match[1]) : 0;
        };

        const slot = getString("Slot");
        if (slot !== "Talisman") continue;

        parsedList.push({
            name: nameMatch[1],
            slot: slot,
            set: getString("AccessorySet"),
            rarity: getString("Rarity"),
            stats: {
                courage: getNumber("Courage"),
                spirit: getNumber("Spirit"),
                grace: getNumber("Grace")
            }
        });
    }
    return parsedList;
}

async function runScraper() {
    try {
        const rawArmor = await fetchWikiModule('Module:Data/Armour');
        const rawWeapons = await fetchWikiModule('Module:Data/Weapons');

        const armor = parseArmorData(rawArmor);
        const talismans = parseTalismanData(rawArmor);
        const weapons = parseWeaponData(rawWeapons);

        // Ensure data directory exists
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }

        // Save cleanly to JSON files
        fs.writeFileSync(path.join(dataDir, 'armor.json'), JSON.stringify(armor, null, 2));
        fs.writeFileSync(path.join(dataDir, 'talismans.json'), JSON.stringify(talismans, null, 2));
        fs.writeFileSync(path.join(dataDir, 'weapons.json'), JSON.stringify(weapons, null, 2));

        console.log(`Successfully saved ${armor.length} Armor, ${weapons.length} Weapons, and ${talismans.length} Talismans to /data!`);
    } catch (err) {
        console.error("Scraping failed:", err);
        process.exit(1);
    }
}

runScraper();
