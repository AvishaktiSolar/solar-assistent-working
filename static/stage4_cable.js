// ==================================================================
//  stage4_cable.js - Engineering Validation & Civil Calculator
//  UPDATED: Enhanced cable sizing with full formula verification
//  Formulas per IEC 60364 / Indian Electrical Code
// ==================================================================

/**
 * FORMULA DOCUMENTATION:
 * 
 * 1. CIRCUIT DEMAND (Input Logic)
 *    Three-Phase Current: I_b = P / (√3 × V × cos(φ))
 *    Single-Phase Current: I_b = P / (V × cos(φ))
 *    Where: P = Power (W), V = Voltage (V), cos(φ) = Power Factor (0.95 solar)
 * 
 * 2. LENGTH CALCULATION (Stage 1)
 *    Total Length: L = (F × H) + R
 *    Where: F = Number of Floors, H = Height per Floor (14m typical)
 *           R = Horizontal Run to Meter (variable input)
 * 
 * 3. VERIFICATION LAYER 1: Ampacity (Thermal)
 *    Required Rated Capacity: I_t ≥ I_b / (C_a × C_g)
 *    Where: C_a = Temp Factor, C_g = Grouping Factor
 *    Status: PASS if item.CCC_Amp ≥ (Ib / (Ca * Cg))
 * 
 * 4. VERIFICATION LAYER 2: Voltage Drop
 *    Phase Factor: √3 for 3-phase, 2 for 1-phase
 *    Voltage Drop: V_d = (Phase Factor × I_b × L × R_ohm_per_km) / 1000
 *    Percentage Drop: % Drop = (V_d / V_system) × 100
 *    Status: PASS if % Drop ≤ 3% (or 2% recommended)
 * 
 * 5. PROTECTION GEAR (MCB/ELCB Selection)
 *    MCB Rating: I_b ≤ I_n ≤ (I_t × Correction Factors)
 *    Standard Rule: Select next standard MCB size ≥ (I_b × 1.25)
 *    ELCB/RCCB: Rating ≥ I_n, Sensitivity 30mA (life safety) or 100mA (fire)
 */

document.addEventListener('DOMContentLoaded', () => {
    loadACCablesS4();
    const autoChk = document.getElementById('s4_auto_coord_chk');
    if (autoChk) {
        const saved = window.projectData?.stage4?.autoCoordination;
        autoChk.checked = saved === undefined ? true : !!saved;
    }

    // Dependency chain: any core input change recalculates engineering instantly.
    [
        's4_voltage', 's4_pf', 's4_floors_disp', 'len_horizontal', 's4_phase', 's4_tot_power'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => calculateEngineering());
    });
});

let s4InverterCatalog = [];
let s4ProtectionCatalog = [];
let s4CableCatalog = [];
const S4_STANDARD_MCB_RATINGS = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
let s4SelectionLock = false;
let s4LastRecommendation = null;

function safeNum(value, fallback = 0) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeCableName(name) {
    return String(name || '')
        .replace(/\s*\(default:.*?\)\s*$/i, '')
        .trim()
        .toLowerCase();
}

function normalizeProtectionName(name) {
    return String(name || '')
        .replace(/\s*\(default:.*?\)\s*$/i, '')
        .trim()
        .toLowerCase();
}

function findCableOptionIndex(sel, cableName) {
    const needle = normalizeCableName(cableName);
    if (!sel || !needle) return -1;

    for (let i = 0; i < sel.options.length; i++) {
        const opt = sel.options[i];
        const raw = opt.value || '';
        let dbName = '';
        if (raw) {
            try {
                dbName = JSON.parse(raw)?.name || '';
            } catch {
                dbName = '';
            }
        }
        const optionName = dbName || opt.text;
        const norm = normalizeCableName(optionName);
        if (norm.includes(needle) || needle.includes(norm)) return i;
    }
    return -1;
}

function findProtectionOptionIndex(sel, itemName) {
    const needle = normalizeProtectionName(itemName);
    if (!sel || !needle) return -1;

    for (let i = 0; i < sel.options.length; i++) {
        const opt = sel.options[i];
        const raw = opt.value || '';
        let dbName = '';
        if (raw) {
            try {
                dbName = JSON.parse(raw)?.name || '';
            } catch {
                dbName = '';
            }
        }
        const optionName = dbName || opt.text;
        const norm = normalizeProtectionName(optionName);
        if (norm.includes(needle) || needle.includes(norm)) return i;
    }
    return -1;
}

function parseProtectionRating(itemOrText) {
    if (!itemOrText) return 0;
    if (typeof itemOrText === 'object') {
        const fromField = safeNum(itemOrText.rating_amp ?? itemOrText?.specifications?.rating_amp, 0);
        if (fromField > 0) return fromField;
        const fromName = parseProtectionRating(itemOrText.name);
        if (fromName > 0) return fromName;
        return 0;
    }
    const txt = String(itemOrText);
    const m = txt.match(/(\d+(?:\.\d+)?)\s*A\b/i);
    return m ? safeNum(m[1], 0) : 0;
}

function isMcbOrMccb(item) {
    const sub = String(item?.subcategory || '').toUpperCase();
    const name = String(item?.name || '').toUpperCase();
    return sub.includes('MCB') || sub.includes('MCCB') || name.includes(' MCB') || name.includes(' MCCB');
}



function getSelectedS4CableDetails() {
    const sel = document.getElementById('sel_ac_cable_s4');
    const fallbackName = sel?.options?.[sel.selectedIndex]?.text || '';
    let item = null;
    if (sel?.value) {
        try {
            item = JSON.parse(sel.value);
        } catch {
            item = null;
        }
    }

    const name = item?.name || fallbackName || '';
    const specs = item?.specifications || {};
    const sizeFromSpec = String(specs.size || specs.rating || '').trim();
    const parsedSq = parseSqmm(name);
    const inferredSize = parsedSq > 0 ? `${parsedSq} sqmm` : '';
    const size = sizeFromSpec || inferredSize || '';
    const rate = safeNum(item?.rate, 0);
    return { name, size, rate };
}

function selectS4CableItem(cableItem) {
    const makeSel = document.getElementById('sel_ac_cable_make_s4');
    const cableSel = document.getElementById('sel_ac_cable_s4');
    if (!cableItem || !cableSel) return false;

    const cableName = cableItem?.name || '';
    const make = getCableMake(cableItem);
    if (makeSel && makeSel.value !== make) {
        makeSel.value = make;
        buildCableSizeDropdown(make, cableName);
    }

    const idx = findCableOptionIndex(cableSel, cableName);
    if (idx <= 0) return false;
    cableSel.selectedIndex = idx;
    return true;
}

function selectS4McbItem(mcbItem) {
    const mcbSel = document.getElementById('sel_ac_mcb_s4');
    if (!mcbItem || !mcbSel) return false;

    const idx = findProtectionOptionIndex(mcbSel, mcbItem?.name || '');
    if (idx <= 0) return false;
    mcbSel.selectedIndex = idx;
    return true;
}

function applyS4Recommendation(recommendation) {
    if (!recommendation) return false;
    const cableOk = selectS4CableItem(recommendation.cableItem);
    const mcbOk = selectS4McbItem(recommendation.mcbItem);
    if (!cableOk || !mcbOk) return false;

    syncStage4CableToStage3();
    syncStage4McbToStage3();
    return true;
}

function parseSqmm(name) {
    const txt = String(name || '').toLowerCase();
    const match = txt.match(/(\d+(?:\.\d+)?)\s*(?:sqmm|sq|mm2|mm²|x)/i);
    return match ? safeNum(match[1], 0) : 0;
}

function normalizePhase(phaseRaw) {
    const p = String(phaseRaw || '').toLowerCase();
    if (p.includes('1') || p.includes('single')) return '1-Phase';
    if (p.includes('3') || p.includes('three')) return '3-Phase';
    return '3-Phase';
}

function inferPhaseFromBills(consumption) {
    const bills = consumption?.bills;
    if (!Array.isArray(bills) || bills.length === 0) return '';
    for (const bill of bills) {
        const phaseText = String(bill?.phase_type || '').toLowerCase();
        if (phaseText.includes('single') || phaseText.includes('1')) return '1-Phase';
        if (phaseText.includes('three') || phaseText.includes('3')) return '3-Phase';
    }
    return '';
}

function getPhaseFactors(phaseRaw) {
    const phase = normalizePhase(phaseRaw);
    return {
        phase,
        currentDenom: phase === '3-Phase' ? Math.sqrt(3) : 1,
        vdropFactor: phase === '3-Phase' ? 1.732 : 2
    };
}

function calcIb(powerKw, voltage, pf, phaseRaw) {
    const factors = getPhaseFactors(phaseRaw);
    const denom = factors.currentDenom * voltage * pf;
    if (denom <= 0) return 0;
    return (powerKw * 1000) / denom;
}

function dcPower(panelCount, panelWattage) {
    return safeNum(panelCount, 0) * safeNum(panelWattage, 0);
}

function requiredMcbCurrent(iMax) {
    return safeNum(iMax, 0) * 1.25;
}





function validateEngineeringInputs(powerKw, cableLength, phaseRaw, voltage, pf) {
    const alerts = [];
    if (!(safeNum(powerKw, 0) > 0)) alerts.push('Invalid inverter capacity / total power.');
    if (!(safeNum(cableLength, 0) > 0)) alerts.push('Cable length cannot be zero.');
    const p = normalizePhase(phaseRaw);
    if (!(p === '1-Phase' || p === '3-Phase')) alerts.push('Invalid inverter type/phase.');
    if (!(safeNum(voltage, 0) > 0)) alerts.push('System voltage must be greater than 0.');
    if (!(safeNum(pf, 0) > 0 && safeNum(pf, 0) <= 1)) alerts.push('Power factor must be between 0 and 1.');
    return alerts;
}

function matchInverterByName(name) {
    const needle = String(name || '').trim().toLowerCase();
    if (!needle || !Array.isArray(s4InverterCatalog) || s4InverterCatalog.length === 0) return null;
    const exact = s4InverterCatalog.find(inv => String(inv?.name || '').trim().toLowerCase() === needle);
    if (exact) return exact;
    return s4InverterCatalog.find(inv => String(inv?.name || '').toLowerCase().includes(needle));
}

function resolveInverterFromMaterials(unit) {
    const unitInv = unit?.inverter || {};
    const unitId = unitInv?.id ?? unit?.inverter_id ?? unit?.inverterId;
    const unitName = unitInv?.name || unit?.name || '';

    if (Array.isArray(s4InverterCatalog) && s4InverterCatalog.length > 0) {
        if (unitId !== undefined && unitId !== null) {
            const byId = s4InverterCatalog.find(inv => String(inv?.id) === String(unitId));
            if (byId) return byId;
        }
        const byName = matchInverterByName(unitName);
        if (byName) return byName;
    }
    return null;
}

