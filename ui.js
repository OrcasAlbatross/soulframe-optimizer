/**
 * Soulframe View Engine (ui.js)
 * Purely handles DOM updates, dropdown generation, and HTML rendering.
 */

// Helper to construct a clean, encoded MediaWiki URL from an item name
function getWikiUrl(name) {
    const cleanName = name.replace(/ /g, '_');
    return `https://wiki.avakot.org/wiki/${encodeURIComponent(cleanName)}`;
}

// Dynamically build dropdown filter options from parsed weapon list
function populateFilters() {
    const primaryFilter = document.getElementById('primary-filter');
    const sidearmFilter = document.getElementById('sidearm-filter');

    primaryFilter.innerHTML = '<option value="all">All Primaries</option>';
    sidearmFilter.innerHTML = '<option value="all">All Sidearms</option>';

    const primaryTypes = new Set();
    const sidearmTypes = new Set();

    gameData.weapons.forEach(w => {
        if (w.slot === "Weapon" && w.type) {
            primaryTypes.add(w.type);
        } else if (w.slot === "Sidearm" && w.type) {
            sidearmTypes.add(w.type);
        }
    });

    Array.from(primaryTypes).sort().forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        primaryFilter.appendChild(opt);
    });

    Array.from(sidearmTypes).sort().forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        sidearmFilter.appendChild(opt);
    });
}

// Populate the modal's scrollable list of weapons with search & filter configurations
function populateModalWeapons() {
    const listContainer = document.getElementById('modal-weapon-list');
    const typeFilter = document.getElementById('modal-weapon-type-filter');
    const slotFilter = document.getElementById('modal-weapon-slot-filter');
    const searchVal = document.getElementById('modal-weapon-search').value.toLowerCase().trim();

    listContainer.innerHTML = '';

    // Filter out excluded items and apply filters
    const allowedWeapons = gameData.weapons.filter(w => !excludedItems.has(w.name));

    // Dynamic extraction of unique weapon types to populate the modal's type dropdown
    const uniqueTypes = new Set(allowedWeapons.map(w => w.type).filter(Boolean));
    const currentSelectedType = typeFilter.value;
    
    typeFilter.innerHTML = '<option value="all">All Classes</option>';
    Array.from(uniqueTypes).sort().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeFilter.appendChild(opt);
    });
    typeFilter.value = currentSelectedType; // Preserve selected type across searches

    // Apply search and filter matrices
    let filtered = allowedWeapons;
    if (searchVal) {
        filtered = filtered.filter(w => w.name.toLowerCase().includes(searchVal));
    }
    if (typeFilter.value !== 'all') {
        filtered = filtered.filter(w => w.type === typeFilter.value);
    }
    if (slotFilter.value !== 'all') {
        filtered = filtered.filter(w => w.slot === slotFilter.value);
    }

    // Sort alphabetically
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    // Render Weapon Cards
    filtered.forEach(w => {
        const card = document.createElement('div');
        card.className = 'weapon-card';
        if (selectedMaxerWeapon && selectedMaxerWeapon.name === w.name) {
            card.classList.add('selected');
        }

        const slotLabel = w.slot === "Weapon" ? "Primary" : "Sidearm";
        const reqStr = Object.entries(w.requirements)
            .filter(([_, v]) => v > 0)
            .map(([k, v]) => `${v} ${k.charAt(0).toUpperCase()}`)
            .join(', ') || "None";

        card.innerHTML = `
            <h4>${w.name}</h4>
            <div class="weapon-card-meta">Slot: ${slotLabel} | Class: ${w.type}</div>
            <div class="weapon-card-stats">Base DMG: ${w.baseAttack} | Max DMG: ${w.maxAttack}</div>
            <div class="weapon-card-meta" style="margin-top: 2px;">Wield Reqs: ${reqStr}</div>
        `;

        // Handle card click selection
        card.addEventListener('click', () => {
            selectMaxerWeapon(w);
            closeWeaponSelectorModal();
        });

        listContainer.appendChild(card);
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = '<p class="placeholder-msg" style="grid-column: span 2;">No weapons match your search filters.</p>';
    }
}

