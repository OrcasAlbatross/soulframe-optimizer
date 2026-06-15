// Generic function to fetch a module from the Wiki and cache it
async function fetchWikiModule(moduleName, cacheKey) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    //Yeah yeah, api url here i know
    const apiUrl = `https://wiki.avakot.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${moduleName}&format=json&origin=*`;
    const response = await fetch(apiUrl);
    const json = await response.json();
    
    const pages = json.query.pages;
    const pageId = Object.keys(pages)[0];
    const rawText = pages[pageId].revisions[0]['*'];
    
    return rawText;
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
    const itemBlocks = data.split(/\n\t*\["/);
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
    const itemBlocks = data.split(/\n\t*\["/);
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