function getResolvedMultiInverters() {
    const stage2 = window.projectData?.stage2 || {};
    const strings = window.projectData?.strings || {};
    const globalMulti = window.multiInverterDesign;

    const fromStage2 = Array.isArray(stage2.multiInverterDesign) ? stage2.multiInverterDesign : [];
    const fromStrings = Array.isArray(strings.multiInverterDesign) ? strings.multiInverterDesign : [];
    const fromGlobal = Array.isArray(globalMulti) ? globalMulti : [];

    if (fromStage2.length > 0) return fromStage2;
    if (fromStrings.length > 0) return fromStrings;
    if (fromGlobal.length > 0) return fromGlobal;
    return [];
}

function getSiteImax(totalCapKw, voltage, pf, phase) {
    const multi = getResolvedMultiInverters();
    let sumImax = 0;
    let sumKw = 0;
    let breakdown = [];

    // 1. Multiple Inverters Logic (Matches Excel INV 1, INV 2, etc.)
    if (Array.isArray(multi) && multi.length > 0) {
        multi.forEach((unit, idx) => {
            const qty = safeNum(unit?.qty, 1);
            
            // Source inverter electrical specs from materials database
            const materialInv = resolveInverterFromMaterials(unit);
            const specs = materialInv?.specifications || unit?.inverter?.specifications || {};
            
            const acKw = safeNum(specs.ac_power_kw, 0);
            let outI = safeNum(specs.output_current, 0) || safeNum(specs.imax, 0);
            
            // Fallback: If spec sheet doesn't have Imax, calculate it via engineering formula
            if (outI <= 0 && acKw > 0) {
                outI = calcIb(acKw, voltage, pf, phase);
            }

            sumImax += (outI * qty);
            sumKw += (acKw * qty);
            
            breakdown.push({
                label: `INV ${idx + 1}`,
                name: unit?.inverter?.name || materialInv?.name || 'Generic Inverter',
                qty: qty,
                kw: acKw,
                imax: outI
            });
        });
        
        return { 
            iMax: sumImax, 
            totalKw: sumKw, 
            breakdown: breakdown, 
            source: 'specs-multi' 
        };
    }

    // 2. Single Inverter Fallback (If no multi-inverters were added)
    const s2 = window.projectData?.strings || {};
    const invCount = parseInt(s2.inverterCount, 10) || 1;
    const model = s2.inverterModel || window.projectData?.stage2?.inverterModel;
    const materialInv = matchInverterByName(model);
    
    let singleAcKw = totalCapKw / invCount;
    let outI = safeNum(materialInv?.specifications?.output_current, 0) || safeNum(materialInv?.specifications?.imax, 0);
    
    // Fallback formula if spec missing
    if (outI <= 0) {
        outI = calcIb(singleAcKw, voltage, pf, phase);
    }

    const fallbackImax = outI * invCount;
    
    return { 
        iMax: fallbackImax > 0 ? fallbackImax : calcIb(totalCapKw, voltage, pf, phase), 
        totalKw: totalCapKw, 
        breakdown: [{ 
            label: 'INV 1', 
            name: model || 'Primary Inverter', 
            qty: invCount, 
            kw: singleAcKw, 
            imax: outI 
        }],
        source: outI > 0 ? 'specs-single' : 'formula' 
    };
}

function getCableProps(item) {
    const name = item?.name || '';
    const specs = item?.specifications || {};
    const make = String(name).split(' ')[0] || 'Generic';

    let rKm = safeNum(specs.resistance, 0);
    let ccc = safeNum(specs.ccc, 0);
    if (rKm > 0 && ccc > 0) return { rKm, ccc, make };

    const sq = parseSqmm(name);
    if (sq >= 50) { rKm = 0.38; ccc = 170; }
    else if (sq >= 35) { rKm = 0.52; ccc = 140; }
    else if (sq >= 25) { rKm = 0.72; ccc = 120; }
    else if (sq >= 16) { rKm = 1.15; ccc = 95; }
    else if (sq >= 10) { rKm = 1.83; ccc = 75; }
    else if (sq >= 6) { rKm = 3.08; ccc = 58; }
    else if (sq > 0) { rKm = 4.61; ccc = 45; }
    else { rKm = 2.44; ccc = 70; }

    const upper = String(name).toUpperCase();
    const isAl = upper.includes(' AL ') || upper.includes('ALUMINIUM') || upper.includes('ARMORED');
    if (isAl) {
        if (sq >= 50) { rKm = 0.82; ccc = 105; }
        else if (sq >= 25) { rKm = 1.54; ccc = 85; }
        else if (sq >= 16) { rKm = 2.44; ccc = 70; }
    }

    return { rKm, ccc, make };
}

function getCableMake(item) {
    const explicit = String(item?.specifications?.make || '').trim();
    if (explicit) return explicit;
    return String(item?.name || '').split(' ')[0] || 'Generic';
}

function getCableSizeText(item) {
    const fromSpec = String(item?.specifications?.size || item?.specifications?.rating || '').trim();
    if (fromSpec) return fromSpec;
    const sq = parseSqmm(item?.name || '');
    return sq > 0 ? `${sq} sqmm` : String(item?.name || '');
}

function buildCableMakeDropdown(selectedMake = '') {
    const makeSel = document.getElementById('sel_ac_cable_make_s4');
    if (!makeSel) return;
    const allMakes = Array.from(new Set((s4CableCatalog || []).map(getCableMake).filter(Boolean))).sort((a, b) => a.localeCompare(b));

    makeSel.innerHTML = '<option value="">-- Select Make --</option>';
    allMakes.forEach(mk => {
        const opt = document.createElement('option');
        opt.value = mk;
        opt.innerText = mk;
        makeSel.appendChild(opt);
    });

    if (selectedMake && allMakes.includes(selectedMake)) {
        makeSel.value = selectedMake;
    } else {
        makeSel.value = '';
    }
}

function buildCableSizeDropdown(selectedMake = '', selectedCableName = '') {
    const sel = document.getElementById('sel_ac_cable_s4');
    if (!sel) return;
    const cables = (s4CableCatalog || []).filter(item => !selectedMake || getCableMake(item) === selectedMake);
    cables.sort((a, b) => parseSqmm(a?.name) - parseSqmm(b?.name));

    sel.innerHTML = '<option value="">-- Select Cable Size --</option>';
    cables.forEach(item => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify(item);
        opt.innerText = `${getCableSizeText(item)} - ${item.name}`;
        sel.appendChild(opt);
    });

    if (selectedCableName) {
        const idx = findCableOptionIndex(sel, selectedCableName);
        if (idx > 0) sel.selectedIndex = idx;
    }
}

window.handleCableMakeChangeS4 = function() {
    const makeSel = document.getElementById('sel_ac_cable_make_s4');
    const autoChk = document.getElementById('s4_auto_coord_chk');
    if (autoChk) autoChk.checked = false;
    const selectedMake = makeSel?.value || '';
    buildCableSizeDropdown(selectedMake, '');
    calculateEngineering();
};

function evaluateCable(item, ctx) {
    const { rKm, ccc } = getCableProps(item);
    const vDrop = (ctx.vdropFactor * ctx.ib * ctx.totalLen * rKm) / 1000;
    const vDropPct = ctx.vSys > 0 ? (vDrop / ctx.vSys) * 100 : 0;
    const pLossPct = ctx.pInvW > 0 ? (((ctx.ib * ctx.ib) * (rKm / 1000) * ctx.totalLen) / ctx.pInvW) * 100 : 0;
    const deratedCCC = ccc * ctx.tf * ctx.gf * ctx.ifac;
    const vdropOk = vDropPct <= ctx.maxVdrop;
    const plossOk = pLossPct < ctx.maxPloss;
    const cccOk = deratedCCC > ctx.safetyCurrent;
    const mcbSelectionOk = ctx.mcb <= 0 || (ctx.mcb >= ctx.mcbMin && ctx.mcb < ccc);
    const finalProtectionOk = ctx.mcb <= 0 || ctx.mcb < deratedCCC;
    const mcbOk = mcbSelectionOk && finalProtectionOk;

    return { vDropPct, pLossPct, deratedCCC, vdropOk, plossOk, cccOk, mcbOk, mcbSelectionOk, finalProtectionOk, ccc };
}

function getCoordinatedRecommendationForRow(row) {
    const cableSel = document.getElementById('sel_ac_cable_s4');
    const mcbSel   = document.getElementById('sel_ac_mcb_s4');
    if (!cableSel || !mcbSel || !row) return null;

    const tf = row.tf, gf = row.gf;

    const mcbCandidates = [];
    for (let i = 1; i < mcbSel.options.length; i++) {
        try {
            const item   = JSON.parse(mcbSel.options[i].value);
            const rating = parseProtectionRating(item);
            if (rating > 0) mcbCandidates.push({ index: i, item, rating });
        } catch { continue; }
    }
    mcbCandidates.sort((a, b) => a.rating - b.rating);

    const cableCandidates = (s4CableCatalog.length > 0 ? s4CableCatalog : [])
        .map(item => ({ item, sq: parseSqmm(item?.name) }))
        .sort((a, b) => (a.sq || 1e9) - (b.sq || 1e9));

    const ctx = {
        totalLen:    row.totalLen,
        ib:          row.ib,
        pInvW:       row.totalKw * 1000,
        vSys:        safeNum(document.getElementById('s4_voltage')?.value, 415),
        vdropFactor: row.vdropFactor,
        maxVdrop:    3,
        maxPloss:    2,
        tf, gf,
        ifac:        1,
        safetyCurrent: row.iFinal,
        mcb:         0,
        mcbMin:      row.iFinal
    };

    for (const cable of cableCandidates) {
        const ev = evaluateCable(cable.item, ctx);
        if (!(ev.cccOk && ev.vdropOk && ev.plossOk)) continue;

        const mcb = mcbCandidates.find(
            m => m.rating >= row.iFinal && m.rating < ev.ccc && m.rating < ev.deratedCCC
        );
        if (!mcb) continue;

        return {
            cableItem:  cable.item,
            cableName:  getCableSizeText(cable.item),
            cableMake:  getCableMake(cable.item),
            mcbItem:    mcb.item,
            mcbName:    mcbSel.options[mcb.index]?.text || mcb.item?.name || '',
            mcbRating:  mcb.rating,
            iBase:      row.ib,
            iFinal:     row.iFinal,
            deratedCCC: ev.deratedCCC,
            vDropPct:   ev.vDropPct,
            pLossPct:   ev.pLossPct
        };
    }
    return null;
}

/**
 * NEW FUNCTION — renders one collapsible card per circuit row into #s4_inverter_list.
 * Each card shows: group label, type badge, Ib, design current,
 *                  cable selection (read-only display), MCB, validation pills.
 */
