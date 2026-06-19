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

// Render computed optimization statistics to the DOM
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