// Synchronize state with selection
function selectMaxerWeapon(weapon) {
    selectedMaxerWeapon = weapon;
    const nameLabel = document.getElementById('maxer-selected-weapon-name');
    if (weapon) {
        nameLabel.innerText = weapon.name;
    } else {
        nameLabel.innerText = "None Selected";
    }
}

// Modal open/close actions
function openWeaponSelectorModal() {
    document.getElementById('weapon-modal').classList.add('open');
    populateModalWeapons();
}

function closeWeaponSelectorModal() {
    document.getElementById('weapon-modal').classList.remove('open');
}

// Dynamically build checklists inside the Exclusion Filters tab and bind real-time search
function populateExclusionsUI() {
    const armorList = document.getElementById('armor-exclusion-list');
    const weaponList = document.getElementById('weapon-exclusion-list');
    const talismanList = document.getElementById('talisman-exclusion-list');

    armorList.innerHTML = '';
    weaponList.innerHTML = '';
    talismanList.innerHTML = '';

    const sortedArmor = [...gameData.armor].sort((a, b) => a.name.localeCompare(b.name));
    const sortedWeapons = [...gameData.weapons].sort((a, b) => a.name.localeCompare(b.name));
    const sortedTalismans = [...gameData.talismans].sort((a, b) => a.name.localeCompare(b.name));

    const createCheckbox = (name, container) => {
        const label = document.createElement('label');
        label.className = 'checklist-item';
        
        const isChecked = !excludedItems.has(name);
        
        label.innerHTML = `
            <input type="checkbox" data-name="${name}" ${isChecked ? 'checked' : ''}>
            <span>${name}</span>
        `;

        label.querySelector('input').addEventListener('change', function() {
            if (this.checked) {
                excludedItems.delete(name);
            } else {
                excludedItems.add(name);
            }
        });

        container.appendChild(label);
    };

    sortedArmor.forEach(item => createCheckbox(item.name, armorList));
    sortedWeapons.forEach(item => createCheckbox(item.name, weaponList));
    sortedTalismans.forEach(item => createCheckbox(item.name, talismanList));

    document.getElementById('exclusion-search').addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        const items = document.querySelectorAll('.checklist-item');

        items.forEach(item => {
            const name = item.querySelector('span').textContent.toLowerCase();
            if (name.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    });
}

// ----------------------------------------------------------------------
// RENDER VIRTUE ALLOCATOR RESULTS
// ----------------------------------------------------------------------
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
            <p class="border-top-separator">
                <strong>Grand Total Defense Points:</strong> <span class="summary-highlight">${grandTotal}</span>
            </p>
        </div>
    `;

    const renderOptimalItem = (item, type) => {
        const reqMetText = item.calculated.requirementsMet ? "" : ` <span class="reqs-not-met">(Reqs Not Met)</span>`;
        const showWeight = item.calculated.weightedTotal !== item.calculated.total;
        const weightText = showWeight ? `, Weighted: ${item.calculated.weightedTotal}` : "";

        return `
            <div class="optimal-item">
                <h4>${type}: <a href="${getWikiUrl(item.piece.name)}" target="_blank" class="wiki-link">${item.piece.name}</a> ${reqMetText}</h4>
                <div class="optimal-stats-breakdown">
                    <span>Phys: ${item.calculated.physical}</span>
                    <span>Mag: ${item.calculated.magick}</span>
                    <span>Stab: ${item.calculated.stability}</span>
                    <span>(Total: ${item.calculated.total}${weightText})</span>
                </div>
            </div>
        `;
    };

    buildHtml += renderOptimalItem(bestHelm, "Helm");
    buildHtml += renderOptimalItem(bestCuirass, "Cuirass");
    buildHtml += renderOptimalItem(bestLeggings, "Leggings");

    // Display Best Primary Weapon
    if (bestPrimary) {
        const reqMetText = bestPrimary.calculated.requirementsMet ? "" : ` <span class="reqs-not-met">(Reqs Not Met)</span>`;
        buildHtml += `
            <div class="optimal-item primary-border">
                <h4>Optimal Primary: <a href="${getWikiUrl(bestPrimary.weapon.name)}" target="_blank" class="wiki-link">${bestPrimary.displayName}</a> ${reqMetText}</h4>
                <p class="description-sub">Damage: <span class="primary-color font-bold">${bestPrimary.calculated.finalDamage}</span> (Base: ${bestPrimary.calculated.baseDamage}, Scaling: +${bestPrimary.calculated.bonusDamage})</p>
                <p class="weapon-tag-sub">Type: ${bestPrimary.weapon.type}</p>
            </div>
        `;
    }

    // Display Best Sidearm
    if (bestSidearm) {
        const reqMetText = bestSidearm.calculated.requirementsMet ? "" : ` <span class="reqs-not-met">(Reqs Not Met)</span>`;
        buildHtml += `
            <div class="optimal-item sidearm-border">
                <h4>Optimal Sidearm: <a href="${getWikiUrl(bestSidearm.weapon.name)}" target="_blank" class="wiki-link">${bestSidearm.displayName}</a> ${reqMetText}</h4>
                <p class="description-sub">Damage: <span class="sidearm-color font-bold">${bestSidearm.calculated.finalDamage}</span> (Base: ${bestSidearm.calculated.baseDamage}, Scaling: +${bestSidearm.calculated.bonusDamage})</p>
                <p class="weapon-tag-sub">Type: ${bestSidearm.weapon.type}</p>
            </div>
        `;
    }

    bestBuildOutput.innerHTML = buildHtml;

    // Render Armour Runner Up helper
    const renderRunnerUpList = (container, list) => {
        container.innerHTML = '';
        list.slice(1, 6).forEach(item => {
            const row = document.createElement('div');
            row.className = 'gear-row';
            const showWeight = item.calculated.weightedTotal !== item.calculated.total;
            const weightText = showWeight ? ` W:${item.calculated.weightedTotal}` : "";

            row.innerHTML = `
                <span class="gear-name"><a href="${getWikiUrl(item.piece.name)}" target="_blank" class="wiki-link">${item.piece.name}</a></span>
                <span class="gear-stats">P:${item.calculated.physical} M:${item.calculated.magick} S:${item.calculated.stability} (T:${item.calculated.total}${weightText})</span>
            `;
            container.appendChild(row);
        });

        // Fallback message if list is empty
        if (container.children.length === 0) {
            container.innerHTML = '<p class="placeholder-msg">No alternative runner-ups available.</p>';
        }
    };

    renderRunnerUpList(helmRunnerUps, helms);
    renderRunnerUpList(cuirassRunnerUps, cuirasses);
    renderRunnerUpList(leggingsRunnerUps, leggings);

    // Render Weapon lists helper
    const renderWeaponList = (container, list, highlightClass) => {
        container.innerHTML = '';
        list.forEach(item => {
            const row = document.createElement('div');
            row.className = 'gear-row';
            const reqClass = item.calculated.requirementsMet ? "" : "text-strike";
            const bonusText = item.calculated.requirementsMet ? `(+${item.calculated.bonusDamage})` : "(Reqs Not Met)";

            row.innerHTML = `
                <span class="gear-name">
                    <a href="${getWikiUrl(item.weapon.name)}" target="_blank" class="wiki-link ${reqClass}">
                        ${item.displayName}
                    </a>
                    <small class="text-dark-dim">(${item.weapon.type})</small>
                </span>
                <span class="gear-stats">
                    <strong class="${highlightClass}">${item.calculated.finalDamage}</strong> 
                    <small class="text-dim">Base: ${item.calculated.baseDamage} ${bonusText}</small>
                </span>
            `;
            container.appendChild(row);
        });

        if (list.length === 0) {
            container.innerHTML = '<p class="placeholder-msg">No weapons found for active filters.</p>';
        }
    };

    renderWeaponList(primaryRankings, primaries, "primary-color");
    renderWeaponList(sidearmRankings, sidearms, "sidearm-color");
}

// ----------------------------------------------------------------------
// RENDER STAT MAXER RESULTS
// ----------------------------------------------------------------------
function renderMaxerResults(result, targetObjective) {
    const outputContainer = document.getElementById('maxer-output');
    const rightColumn = document.querySelector('#stat-maxer-tab .alternative-lists');
    
    if (!result) {
        outputContainer.innerHTML = `
            <div class="optimal-item" style="border-left-color: #ff6b6b;">
                <h4 style="color: #ff6b6b;">No Valid Configuration Found</h4>
                <p class="description-sub" style="margin-top: 5px;">
                    Your points pool is too low to satisfy either your minimum thresholds or your selected weapon's wielding requirements.
                </p>
            </div>
        `;
        rightColumn.innerHTML = '<div class="alt-section"><h2>Runner-ups</h2><p class="placeholder-msg">Optimization failed.</p></div>';
        return;
    }

    // --- 1. RENDER MIDDLE COLUMN (OPTIMAL BUILD) ---
    const bestHelm = result.armor.bestHelm;
    const bestCuirass = result.armor.bestCuirass;
    const bestLeggings = result.armor.bestLeggings;

    const grandPhys = bestHelm.calculated.physical + bestCuirass.calculated.physical + bestLeggings.calculated.physical;
    const grandMag = bestHelm.calculated.magick + bestCuirass.calculated.magick + bestLeggings.calculated.magick;
    const grandStab = bestHelm.calculated.stability + bestCuirass.calculated.stability + bestLeggings.calculated.stability;
    const grandTotal = grandPhys + grandMag + grandStab;

    let buildHtml = `
        <div class="virtue-summary-card">
            <h3>Final Combined Virtues</h3>
            <p><strong>Courage:</strong> <span class="summary-highlight">${result.totalStats.courage}</span></p>
            <p><strong>Spirit:</strong> <span class="summary-highlight">${result.totalStats.spirit}</span></p>
            <p><strong>Grace:</strong> <span class="summary-highlight">${result.totalStats.grace}</span></p>
            <p class="border-top-separator" style="font-size: 0.8em; color: #aaa; margin-top: 10px; padding-top: 8px;">
                Allocated Points Spent: <strong>[ C: ${result.allocation.courage} | S: ${result.allocation.spirit} | G: ${result.allocation.grace} ]</strong>
            </p>
        </div>
    `;

    buildHtml += `
        <div class="optimal-item" style="border-left: 3px solid #3498db;">
            <h4>Talisman Slot: <a href="${getWikiUrl(result.talisman.name)}" target="_blank" class="wiki-link">${result.talisman.name}</a></h4>
            <p class="description-sub">Stat Bonuses: C:+${result.talisman.stats.courage} | S:+${result.talisman.stats.spirit} | G:+${result.talisman.stats.grace}</p>
        </div>
    `;

    const mainWeaponNameText = result.optimalJoinery.tier > 0 
        ? `${result.weapon.name}: ${result.optimalJoinery.name}`
        : result.weapon.name;

    buildHtml += `
        <div class="optimal-item" style="border-left: 3px solid #82c91e;">
            <h4>Optimized Target Weapon (${result.weapon.slot}): <a href="${getWikiUrl(result.weapon.name)}" target="_blank" class="wiki-link">${mainWeaponNameText}</a></h4>
            <p style="font-size: 0.85em; color: #ccc;">Damage: <span style="color: #82c91e; font-weight: bold;">${result.optimalJoinery.calc.finalDamage}</span> (Base: ${result.optimalJoinery.calc.baseDamage}, Scaling: +${result.optimalJoinery.calc.bonusDamage})</p>
            <p style="font-size: 0.75em; color: #888;">Class: ${result.weapon.type} | Level: 30</p>
        </div>
    `;

    if (result.pairedWeapon) {
        const paired = result.pairedWeapon;
        const pairedWeaponNameText = paired.joineryTier > 0 
            ? `${paired.weapon.name}: ${paired.displayName.split(': ')[1]}`
            : paired.weapon.name;

        buildHtml += `
            <div class="optimal-item" style="border-left: 3px solid #e67e22;">
                <h4>Optimal Paired Secondary (${paired.weapon.slot}): <a href="${getWikiUrl(paired.weapon.name)}" target="_blank" class="wiki-link">${pairedWeaponNameText}</a></h4>
                <p style="font-size: 0.85em; color: #ccc;">Damage: <span style="color: #e67e22; font-weight: bold;">${paired.calculated.finalDamage}</span> (Base: ${paired.calculated.baseDamage}, Scaling: +${paired.calculated.bonusDamage})</p>
                <p style="font-size: 0.75em; color: #888;">Class: ${paired.weapon.type}</p>
            </div>
        `;
    }

    buildHtml += `
        <div class="total-summary-card">
            <h3>Combined Build Defense</h3>
            <p><strong>Physical Defense:</strong> ${grandPhys}</p>
            <p><strong>Magick Defense:</strong> ${grandMag}</p>
            <p><strong>Stability:</strong> ${grandStab}</p>
            <p class="border-top-separator">
                <strong>Grand Total Defense Points:</strong> <span class="summary-highlight">${grandTotal}</span>
            </p>
        </div>
    `;

    const renderOptimalItem = (item, type) => {
        const showWeight = item.calculated.weightedTotal !== item.calculated.total;
        const weightText = showWeight ? `, Weighted: ${item.calculated.weightedTotal}` : "";
        return `
            <div class="optimal-item">
                <h4>${type}: <a href="${getWikiUrl(item.piece.name)}" target="_blank" class="wiki-link">${item.piece.name}</a></h4>
                <div class="optimal-stats-breakdown">
                    <span>Phys: ${item.calculated.physical}</span>
                    <span>Mag: ${item.calculated.magick}</span>
                    <span>Stab: ${item.calculated.stability}</span>
                    <span>(Total: ${item.calculated.total}${weightText})</span>
                </div>
            </div>
        `;
    };

    buildHtml += renderOptimalItem(bestHelm, "Helm");
    buildHtml += renderOptimalItem(bestCuirass, "Cuirass");
    buildHtml += renderOptimalItem(bestLeggings, "Leggings");

    outputContainer.innerHTML = buildHtml;

    // --- 2. RENDER RIGHT COLUMN (RUNNER-UPS DYNAMIC CALCULATION) ---
    // Recalculate armors using result.totalStats to get proper runner-ups
    const skewPhys = parseFloat(document.getElementById('maxer-skew-phys').value) || 0;
    const skewMag = parseFloat(document.getElementById('maxer-skew-mag').value) || 0;
    const skewStab = parseFloat(document.getElementById('maxer-skew-stab').value) || 0;

    const allowedArmor = gameData.armor.filter(piece => !excludedItems.has(piece.name));
    const recalculatedArmor = allowedArmor.map(piece => {
        const calc = calculateArmorStats(piece, result.totalStats);
        let w = (calc.physical * skewPhys) + (calc.magick * skewMag) + (calc.stability * skewStab);
        calc.weightedTotal = Math.round(w * 10) / 10;
        return { piece, calculated: calc };
    });

    const helms = recalculatedArmor.filter(i => i.piece.slot === "Helm").sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);
    const cuirasses = recalculatedArmor.filter(i => i.piece.slot === "Cuirass").sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);
    const leggings = recalculatedArmor.filter(i => i.piece.slot === "Leggings").sort((a, b) => b.calculated.weightedTotal - a.calculated.weightedTotal);

    rightColumn.innerHTML = `
        <div class="alt-section">
            <h2>Runner-up Alternatives</h2>
            <p class="joinery-caption" style="margin-bottom: 15px;">Other gear that performs well with these Final Combined Virtues.</p>
            
            <h3>Alternative Helms</h3>
            <div id="maxer-helm-runners" class="list-container"></div>
            
            <h3>Alternative Cuirasses</h3>
            <div id="maxer-cuirass-runners" class="list-container"></div>
            
            <h3>Alternative Leggings</h3>
            <div id="maxer-leggings-runners" class="list-container"></div>
        </div>
    `;

    const renderRunnerUpList = (containerId, list) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        list.slice(1, 6).forEach(item => {
            const row = document.createElement('div');
            row.className = 'gear-row';
            const showW = item.calculated.weightedTotal !== item.calculated.total;
            const wText = showW ? ` W:${item.calculated.weightedTotal}` : "";
            row.innerHTML = `
                <span class="gear-name"><a href="${getWikiUrl(item.piece.name)}" target="_blank" class="wiki-link">${item.piece.name}</a></span>
                <span class="gear-stats">P:${item.calculated.physical} M:${item.calculated.magick} S:${item.calculated.stability} (T:${item.calculated.total}${wText})</span>
            `;
            container.appendChild(row);
        });
    };

    renderRunnerUpList('maxer-helm-runners', helms);
    renderRunnerUpList('maxer-cuirass-runners', cuirasses);
    renderRunnerUpList('maxer-leggings-runners', leggings);
}