function renderS4Circuits(rows) {
    const container = document.getElementById('s4_inverter_list');
    if (!container) return;

    if (!rows || rows.length === 0) {
        container.innerHTML = `<div class="s4-empty">No circuit topology loaded from previous stages.</div>`;
        return;
    }

    // Show/hide the topology notice banner
    const banner     = document.getElementById('s4_topo_notice');
    const bannerText = document.getElementById('s4_topo_notice_text');
    if (banner && bannerText) {
        const mergedCount = rows.filter(r => r.type === 'merged').length;
        if (rows.length > 1 || mergedCount > 0) {
            const desc = rows.length === 1
                ? `All inverters are merged onto a single AC bus — one cable run to meter.`
                : `${rows.length} circuits detected from Stage 3 grouping. Each row below is one cable run.`;
            bannerText.textContent = desc;
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }

    // Update circuit count label
    const countLbl = document.getElementById('s4_ckt_count_lbl');
    if (countLbl) countLbl.textContent = `${rows.length} circuit${rows.length !== 1 ? 's' : ''}`;

    // Hide/show the global cable make + cable size + MCB selectors:
    // When there is only 1 circuit, the global selectors drive that circuit directly.
    // When there are multiple circuits, each row manages its own selection (future enhancement
    // — for now, the global selector still sets all rows uniformly, which is common in practice
    // for identical inverters). The user can override per-row in a follow-up version.

    container.innerHTML = rows.map((row, i) => {
        const badgeClass = row.type === 'merged' ? 'merged' : 'single';
        const badgeLabel = row.type === 'merged'
            ? `Merged · ${row.inverters.length} inv`
            : row.type === 'independent' ? 'Independent' : 'Single';

        const invLines = (row.inverters || []).map(inv =>
            `<span>${inv.label}: ${inv.name}${inv.qty > 1 ? ` ×${inv.qty}` : ''} — ${(inv.acKw * (inv.qty || 1)).toFixed(2)} kW</span>`
        ).join('<br>');

        // Validation pills
        const pill = (ok, okTxt, failTxt) =>
            `<span class="status-pill ${ok === null ? 'status-warn' : ok ? 'status-ok' : 'status-fail'}">${ok === null ? '—' : ok ? okTxt : failTxt}</span>`;

        const pillsHtml = row.cableItem
            ? `${pill(row.cccOk,   'CCC OK',    'CCC LO')}
               ${pill(row.vdropOk, 'V-DRP OK',  'V-DRP HI')}
               ${pill(row.plossOk, 'PWR OK',    'PWR HI')}
               ${pill(row.mcbOk,   'MCB OK',    'MCB ERR')}`
            : pill(null, '', 'No cable');

        const vdropDisplay = row.vDropPct !== null
            ? `${row.vDropPct.toFixed(2)} %`
            : '—';
        const cableDisplay = row.cableItem
            ? getCableSizeText(row.cableItem)
            : 'Not selected';
        const mcbDisplay = row.mcbItem
            ? (parseProtectionRating(row.mcbItem) + ' A')
            : '—';

        return `
<div class="s4-ckt" id="ckt_row_${i}" data-row="${i}">
  <div class="s4-ckt-hd">
    <span class="s4-badge ${badgeClass}">${badgeLabel}</span>
    <div class="s4-ckt-meta">
      <strong>${row.label}</strong><br>
      ${invLines}
    </div>
    <span class="s4-ckt-amps">
      I<sub>b</sub> = ${row.ib.toFixed(1)} A<br>
      <small style="font-weight:400;font-size:11px;">Design: ${row.iFinal.toFixed(1)} A</small>
    </span>
  </div>
  <div class="s4-ckt-body">
    <div class="s4g3" style="margin-bottom:8px;">
      <div class="s4f">
        <label>Cable (from global selector)</label>
        <input readonly value="${cableDisplay}" style="background:#f1f5f9;color:#334155;">
      </div>
      <div class="s4f">
        <label>MCB</label>
        <input readonly value="${mcbDisplay}" style="background:#f1f5f9;color:#334155;">
      </div>
      <div class="s4f">
        <label>V-drop</label>
        <input readonly value="${vdropDisplay}" style="background:#f1f5f9;color:${
            row.vDropPct === null ? '#94a3b8' : row.vDropPct > 3 ? '#991b1b' : row.vDropPct > 2 ? '#92400e' : '#065f46'
        };">
      </div>
    </div>
    <div class="s4-ckt-checks">${pillsHtml}</div>
    <div style="display:flex;gap:8px;margin-top:12px;border-top:1px solid #e2e8f0;padding-top:8px;">
      <button class="s4-edit-btn" onclick="alert('Edit circuit ' + ${i})" style="flex:1;padding:6px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;">✎ Edit</button>
      <button class="s4-del-btn" onclick="alert('Remove circuit ' + ${i})" style="flex:1;padding:6px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;">✕ Remove</button>
    </div>
  </div>
</div>`;
    }).join('');
}
// --- 1. LOAD DROPDOWN ---
async function loadACCablesS4() {
    try {
        const [resStage3, resInv] = await Promise.all([
            fetch('/procurement/api/get_stage3_materials'),
            fetch('/procurement/api/get_inverters'),
        ]);
        if (!resStage3.ok) throw new Error(`stage3 materials API failed (${resStage3.status})`);
        const data = await resStage3.json();
        s4InverterCatalog = resInv.ok ? await resInv.json() : [];
        const sel = document.getElementById('sel_ac_cable_s4');
        const makeSel = document.getElementById('sel_ac_cable_make_s4');
        const mcbSel = document.getElementById('sel_ac_mcb_s4');
        const currentVal = sel?.value;
        const currentMakeVal = makeSel?.value;
        const currentMcbVal = mcbSel?.value;
        s4CableCatalog = Array.isArray(data.cables_ac) ? data.cables_ac : [];
        buildCableMakeDropdown(currentMakeVal);
        buildCableSizeDropdown(makeSel?.value || '', '');

        s4ProtectionCatalog = (data.protection_ac || []).filter(isMcbOrMccb);
        if (mcbSel) {
            mcbSel.innerHTML = '<option value="">-- Select AC MCB/MCCB --</option>';
            const byRating = new Map();
            s4ProtectionCatalog.forEach(item => {
                const r = parseProtectionRating(item);
                if (r > 0 && !byRating.has(r)) byRating.set(r, item);
            });
            S4_STANDARD_MCB_RATINGS.forEach(r => {
                const fromMaterials = byRating.get(r);
                const item = fromMaterials || {
                    name: `MCB ${r}A`,
                    category: 'Protection',
                    subcategory: 'AC MCB',
                    rate: 0,
                    specifications: { rating_amp: r }
                };
                const opt = document.createElement('option');
                opt.value = JSON.stringify(item);
                opt.innerText = fromMaterials ? `${item.name} (${r}A)` : `${r}A`;
                mcbSel.appendChild(opt);
            });
        }

        if (currentVal && sel) sel.value = currentVal;
        if (currentMcbVal && mcbSel) mcbSel.value = currentMcbVal;

        const preferred =
            window.projectData?.stage4?.cableSelected ||
            window.projectData?.stage3?.ac?.cable?.item ||
            '';
        if (preferred) syncDropdown(preferred);

        const preferredMcb =
            window.projectData?.stage4?.mcbSelected ||
            window.projectData?.stage3?.ac?.mcb?.item ||
            '';
        if (preferredMcb) syncMcbDropdown(preferredMcb);

        if (typeof refreshStage4UI === 'function') refreshStage4UI();
    } catch (e) {
        console.warn('Stage 4 API failed, trying materials.json fallback', e);
        try {
            const resFallback = await fetch('/materials.json');
            if (!resFallback.ok) throw new Error(`materials.json failed (${resFallback.status})`);
            const materials = await resFallback.json();
            const contains = (text, keyword) => String(text || '').toUpperCase().includes(String(keyword || '').toUpperCase());

            const fallbackData = {
                cables_ac: (materials || []).filter(m =>
                    (contains(m?.category, 'CABLE') || contains(m?.category, 'WIRE')) &&
                    (contains(m?.name, 'AC') || contains(m?.name, 'ARM') || contains(m?.name, 'COPPER') || contains(m?.name, 'ALU') || contains(m?.subcategory, 'AC'))
                ),
                protection_ac: (materials || []).filter(m =>
                    (contains(m?.category, 'PROTECTION') || contains(m?.category, 'SWITCHGEAR') || contains(m?.category, 'BREAKER')) &&
                    (
                        contains(m?.name, 'AC') ||
                        contains(m?.name, 'MCB') ||
                        contains(m?.name, 'MCCB') ||
                        contains(m?.name, 'RCCB') ||
                        contains(m?.name, 'ELCB') ||
                        contains(m?.subcategory, 'AC') ||
                        contains(m?.subcategory, 'MCB') ||
                        contains(m?.subcategory, 'MCCB') ||
                        contains(m?.subcategory, 'RCCB') ||
                        contains(m?.subcategory, 'ELCB')
                    )
                ),
                inverters: (materials || []).filter(m => contains(m?.category, 'INVERTER'))
            };

            s4InverterCatalog = fallbackData.inverters;
            s4CableCatalog = Array.isArray(fallbackData.cables_ac) ? fallbackData.cables_ac : [];
            s4ProtectionCatalog = (fallbackData.protection_ac || []).filter(isMcbOrMccb);

            const sel = document.getElementById('sel_ac_cable_s4');
            const makeSel = document.getElementById('sel_ac_cable_make_s4');
            const mcbSel = document.getElementById('sel_ac_mcb_s4');

            buildCableMakeDropdown(makeSel?.value || '');
            buildCableSizeDropdown(makeSel?.value || '', '');

            if (mcbSel) {
                mcbSel.innerHTML = '<option value="">-- Select AC MCB/MCCB --</option>';
                const byRating = new Map();
                s4ProtectionCatalog.forEach(item => {
                    const r = parseProtectionRating(item);
                    if (r > 0 && !byRating.has(r)) byRating.set(r, item);
                });
                S4_STANDARD_MCB_RATINGS.forEach(r => {
                    const fromMaterials = byRating.get(r);
                    const item = fromMaterials || {
                        name: `MCB ${r}A`,
                        category: 'Protection',
                        subcategory: 'AC MCB',
                        rate: 0,
                        specifications: { rating_amp: r }
                    };
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify(item);
                    opt.innerText = fromMaterials ? `${item.name} (${r}A)` : `${r}A`;
                    mcbSel.appendChild(opt);
                });
            }

            if (typeof refreshStage4UI === 'function') refreshStage4UI();
        } catch (fallbackErr) {
            console.error('Error loading AC cables fallback data', fallbackErr);
        }
    }
}

// --- 2. MAIN REFRESH ---
function refreshStage4UI() {
    const s1root = window.projectData?.stage1 || {};
    const s1 = {
        ...s1root,
        ...(window.projectData?.design || {}),
        ...(window.projectData?.parameters || {}),
        site: s1root.site || window.projectData?.site || {},
        consumption: s1root.consumption || window.projectData?.consumption || {}
    };
    const s2 = window.projectData?.strings || {};
    const stage2 = window.projectData?.stage2 || {};
    const s3 = window.projectData?.stage3 || {};

    if (s1 && s2) {
        // 1. Gather initial electrical properties
        const invModel = s2.inverterModel || stage2.inverterModel || 'Standard Inv';
        const multi = getResolvedMultiInverters();
        
        const totalCapFromMulti = Array.isArray(multi)
            ? multi.reduce((sum, unit) => {
                const specs = unit?.inverter?.specifications || {};
                return sum + (safeNum(specs.ac_power_kw, 0) * safeNum(unit?.qty, 0));
            }, 0)
            : 0;

        const totalCapKw = totalCapFromMulti > 0
            ? totalCapFromMulti
            : safeNum(
                s2.acCapacity ?? s2.totalAcKw ?? stage2.acCapacity ?? stage2.totalAcKw ?? 0,
                0
            );

        const phaseFromBills = inferPhaseFromBills(s1.consumption);
        const phase = normalizePhase(phaseFromBills || s1.phase || s2.phase || s2.inverterPhase);

        // 2. Safely initialize Voltage and Power Factor if empty
        const vInput = document.getElementById('s4_voltage');
        if (vInput && (!vInput.value || safeNum(vInput.value, 0) <= 0)) {
            vInput.value = phase === '1-Phase' ? 230 : 415;
        }
        const pfInput = document.getElementById('s4_pf');
        if (pfInput && (!pfInput.value || safeNum(pfInput.value, 0) <= 0)) {
            pfInput.value = 0.99;
        }

        const voltage = safeNum(document.getElementById('s4_voltage')?.value, phase === '1-Phase' ? 230 : 415);
        const pf = safeNum(document.getElementById('s4_pf')?.value, 0.99);
        
        // 3. Process the Inverter Data exactly like the Excel Sheet
        const siteData = getSiteImax(totalCapKw, voltage, pf, phase);
        const iMax = siteData.iMax;
        const actualTotalKw = siteData.totalKw > 0 ? siteData.totalKw : totalCapKw;


        // 5. Calculate DC Panel Details
        const panelCount = safeNum(s1.panelCount ?? stage2.panelCount ?? window.projectData?.design?.panelCount, 0);
        const panelWattage = safeNum(s1.panelWattage ?? stage2.panelWattage ?? window.projectData?.design?.panelWattage, 0);
        const generatedDcKwp = (panelCount * panelWattage) / 1000;

        // 6. Update all UI elements (Visible and Hidden Data Store fields)
        const updateVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        
        updateVal('s4_inv_model', Array.isArray(multi) && multi.length > 0 ? 'Multi Inverter' : invModel);
        updateVal('s4_inv_cap', actualTotalKw.toFixed(2));
        updateVal('s4_tot_power', actualTotalKw.toFixed(2));
        updateVal('s4_inv_current', iMax.toFixed(2));
        updateVal('s4_safety_current', (iMax * 1.25).toFixed(2)); // Excel Safety Factor mapping
        updateVal('s4_phase', phase);
        updateVal('s4_panel_count', panelCount);
        updateVal('s4_panel_wattage', panelWattage);
        updateVal('s4_dc_capacity', (panelCount * panelWattage).toFixed(0));

        // 7. Persist global project data
        if (!window.projectData.stage4) window.projectData.stage4 = {};
        window.projectData.stage4.panelCountUsed = panelCount;
        window.projectData.stage4.panelWattageUsed = panelWattage;
        window.projectData.stage4.generatedDcKwp = Number.isFinite(generatedDcKwp) ? generatedDcKwp.toFixed(2) : '0.00';
        window.projectData.stage4.inverterAcTotalKw = Number.isFinite(actualTotalKw) ? actualTotalKw.toFixed(2) : '0.00';

        // 8. Lengths & Distances
        const floors = safeNum(
            s1.site?.location?.floors ?? window.projectData?.site?.location?.floors ?? s1.location?.floors ?? s1.floors ?? s1.numFloors,
            1
        );
        updateVal('s4_floors_disp', floors);

        // Populate meter distance from Stage 1 if available
        const lenInput = document.getElementById('len_horizontal');
        if (safeNum(s1.meterDistance, 0) > 0 && lenInput && !lenInput.value) {
            lenInput.value = s1.meterDistance;
        }

        // 9. Sync Dropdowns (Cable & MCB)
        const sel = document.getElementById('sel_ac_cable_s4');
        if (sel && sel.selectedIndex <= 0 && s3.ac && s3.ac.cable) {
            syncDropdown(s3.ac.cable.item);
        }

        const mcbSel = document.getElementById('sel_ac_mcb_s4');
        if (mcbSel && mcbSel.selectedIndex <= 0 && s3.ac?.mcb?.item) {
            syncMcbDropdown(s3.ac.mcb.item);
        }
        
        let mcbVal = null;
        if (mcbSel?.value) {
            try { mcbVal = JSON.parse(mcbSel.value); } catch { mcbVal = null; }
        }
        updateVal('s4_mcb_rating', parseProtectionRating(mcbVal || s3.ac?.mcb?.item || 0));

        // 10. Execute the core math and validations
        calculateEngineering();
        if (typeof calcCivilBlocks === 'function') {
            calcCivilBlocks();
        }
    }
}

function syncDropdown(stage3Name) {
    const sel = document.getElementById('sel_ac_cable_s4');
    const makeSel = document.getElementById('sel_ac_cable_make_s4');
    if (!sel) return false;
    const matched = (s4CableCatalog || []).find(item => normalizeCableName(item?.name).includes(normalizeCableName(stage3Name)));
    if (matched && makeSel) {
        const mk = getCableMake(matched);
        if (mk) {
            makeSel.value = mk;
            buildCableSizeDropdown(mk, stage3Name);
        }
    }
    const idx = findCableOptionIndex(sel, stage3Name);
    if (idx < 0) return false;
    sel.selectedIndex = idx;
    return true;
}

function syncMcbDropdown(stage3Name) {
    const sel = document.getElementById('sel_ac_mcb_s4');
    if (!sel) return false;
    const idx = findProtectionOptionIndex(sel, stage3Name);
    if (idx < 0) return false;
    sel.selectedIndex = idx;
    return true;
}

function syncStage4CableToStage3() {
    const s4Sel = document.getElementById('sel_ac_cable_s4');
    const details = getSelectedS4CableDetails();
    const cableName = details.name;
    if (!cableName) return;

    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage4) window.projectData.stage4 = {};
    window.projectData.stage4.cableSelected = cableName;
    if (details.size) window.projectData.stage4.cableSize = details.size;
    if (details.rate > 0) window.projectData.stage4.cableRate = details.rate;

    if (!window.projectData.stage3) window.projectData.stage3 = {};
    if (!window.projectData.stage3.ac) window.projectData.stage3.ac = {};
    if (!window.projectData.stage3.ac.cable) window.projectData.stage3.ac.cable = {};
    window.projectData.stage3.ac.cable.item = cableName;

    const s3Sel = document.getElementById('sel_ac_cable');
    if (!s3Sel) return;
    const idx = findCableOptionIndex(s3Sel, cableName);
    if (idx <= 0 || s3Sel.selectedIndex === idx) return;
    s3Sel.selectedIndex = idx;
    if (typeof updateRow === 'function') updateRow('ac_cable', '');
}
/**
 * NEW FUNCTION — reads Stage 3 merging/grouping result.
 * Returns an array of circuit groups, where each group = one cable run.
 * 
 * Group shape:
 * {
 *   id: string,           // "group_0", "group_1", etc.
 *   label: string,        // "Circuit 1 (INV 1+2+3)" or "INV 1"
 *   type: 'single'|'merged'|'independent',
 *   inverters: [          // inverters in this group
 *     { label, name, qty, acKw, imax }
 *   ],
 *   totalKw: number,      // sum of ac_power_kw × qty in this group
 *   totalImax: number,    // sum of imax × qty in this group
 * }
 */
function getS3MergingGroups() {
    const s3 = window.projectData?.stage3 || {};
    const stage2 = window.projectData?.stage2 || {};
    const strings = window.projectData?.strings || {};

    // ── Priority 1: Stage 3 explicit merging groups ──────────────────────
    // If Stage 3 stored merging groups (e.g. from an AC combiner panel UI),
    // use those directly.
    const s3Groups = s3.mergingGroups || s3.acGroups || s3.circuitGroups;
    if (Array.isArray(s3Groups) && s3Groups.length > 0) {
        return s3Groups.map((grp, i) => _resolveGroup(grp, i));
    }

    // ── Priority 2: Stage 3 merge flag (all merged into one bus) ─────────
    if (s3.allMerged === true || s3.acBus === 'combined') {
        const multi = getResolvedMultiInverters();
        const totalKw  = multi.reduce((s, u) => s + safeNum(u?.inverter?.specifications?.ac_power_kw, 0) * safeNum(u?.qty, 1), 0);
        const totalAmp = multi.reduce((s, u) => s + safeNum(u?.inverter?.specifications?.output_current, 0) * safeNum(u?.qty, 1), 0);
        return [{
            id: 'group_0',
            label: 'Combined AC bus (all inverters)',
            type: 'merged',
            inverters: _multiToInverterList(multi),
            totalKw,
            totalImax: totalAmp
        }];
    }

    // ── Priority 3: Read multiInverterDesign — find merged chains first
    const multi = getResolvedMultiInverters();
    if (Array.isArray(multi) && multi.length > 0) {
        // Find merged chains first
        const mergedGroups = [];
        const visited = new Set();
        multi.forEach((unit, i) => {
            if (visited.has(unit.id)) return;
            const chain = [unit];
            visited.add(unit.id);
            let changed = true;
            while (changed) {
                changed = false;
                multi.forEach(other => {
                    if (visited.has(other.id)) return;
                    if (chain.some(u => u.mergeWith === other.id || other.mergeWith === u.id)) {
                        chain.push(other); visited.add(other.id); changed = true;
                    }
                });
            }
            const totalKw = chain.reduce((s,u)=>s+safeNum(u?.inverter?.specifications?.ac_power_kw,0)*safeNum(u?.qty,1),0);
            const totalImax = chain.reduce((s,u)=>s+safeNum(u?.inverter?.specifications?.output_current||u?.inverter?.specifications?.imax,0)*safeNum(u?.qty,1),0);
            mergedGroups.push({
                id: `group_${mergedGroups.length}`,
                label: chain.length > 1
                    ? `Circuit ${mergedGroups.length+1} — ${chain.length} inv merged`
                    : (unit?.inverter?.name || `INV ${i+1}`),
                type: chain.length > 1 ? 'merged' : 'independent',
                inverters: chain.map((u,ci) => ({
                    label: `INV ${multi.indexOf(u)+1}`,
                    name: u?.inverter?.name || 'Inverter',
                    qty: safeNum(u?.qty,1),
                    acKw: safeNum(u?.inverter?.specifications?.ac_power_kw,0),
                    imax: safeNum(u?.inverter?.specifications?.output_current||u?.inverter?.specifications?.imax,0)
                })),
                totalKw, totalImax
            });
        });
        return mergedGroups;
    }

    // ── Priority 4: Single inverter fallback ─────────────────────────────
    const phase   = normalizePhase(strings.inverterPhase || stage2.phase || '3-Phase');
    const voltage = safeNum(document.getElementById('s4_voltage')?.value, phase === '1-Phase' ? 230 : 415);
    const pf      = safeNum(document.getElementById('s4_pf')?.value, 0.99);
    const totalKw = safeNum(strings.acCapacity || stage2.acCapacity || 0, 0);
    const model   = strings.inverterModel || stage2.inverterModel || '';
    const matInv  = matchInverterByName(model);
    let outI      = safeNum(matInv?.specifications?.output_current || matInv?.specifications?.imax, 0);
    if (outI <= 0 && totalKw > 0) outI = calcIb(totalKw, voltage, pf, phase);

    return [{
        id: 'group_0',
        label: model ? `${model}` : 'Single inverter circuit',
        type: 'single',
        inverters: [{ label: 'INV 1', name: model || 'Inverter', qty: 1, acKw: totalKw, imax: outI }],
        totalKw,
        totalImax: outI
    }];
}

// ── Internal helpers for getS3MergingGroups ──────────────────────────────

function _resolveGroup(grp, i) {
    const totalKw  = safeNum(grp.totalKw  || grp.total_kw,  0);
    const totalAmp = safeNum(grp.totalAmp || grp.total_amp || grp.imax, 0);
    return {
        id:        grp.id        || `group_${i}`,
        label:     grp.label     || grp.name || `Circuit ${i + 1}`,
        type:      grp.type      || (grp.inverters?.length > 1 ? 'merged' : 'single'),
        inverters: Array.isArray(grp.inverters) ? grp.inverters : [],
        totalKw,
        totalImax: totalAmp
    };
}

function _multiToInverterList(multi) {
    return (multi || []).map((unit, i) => {
        const specs  = unit?.inverter?.specifications || {};
        const matInv = resolveInverterFromMaterials(unit);
        const mSpecs = matInv?.specifications || {};
        return {
            label: `INV ${i + 1}`,
            name:  unit?.inverter?.name || matInv?.name || 'Generic Inverter',
            qty:   safeNum(unit?.qty, 1),
            acKw:  safeNum(specs.ac_power_kw  || mSpecs.ac_power_kw,  0),
            imax:  safeNum(specs.output_current || mSpecs.output_current || specs.imax || mSpecs.imax, 0)
        };
    });
}

function syncStage4McbToStage3() {
    const mcbSel = document.getElementById('sel_ac_mcb_s4');
    if (!mcbSel || !mcbSel.value) return;

    let item = null;
    try {
        item = JSON.parse(mcbSel.value);
    } catch {
        item = null;
    }

    const mcbName = item?.name || mcbSel.options[mcbSel.selectedIndex]?.text || '';
    const mcbRating = parseProtectionRating(item || mcbName);
    if (!mcbName) return;

    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage4) window.projectData.stage4 = {};
    window.projectData.stage4.mcbSelected = mcbName;
    window.projectData.stage4.mcbRating = mcbRating;
    window.projectData.stage4.mcbRate = safeNum(item?.rate, 0);

    if (!window.projectData.stage3) window.projectData.stage3 = {};
    if (!window.projectData.stage3.ac) window.projectData.stage3.ac = {};
    if (!window.projectData.stage3.ac.mcb) window.projectData.stage3.ac.mcb = {};
    window.projectData.stage3.ac.mcb.item = mcbName;

    const s3Sel = document.getElementById('sel_ac_mcb');
    if (!s3Sel) return;
    const idx = findProtectionOptionIndex(s3Sel, mcbName);
    if (idx <= 0 || s3Sel.selectedIndex === idx) return;
    s3Sel.selectedIndex = idx;
    if (typeof updateRow === 'function') updateRow('ac_mcb', '');
}
/**
 * NEW FUNCTION — converts merging groups into calculation-ready circuit rows.
 * Each row is self-contained: has its own Ib, length, cable/MCB selection.
 * 
 * ctx = { voltage, pf, phase, totalLen, tf, gf }
 */
function buildCircuitRows(groups, ctx) {
    const { voltage, pf, phase, totalLen, tf, gf } = ctx;

    return groups.map(grp => {
        // If totalImax is already known from specs, use it directly.
        // Otherwise fall back to calcIb for this group's power.
        let ib = safeNum(grp.totalImax, 0);
        if (ib <= 0 && grp.totalKw > 0) {
            ib = calcIb(grp.totalKw, voltage, pf, phase);
        }
        if (ib <= 0) {
            // Last resort: re-derive from the individual inverters list
            ib = grp.inverters.reduce((sum, inv) => {
                let invI = safeNum(inv.imax, 0);
                if (invI <= 0 && safeNum(inv.acKw, 0) > 0) {
                    invI = calcIb(inv.acKw, voltage, pf, phase);
                }
                return sum + invI * safeNum(inv.qty, 1);
            }, 0);
        }

        const iFinal = ib * 1.25;                 // design current with 25% safety factor
        const { vdropFactor } = getPhaseFactors(phase);

        return {
            ...grp,
            ib,
            iFinal,
            vdropFactor,
            totalLen,
            tf,
            gf,
            // Per-circuit cable/MCB selections — start unset, filled by auto-coord or user
            cableItem:  null,
            mcbItem:    null,
            // Per-circuit validation results — filled by calculateCircuitRow()
            vDropPct:   null,
            pLossPct:   null,
            deratedCCC: null,
            valid:      false
        };
    });
}
/**
 * NEW FUNCTION — runs all electrical checks for a single circuit row.
 * Mutates row in-place and returns it.
 */
function calculateCircuitRow(row) {
    if (!row.cableItem) return row;

    const { rKm, ccc } = getCableProps(row.cableItem);
    const adf         = row.tf * row.gf;
    const deratedCCC  = ccc * adf;
    const vDrop       = (row.vdropFactor * row.ib * row.totalLen * rKm) / 1000;
    const voltage     = safeNum(document.getElementById('s4_voltage')?.value, 415);
    const vDropPct    = voltage > 0 ? (vDrop / voltage) * 100 : 0;
    const pInvW       = row.totalKw * 1000;
    const pLossPct    = pInvW > 0
        ? (((row.ib * row.ib) * (rKm / 1000) * row.totalLen) / pInvW) * 100
        : 0;

    const mcbRating   = parseProtectionRating(row.mcbItem);
    const cccOk       = deratedCCC > row.iFinal;
    const vdropOk     = vDropPct  <= 3.0;
    const plossOk     = pLossPct  <  2.0;
    const mcbSelOk    = mcbRating > 0 && mcbRating >= row.iFinal && mcbRating < ccc;
    const mcbProtOk   = mcbRating > 0 && mcbRating < deratedCCC;
    const mcbOk       = mcbSelOk && mcbProtOk;

    row.rKm        = rKm;
    row.ccc        = ccc;
    row.deratedCCC = deratedCCC;
    row.adf        = adf;
    row.vDropPct   = vDropPct;
    row.pLossPct   = pLossPct;
    row.mcbRating  = mcbRating;
    row.cccOk      = cccOk;
    row.vdropOk    = vdropOk;
    row.plossOk    = plossOk;
    row.mcbOk      = mcbOk;
    row.valid      = !!row.cableItem && !!row.mcbItem && cccOk && vdropOk && plossOk && mcbOk;

    return row;
}

// ==================================================
//  PART A: ELECTRICAL CALCULATION (With Visual Validation)
// ==================================================

// Added manual trigger logic so alerts show up when users click the dropdowns
window.handleManualSelection = function(type = '') {
    const activeId = document.activeElement?.id || '';
    if (type === 'cable' || activeId === 'sel_ac_cable_s4') {
        syncStage4CableToStage3();
    }
    if (type === 'mcb' || activeId === 'sel_ac_mcb_s4') {
        syncStage4McbToStage3();
    }
    calculateEngineering(true);
};
window.calculateEngineering = function(isManualChange = false) {
    const autoChk   = document.getElementById('s4_auto_coord_chk');
    if (isManualChange && autoChk?.checked) autoChk.checked = false;
    const autoCoord = autoChk?.checked !== false;

    // ── 1. DC capacity ────────────────────────────────────────────────────
    const panelCount   = safeNum(document.getElementById('s4_panel_count')?.value, 0);
    const panelWattage = safeNum(document.getElementById('s4_panel_wattage')?.value, 0);
    const dcEl = document.getElementById('s4_dc_capacity');
    if (dcEl) dcEl.value = (panelCount * panelWattage).toFixed(0);

    // ── 2. Length: L = (floors × 4.27) + horizontal ───────────────────────
    const floors  = safeNum(document.getElementById('s4_floors_disp')?.value, 0);
    const horiz   = safeNum(document.getElementById('len_horizontal')?.value, 0);
    const floorH  = 4.27; // Fixed floor height
    const totalLen = floors * floorH + horiz;
    
    const lenTotalEl = document.getElementById('s4_len_total');
    const lenTotalDispEl = document.getElementById('s4_len_total_disp');
    if (lenTotalEl) lenTotalEl.value = totalLen.toFixed(2);
    if (lenTotalDispEl) lenTotalDispEl.textContent = totalLen.toFixed(2);

    // ── 3. Shared derating factors ────────────────────────────────────────
    const phase   = normalizePhase(document.getElementById('s4_phase')?.value);
    const voltage = safeNum(document.getElementById('s4_voltage')?.value, phase === '1-Phase' ? 230 : 415);
    const pf      = safeNum(document.getElementById('s4_pf')?.value, 0.99);
    const tf      = safeNum(document.getElementById('s4_temp_factor')?.value, 1);
    const gf      = safeNum(document.getElementById('s4_group_factor')?.value, 1);

    // ── 4. Build per-circuit rows from Stage 3 topology ───────────────────
    const groups = getS3MergingGroups();
    let rows = buildCircuitRows(groups, { voltage, pf, phase, totalLen, tf, gf });

    // ── 5. Resolve selected cable + MCB from the global selectors ─────────
    let selectedCableItem = null;
    const cableSel = document.getElementById('sel_ac_cable_s4');
    if (cableSel?.value) {
        try { selectedCableItem = JSON.parse(cableSel.value); } catch {}
    }
    let selectedMcbItem = null;
    const mcbSel = document.getElementById('sel_ac_mcb_s4');
    if (mcbSel?.value) {
        try { selectedMcbItem = JSON.parse(mcbSel.value); } catch {}
    }

    // ── 6. Auto-coordination: find the best cable for the WORST row ───────
    
    const worstRow = rows.reduce((prev, cur) => cur.iFinal > prev.iFinal ? cur : prev, rows[0]);
    if (autoCoord && !isManualChange && worstRow) {
        const rec = getCoordinatedRecommendationForRow(worstRow);
        s4LastRecommendation = rec;
        if (rec) {
            if (!s4SelectionLock) {
                s4SelectionLock = true;
                selectS4CableItem(rec.cableItem);
                selectS4McbItem(rec.mcbItem);
                syncStage4CableToStage3();
                syncStage4McbToStage3();
                s4SelectionLock = false;
                // Refresh selectedCableItem / selectedMcbItem after auto-selection
                try { selectedCableItem = JSON.parse(cableSel.value); } catch {}
                try { selectedMcbItem   = JSON.parse(mcbSel.value);   } catch {}
            }
        }
    }

    // ── 7. Assign selected cable+MCB to every row, then calculate ─────────
    rows = rows.map(row => {
        row.cableItem = selectedCableItem;
        row.mcbItem   = selectedMcbItem;
        return calculateCircuitRow(row);
    });

    // ── 8. Render per-circuit cards ────────────────────────────────────────
    renderS4Circuits(rows);

    // ── 9. Aggregate summary (sidebar) — worst case across all rows ────────
    const allValid      = rows.every(r => r.valid);
    const worstVdrop    = rows.reduce((m, r) => Math.max(m, r.vDropPct ?? 0), 0);
    const worstPloss    = rows.reduce((m, r) => Math.max(m, r.pLossPct ?? 0), 0);
    const totalDesignA  = rows.reduce((s, r) => s + (r.iFinal || 0), 0);  // total for meter sizing
    const anyCableSet   = rows.some(r => !!r.cableItem);
    const anyMcbSet     = rows.some(r => !!r.mcbItem);

    const safetyEl = document.getElementById('s4_safety_current');
    if (safetyEl) safetyEl.value = totalDesignA.toFixed(2) + ' A';

    const vdPctEl = document.getElementById('s4_vdrop_pct');
    if (vdPctEl) vdPctEl.value = worstVdrop.toFixed(2) + ' %';

    const pLossEl = document.getElementById('s4_ploss_pct');
    if (pLossEl) pLossEl.value = worstPloss.toFixed(2) + ' %';

    // Sidebar status pills (worst-case)
    const setStat = (id, ok, okTxt, failTxt) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerText = ok ? okTxt : failTxt;
        el.className = `status-pill ${ok ? 'status-ok' : 'status-fail'}`;
    };
    setStat('status_ploss', anyCableSet && rows.every(r => r.plossOk), 'PWR OK', 'PWR HI');
    setStat('status_vdrop', anyCableSet && rows.every(r => r.vdropOk), 'V-DRP OK', 'V-DRP HI');
    setStat('status_ccc',   anyCableSet && rows.every(r => r.cccOk),   'CCC OK',  'CCC LO');
    setStat('status_mcb',   anyMcbSet   && rows.every(r => r.mcbOk),   'MCB OK',  'MCB ERR');

    // Guide message
    const msg    = document.getElementById('cable_guide_msg');
    const fixIcon = document.getElementById('icon_cable_fix');
    if (msg) {
        if (allValid) {
            msg.innerText = autoCoord ? `Auto-paired (${rows.length} circuit${rows.length > 1 ? 's' : ''})` : 'Manual selection compliant';
            msg.style.color = '#15803d';
        } else {
            msg.innerText = anyCableSet ? 'Alert: one or more circuits non-compliant' : 'Select cable and MCB to validate';
            msg.style.color = '#dc2626';
        }
        if (fixIcon) fixIcon.style.display = !allValid && anyCableSet ? 'inline-block' : 'none';
    }

    // ── 10. Persist to projectData ─────────────────────────────────────────
    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage4) window.projectData.stage4 = {};
    window.projectData.stage4.totalLength    = totalLen.toFixed(2);
    window.projectData.stage4.autoCoordination = autoCoord;
    window.projectData.stage4.circuits       = rows.map(r => ({
        id:         r.id,
        label:      r.label,
        type:       r.type,
        ib:         r.ib,
        iFinal:     r.iFinal,
        totalKw:    r.totalKw,
        cableSelected: getCableSizeText(r.cableItem) || '',
        mcbRating:  r.mcbRating || 0,
        vDropPct:   r.vDropPct,
        pLossPct:   r.pLossPct,
        valid:      r.valid
    }));
    window.projectData.stage4.validation = {
        isCompliant:      allValid,
        hasCableSelected: anyCableSet,
        hasMcbSelected:   anyMcbSet,
        isPowerOk:        rows.every(r => r.plossOk),
        isCccOk:          rows.every(r => r.cccOk),
        isMcbOk:          rows.every(r => r.mcbOk),
        isVdropOk:        rows.every(r => r.vdropOk),
        vDropPct:         +worstVdrop.toFixed(2),
        pLossPct:         +worstPloss.toFixed(2),
        safetyCurrent:    +totalDesignA.toFixed(2)
    };
};

// ==================================================
//  PART B: CIVIL & ADHESIVE CALCULATOR
// ==================================================
window.calcCivilBlocks = function() {
    const getEl = (base) => document.getElementById(`${base}_s5`) || document.getElementById(base);

    const count = safeNum(getEl('civil_count')?.value, 0);
    const makeEl = getEl('civil_make');
    const make = makeEl?.value || 'M20';
    const makeRate = safeNum(makeEl?.options?.[makeEl.selectedIndex]?.dataset?.rate, 0);
    const adhKgPerBlock = safeNum(makeEl?.options?.[makeEl.selectedIndex]?.dataset?.adhkg, 0);

    // 1. Block Calc
    const blockCost = count * makeRate;

    // 2. Adhesive Calc
    const adhEl = getEl('adhesive_make');
    const adhSelect = adhEl?.value || 'Sika_150';
    let adhRate = safeNum(adhEl?.options?.[adhEl.selectedIndex]?.dataset?.rate, 0);
    const adhKg = Math.ceil(count * adhKgPerBlock);
    const adhCost = adhKg * adhRate;

    // 3. Total
    const total = blockCost + adhCost;

    // Update UI (Stage 5)
    const blockEl = getEl('res_block_cost');
    const adhQtyEl = getEl('res_adh_qty');
    const adhCostEl = getEl('res_adh_cost');
    const totalEl = getEl('res_civil_total');

    if (blockEl) blockEl.innerText = 'INR ' + Math.round(blockCost).toLocaleString('en-IN');
    if (adhQtyEl) adhQtyEl.innerText = adhKg;
    if (adhCostEl) adhCostEl.innerText = 'INR ' + adhCost.toLocaleString('en-IN');
    if (totalEl) totalEl.innerText = 'INR ' + total.toLocaleString('en-IN');

    // Update BoQ row in Stage 5
    const qtySpan = document.getElementById('qty_civil_found');
    const rateInput = document.getElementById('rate_civil_found');
    const totalCell = document.getElementById('total_civil_found');

    if (qtySpan) qtySpan.innerText = count.toString();
    if (rateInput) {
        const rate = count > 0 ? (total / count) : 0;
        rateInput.value = rate.toFixed(2);
    }
    if (totalCell) totalCell.innerText = total.toLocaleString('en-IN', { maximumFractionDigits: 0 });

    // Persist for downstream use
    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage4) window.projectData.stage4 = {};
    window.projectData.stage4.civil = {
        blocks: count,
        make: make,
        adhesive: adhSelect,
        adhesiveKgPerBlock: adhKgPerBlock,
        totalCost: 'INR ' + total.toLocaleString('en-IN')
    };

    if (typeof calcStage5 === 'function') calcStage5();
};

// --- 4. SAVE ---
window.saveStage4 = function() {
    const sel = document.getElementById('sel_ac_cable_s4');
    const mcbSel = document.getElementById('sel_ac_mcb_s4');
    const getValue = (id, fallback = '') => document.getElementById(id)?.value ?? fallback;
    const cableDetails = getSelectedS4CableDetails();
    const cableName = cableDetails.name || sel?.options?.[sel.selectedIndex]?.text || '';
    let mcbItem = null;
    if (mcbSel?.value) {
        try { mcbItem = JSON.parse(mcbSel.value); } catch { mcbItem = null; }
    }
    const mcbName = mcbItem?.name || mcbSel?.options?.[mcbSel.selectedIndex]?.text || '';
    const mcbRating = parseProtectionRating(mcbItem || mcbName);
    const mcbRate = safeNum(mcbItem?.rate, 0);

    const getEl = (base) => document.getElementById(`${base}_s5`) || document.getElementById(base);
    const civilBlocks = safeNum(getEl('civil_count')?.value, 0);
    const civilAdh = getEl('adhesive_make')?.value || window.projectData?.stage4?.civil?.adhesive || 'Sika_150';
    const civilTotal = getEl('res_civil_total')?.innerText || window.projectData?.stage4?.civil?.totalCost || 'INR 0';

    if (!cableName || !mcbName) {
        alert('Complete Stage 4 inputs before proceeding.');
        return;
    }

    if (typeof calculateEngineering === 'function') calculateEngineering();

    if (window.projectData?.stage4?.validation?.isCompliant === false && s4LastRecommendation) {
        if (applyS4Recommendation(s4LastRecommendation) && typeof calculateEngineering === 'function') {
            calculateEngineering();
        }
    }

    // ── Validation gate — must be BEFORE the data write ──────────────────
    const validation = window.projectData?.stage4?.validation;
    if (validation?.isCompliant === false) {
        const failureReason = [];
        if (!validation?.hasCableSelected) failureReason.push('Cable not selected');
        if (!validation?.hasMcbSelected)   failureReason.push('MCB not selected');
        if (!validation?.isPowerOk)        failureReason.push('Power loss exceeds 2%');
        if (!validation?.isVdropOk)        failureReason.push('Voltage drop exceeds 3%');
        if (!validation?.isCccOk)          failureReason.push('Cable ampacity insufficient');
        if (!validation?.isMcbOk)          failureReason.push('MCB coordination failed');
        alert('Stage 4 is not compliant:\n\n' + failureReason.join('\n') + '\n\nApply the suggested pair or correct the highlighted warnings before proceeding.');
        return;
    }

    // ── Data write — only reached if validation passed ────────────────────
    const existingStage4 = window.projectData.stage4 || {};
    const circuits = window.projectData?.stage4?.circuits || [];

    window.projectData.stage4 = {
        ...existingStage4,
        powerLossPct:  getValue('s4_ploss_pct', '0.00 %'),
        voltageDropPct: getValue('s4_vdrop_pct', '0.00 %'),
        voltageDropV:  getValue('s4_vdrop_v', '0.00 V'),
        requiredIt:    getValue('s4_req_it', '0.00'),
        totalLength:   getValue('s4_len_total', '0'),
        cableSelected: cableName,
        cableSize:     cableDetails.size || '',
        cableRate:     cableDetails.rate || 0,
        mcbSelected:   mcbName,
        mcbRating:     mcbRating,
        mcbRate:       mcbRate,
        circuits,
        civil: {
            blocks:    civilBlocks,
            adhesive:  civilAdh,
            totalCost: civilTotal
        }
    };

    if (!window.projectData.stage3) window.projectData.stage3 = {};
    if (!window.projectData.stage3.ac) window.projectData.stage3.ac = {};
    if (!window.projectData.stage3.ac.cable) window.projectData.stage3.ac.cable = {};
    window.projectData.stage3.ac.cable.item = cableName;
    if (!window.projectData.stage3.ac.mcb) window.projectData.stage3.ac.mcb = {};
    window.projectData.stage3.ac.mcb.item = mcbName;

    if (typeof setStageCompletion === 'function') setStageCompletion(4, true);
    if (typeof switchStage === 'function') switchStage(3);
};

// ==================================================================
//  stage4_cable.js — PATCH: Per-circuit / Global mode toggle
//  Drop these functions in AFTER the existing code (or replace
//  the three functions: setS4CircuitMode, renderS4Circuits,
//  calculateEngineering, and add buildPerCircuitSelectors)
// ==================================================================

// ── State ──────────────────────────────────────────────────────────
// 'global' = one cable+MCB for all | 'per' = each row is independent
let s4CircuitMode = 'global';

// Per-circuit selections keyed by group id: { cableItem, mcbItem }
let s4PerCircuitSelections = {};

// ── Mode toggle ────────────────────────────────────────────────────
window.setS4CircuitMode = function(mode) {
    s4CircuitMode = mode;

    const btnGlobal  = document.getElementById('btn_mode_global');
    const btnPer     = document.getElementById('btn_mode_per');
    const globalWrap = document.getElementById('s4_global_selector_wrap');
    const perHint    = document.getElementById('s4_per_hint');

    if (btnGlobal) btnGlobal.classList.toggle('active', mode === 'global');
    if (btnPer)    btnPer.classList.toggle('active', mode === 'per');

    if (globalWrap) {
        // In per-circuit mode, visually dim the global selectors
        globalWrap.style.opacity  = mode === 'global' ? '1'    : '0.4';
        globalWrap.style.pointerEvents = mode === 'global' ? 'auto' : 'none';
    }
    if (perHint) perHint.style.display = mode === 'per' ? 'flex' : 'none';

    // Uncheck auto-coord when switching to per-circuit (makes no sense there)
    if (mode === 'per') {
        const autoChk = document.getElementById('s4_auto_coord_chk');
        if (autoChk) autoChk.checked = false;
    }

    calculateEngineering();
};

// ── Build per-circuit cable + MCB dropdown HTML ────────────────────
// Returns an HTML string for injection inside each circuit card.
function buildPerCircuitSelectors(rowId, currentCableItem, currentMcbItem) {
    const cableName = currentCableItem ? getCableSizeText(currentCableItem) : '';
    const mcbRating = currentMcbItem   ? parseProtectionRating(currentMcbItem) + ' A' : '';

    // Build cable options
    const cableMakes = Array.from(new Set((s4CableCatalog || []).map(getCableMake).filter(Boolean))).sort();
    const makeOpts   = cableMakes.map(m =>
        `<option value="${m}">${m}</option>`
    ).join('');

    // Determine selected make from currentCableItem
    const selMake = currentCableItem ? getCableMake(currentCableItem) : (cableMakes[0] || '');

    const cablesForMake  = (s4CableCatalog || []).filter(c => getCableMake(c) === selMake);
    const cableSizeOpts = ['<option value="">-- Size --</option>',
        ...cablesForMake.map(c => {
            const val  = JSON.stringify(c).replace(/"/g, '&quot;');
            const txt  = getCableSizeText(c);
            const sel  = (currentCableItem && normalizeCableName(c.name) === normalizeCableName(currentCableItem.name)) ? ' selected' : '';
            return `<option value="${val}"${sel}>${txt}</option>`;
        })
    ].join('');

    // MCB options
    const mcbOpts = ['<option value="">-- MCB --</option>',
        ...S4_STANDARD_MCB_RATINGS.map(r => {
            const fromMaterials = (s4ProtectionCatalog || []).find(i => parseProtectionRating(i) === r);
            const item = fromMaterials || { name: `MCB ${r}A`, category: 'Protection', subcategory: 'AC MCB', rate: 0, specifications: { rating_amp: r } };
            const val  = JSON.stringify(item).replace(/"/g, '&quot;');
            const sel  = currentMcbItem && parseProtectionRating(currentMcbItem) === r ? ' selected' : '';
            const txt  = fromMaterials ? `${item.name} (${r}A)` : `${r}A`;
            return `<option value="${val}"${sel}>${txt}</option>`;
        })
    ].join('');

    return `
    <div class="s4-per-selectors" data-row-id="${rowId}">
      <div class="s4-per-selectors-grid">
        <div class="s4f">
          <label>Cable make</label>
          <select class="s4-per-make" data-row="${rowId}"
                  onchange="handlePerCircuitMakeChange('${rowId}', this)">
            <option value="">-- Make --</option>
            ${makeOpts}
          </select>
        </div>
        <div class="s4f">
          <label>Cable size</label>
          <select class="s4-per-cable" data-row="${rowId}"
                  onchange="handlePerCircuitCableChange('${rowId}', this)">
            ${cableSizeOpts}
          </select>
        </div>
        <div class="s4f">
          <label>MCB / MCCB</label>
          <select class="s4-per-mcb" data-row="${rowId}"
                  onchange="handlePerCircuitMcbChange('${rowId}', this)">
            ${mcbOpts}
          </select>
        </div>
      </div>
      <div class="s4-per-auto-row">
        <label class="s4-toggle" style="padding-top:0;border-top:none;margin-top:0;">
          <input type="checkbox" class="s4-per-auto-chk" data-row="${rowId}"
                 onchange="handlePerCircuitAutoCoord('${rowId}', this)">
          Auto-select best cable for this circuit
        </label>
      </div>
    </div>`;
}

// ── Per-circuit event handlers ──────────────────────────────────────
window.handlePerCircuitMakeChange = function(rowId, sel) {
    const make = sel.value;
    // Rebuild size dropdown for this row
    const sizeEl = document.querySelector(`.s4-per-cable[data-row="${rowId}"]`);
    if (!sizeEl) return;
    const cables = (s4CableCatalog || []).filter(c => getCableMake(c) === make);
    cables.sort((a, b) => parseSqmm(a?.name) - parseSqmm(b?.name));
    sizeEl.innerHTML = '<option value="">-- Size --</option>' + cables.map(c => {
        const val = JSON.stringify(c).replace(/"/g, '&quot;');
        return `<option value="${val}">${getCableSizeText(c)}</option>`;
    }).join('');
    // Clear stored cable for this row
    if (s4PerCircuitSelections[rowId]) s4PerCircuitSelections[rowId].cableItem = null;
    calculateEngineering();
};

window.handlePerCircuitCableChange = function(rowId, sel) {
    let item = null;
    try { item = sel.value ? JSON.parse(sel.value) : null; } catch {}
    if (!s4PerCircuitSelections[rowId]) s4PerCircuitSelections[rowId] = {};
    s4PerCircuitSelections[rowId].cableItem = item;
    // Uncheck auto for this row
    const autoChk = document.querySelector(`.s4-per-auto-chk[data-row="${rowId}"]`);
    if (autoChk) autoChk.checked = false;
    calculateEngineering();
};

window.handlePerCircuitMcbChange = function(rowId, sel) {
    let item = null;
    try { item = sel.value ? JSON.parse(sel.value) : null; } catch {}
    if (!s4PerCircuitSelections[rowId]) s4PerCircuitSelections[rowId] = {};
    s4PerCircuitSelections[rowId].mcbItem = item;
    calculateEngineering();
};

window.handlePerCircuitAutoCoord = function(rowId, chk) {
    // Run auto-coord just for this row's Ib
    if (!chk.checked) return;
    calculateEngineering(); // full recalc picks up the per-row auto flag
};

// ── Updated renderS4Circuits ────────────────────────────────────────
function renderS4Circuits(rows) {
    const container = document.getElementById('s4_inverter_list');
    if (!container) return;

    if (!rows || rows.length === 0) {
        container.innerHTML = `<div class="s4-empty">No circuit topology loaded from previous stages.</div>`;
        return;
    }

    // Topology notice
    const banner     = document.getElementById('s4_topo_notice');
    const bannerText = document.getElementById('s4_topo_notice_text');
    if (banner && bannerText) {
        const mergedCount = rows.filter(r => r.type === 'merged').length;
        if (rows.length > 1 || mergedCount > 0) {
            bannerText.textContent = rows.length === 1
                ? `All inverters are merged onto a single AC bus — one cable run to meter.`
                : `${rows.length} circuits detected from Stage 3 grouping. Each row below is one cable run.`;
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }

    const countLbl = document.getElementById('s4_ckt_count_lbl');
    if (countLbl) countLbl.textContent = `${rows.length} circuit${rows.length !== 1 ? 's' : ''}`;

    // Show per-circuit toggle only when there's more than 1 circuit
    const toggleWrap = document.getElementById('s4_mode_toggle_wrap');
    if (toggleWrap) toggleWrap.style.display = rows.length > 1 ? 'flex' : 'none';

    const isPerMode = s4CircuitMode === 'per';

    container.innerHTML = rows.map((row, i) => {
        const badgeClass = row.type === 'merged' ? 'merged' : 'single';
        const badgeLabel = row.type === 'merged'
            ? `Merged (${row.inverters.length} inv)`
            : row.type === 'independent' ? 'Independent' : 'Single';

        const invLines = (row.inverters || []).map(inv =>
            `<span>${inv.label}: ${inv.name}${inv.qty > 1 ? ` ×${inv.qty}` : ''} — ${(inv.acKw * (inv.qty || 1)).toFixed(2)} kW</span>`
        ).join('<br>');

        // Validation pills
        const pill = (ok, okTxt, failTxt) =>
            `<span class="status-pill ${ok === null ? 'status-warn' : ok ? 'status-ok' : 'status-fail'}">${ok === null ? '—' : ok ? okTxt : failTxt}</span>`;

        const pillsHtml = row.cableItem
            ? `${pill(row.cccOk,   'CCC OK',   'CCC LO')}
               ${pill(row.vdropOk, 'V-DRP OK', 'V-DRP HI')}
               ${pill(row.plossOk, 'PWR OK',   'PWR HI')}
               ${pill(row.mcbOk,   'MCB OK',   'MCB ERR')}`
            : pill(null, '', 'No cable');

        const vdropDisplay = row.vDropPct !== null ? `${row.vDropPct.toFixed(2)} %` : '—';
        const vdropColor   = row.vDropPct === null ? '#94a3b8'
            : row.vDropPct > 3 ? '#991b1b'
            : row.vDropPct > 2 ? '#92400e'
            : '#065f46';

        // In global mode show read-only display; in per-circuit mode show dropdowns
        const cableDisplay = row.cableItem ? getCableSizeText(row.cableItem) : 'Not selected';
        const mcbDisplay   = row.mcbItem ? (parseProtectionRating(row.mcbItem) + ' A') : '—';

        const selectionSection = isPerMode
            ? buildPerCircuitSelectors(row.id, row.cableItem, row.mcbItem)
            : `<div class="s4g3" style="margin-bottom:8px;">
                <div class="s4f">
                  <label>Cable</label>
                  <input readonly value="${cableDisplay}" style="background:#f1f5f9;color:#334155;">
                </div>
                <div class="s4f">
                  <label>MCB</label>
                  <input readonly value="${mcbDisplay}" style="background:#f1f5f9;color:#334155;">
                </div>
                <div class="s4f">
                  <label>V-drop</label>
                  <input readonly value="${vdropDisplay}" style="background:#f1f5f9;color:${vdropColor};">
                </div>
               </div>`;

        // In per-circuit mode always show v-drop separately below
        const vdropRow = isPerMode ? `
            <div class="s4-per-vdrop-row">
              <span class="s4-per-vdrop-label">V-drop</span>
              <span class="s4-per-vdrop-val" style="color:${vdropColor};">${vdropDisplay}</span>
            </div>` : '';

        return `
<div class="s4-ckt${isPerMode ? ' s4-ckt-per' : ''}" id="ckt_row_${i}" data-row="${i}">
  <div class="s4-ckt-hd">
    <span class="s4-badge ${badgeClass}">${badgeLabel}</span>
    <div class="s4-ckt-meta">
      <strong>${row.label}</strong><br>
      ${invLines}
    </div>
    <span class="s4-ckt-amps">
      I<sub>b</sub> = ${row.ib.toFixed(1)} A<br>
      <small style="font-weight:400;font-size:11px;">Design: ${row.iFinal.toFixed(1)} A</small>
    </span>
  </div>
  <div class="s4-ckt-body">
    ${selectionSection}
    ${vdropRow}
    <div class="s4-ckt-checks">${pillsHtml}</div>
  </div>
</div>`;
    }).join('');
}

// ── Updated calculateEngineering ────────────────────────────────────
// Replace the existing window.calculateEngineering with this version.
// Only the cable/MCB resolution block (step 5-7) changes; all other
// logic is identical to the original.
window.calculateEngineering = function(isManualChange = false) {
    const autoChk  = document.getElementById('s4_auto_coord_chk');
    if (isManualChange && autoChk?.checked) autoChk.checked = false;
    const autoCoord = autoChk?.checked !== false;

    // 1. DC capacity
    const panelCount   = safeNum(document.getElementById('s4_panel_count')?.value, 0);
    const panelWattage = safeNum(document.getElementById('s4_panel_wattage')?.value, 0);
    const dcEl = document.getElementById('s4_dc_capacity');
    if (dcEl) dcEl.value = (panelCount * panelWattage).toFixed(0);

    // 2. Length: total = (floors x 4.27 m) + horizontal run
    const floors  = safeNum(document.getElementById('s4_floors_disp')?.value, 0);
    const horiz   = safeNum(document.getElementById('len_horizontal')?.value, 0);
    const totalLen = floors * 4.27 + horiz;
    const lenTotalEl = document.getElementById('s4_len_total');
    const lenTotalDispEl = document.getElementById('s4_len_total_disp');
    if (lenTotalEl) lenTotalEl.value = totalLen.toFixed(2);
    if (lenTotalDispEl) lenTotalDispEl.textContent = totalLen.toFixed(2);

    // 3. Derating factors
    const phase   = normalizePhase(document.getElementById('s4_phase')?.value);
    const voltage = safeNum(document.getElementById('s4_voltage')?.value, phase === '1-Phase' ? 230 : 415);
    const pf      = safeNum(document.getElementById('s4_pf')?.value, 0.99);
    const tf      = safeNum(document.getElementById('s4_temp_factor')?.value, 1);
    const gf      = safeNum(document.getElementById('s4_group_factor')?.value, 1);

    // 4. Build circuit rows from Stage 3 topology
    const groups = getS3MergingGroups();
    let rows = buildCircuitRows(groups, { voltage, pf, phase, totalLen, tf, gf });

    // 5. Resolve cable + MCB — GLOBAL vs PER-CIRCUIT ──────────────────
    const isPerMode = s4CircuitMode === 'per';

    // Global selections (used in global mode or as fallback)
    let globalCableItem = null;
    const cableSel = document.getElementById('sel_ac_cable_s4');
    if (cableSel?.value) { try { globalCableItem = JSON.parse(cableSel.value); } catch {} }
    let globalMcbItem = null;
    const mcbSel = document.getElementById('sel_ac_mcb_s4');
    if (mcbSel?.value) { try { globalMcbItem = JSON.parse(mcbSel.value); } catch {} }

    // 6. Auto-coordination (global mode only, against worst-case row)
    if (!isPerMode && autoCoord && !isManualChange) {
        const worstRow = rows.reduce((prev, cur) => cur.iFinal > prev.iFinal ? cur : prev, rows[0]);
        if (worstRow) {
            const rec = getCoordinatedRecommendationForRow(worstRow);
            s4LastRecommendation = rec;
            if (rec && !s4SelectionLock) {
                s4SelectionLock = true;
                selectS4CableItem(rec.cableItem);
                selectS4McbItem(rec.mcbItem);
                syncStage4CableToStage3();
                syncStage4McbToStage3();
                s4SelectionLock = false;
                try { globalCableItem = JSON.parse(cableSel.value); } catch {}
                try { globalMcbItem   = JSON.parse(mcbSel.value);   } catch {}
            }
        }
    }

    // Per-circuit auto-coord: run independently for each row that has the checkbox ticked
    if (isPerMode) {
        rows.forEach(row => {
            const autoChkRow = document.querySelector(`.s4-per-auto-chk[data-row="${row.id}"]`);
            if (autoChkRow?.checked) {
                const rec = getCoordinatedRecommendationForRow(row);
                if (rec) {
                    if (!s4PerCircuitSelections[row.id]) s4PerCircuitSelections[row.id] = {};
                    s4PerCircuitSelections[row.id].cableItem = rec.cableItem;
                    s4PerCircuitSelections[row.id].mcbItem   = rec.mcbItem;
                }
            }
        });
    }

    // 7. Assign cable + MCB to each row then validate
    rows = rows.map(row => {
        if (isPerMode) {
            const perSel = s4PerCircuitSelections[row.id] || {};
            row.cableItem = perSel.cableItem || null;
            row.mcbItem   = perSel.mcbItem   || null;
        } else {
            row.cableItem = globalCableItem;
            row.mcbItem   = globalMcbItem;
        }
        return calculateCircuitRow(row);
    });

    // 8. Render per-circuit cards
    renderS4Circuits(rows);

    // 9. Sidebar summary (worst-case across all rows)
    const allValid      = rows.every(r => r.valid);
    const worstVdrop    = rows.reduce((m, r) => Math.max(m, r.vDropPct ?? 0), 0);
    const worstPloss    = rows.reduce((m, r) => Math.max(m, r.pLossPct ?? 0), 0);
    const totalDesignA  = rows.reduce((s, r) => s + (r.iFinal || 0), 0);
    const anyCableSet   = rows.some(r => !!r.cableItem);
    const anyMcbSet     = rows.some(r => !!r.mcbItem);

    const safetyEl = document.getElementById('s4_safety_current');
    if (safetyEl) safetyEl.value = totalDesignA.toFixed(2) + ' A';
    const vdPctEl = document.getElementById('s4_vdrop_pct');
    if (vdPctEl) vdPctEl.value = worstVdrop.toFixed(2) + ' %';
    const pLossEl = document.getElementById('s4_ploss_pct');
    if (pLossEl) pLossEl.value = worstPloss.toFixed(2) + ' %';

    const setStat = (id, ok, okTxt, failTxt) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerText = ok ? okTxt : failTxt;
        el.className = `status-pill ${ok ? 'status-ok' : 'status-fail'}`;
    };
    setStat('status_ploss', anyCableSet && rows.every(r => r.plossOk), 'PWR OK',   'PWR HI');
    setStat('status_vdrop', anyCableSet && rows.every(r => r.vdropOk), 'V-DRP OK', 'V-DRP HI');
    setStat('status_ccc',   anyCableSet && rows.every(r => r.cccOk),   'CCC OK',   'CCC LO');
    setStat('status_mcb',   anyMcbSet   && rows.every(r => r.mcbOk),   'MCB OK',   'MCB ERR');

    // Mode label in guide message
    const modeTag = isPerMode ? 'Per-circuit' : (autoCoord ? 'Auto-paired' : 'Manual');
    const msg     = document.getElementById('cable_guide_msg');
    const fixIcon = document.getElementById('icon_cable_fix');
    if (msg) {
        if (allValid) {
            msg.innerText = `${modeTag} (${rows.length} circuit${rows.length > 1 ? 's' : ''})`;
            msg.style.color = '#15803d';
        } else {
            msg.innerText = anyCableSet ? 'Alert: one or more circuits non-compliant' : 'Select cable and MCB to validate';
            msg.style.color = '#dc2626';
        }
        if (fixIcon) fixIcon.style.display = !allValid && anyCableSet ? 'inline-block' : 'none';
    }

    // 10. Persist to projectData
    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage4) window.projectData.stage4 = {};
    window.projectData.stage4.totalLength       = totalLen.toFixed(2);
    window.projectData.stage4.autoCoordination  = autoCoord;
    window.projectData.stage4.circuitMode       = s4CircuitMode;
    window.projectData.stage4.circuits          = rows.map(r => ({
        id:            r.id,
        label:         r.label,
        type:          r.type,
        ib:            r.ib,
        iFinal:        r.iFinal,
        totalKw:       r.totalKw,
        cableSelected: getCableSizeText(r.cableItem) || '',
        mcbRating:     r.mcbRating || 0,
        vDropPct:      r.vDropPct,
        pLossPct:      r.pLossPct,
        valid:         r.valid
    }));
    window.projectData.stage4.validation = {
        isCompliant:      allValid,
        hasCableSelected: anyCableSet,
        hasMcbSelected:   anyMcbSet,
        isPowerOk:        rows.every(r => r.plossOk),
        isCccOk:          rows.every(r => r.cccOk),
        isMcbOk:          rows.every(r => r.mcbOk),
        isVdropOk:        rows.every(r => r.vdropOk),
        vDropPct:         +worstVdrop.toFixed(2),
        pLossPct:         +worstPloss.toFixed(2),
        safetyCurrent:    +totalDesignA.toFixed(2)
    };
};
