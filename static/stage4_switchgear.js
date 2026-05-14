// ==================================================================
//  stage3.js - Electrical BoQ (Hybrid: Fixed + Dynamic + Editable)
// ==================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadStage3Materials();
    initStage3OverrideTracking();
    autoPopulateStage3FromDesign();
    // Calculate initial totals immediately to account for fixed rows
    setTimeout(calculateGrandTotal, 500);
});

function safeNum(val, fallback = 0) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback;
}

const SWITCHGEAR_DIM = {
    'NB1 DC': 73,
    'DS50PV-1000/51': 54,
    'DS440': 36,
    'HP10M20': 11,
    'AC MCB': 36
};

const JB_CATALOG = [
    { model: 'MI0100', length: 238 },
    { model: 'MI0200', length: 238 },
    { model: 'MI0400', length: 238 },
    { model: 'MI0300', length: 275 },
    { model: 'MI0600', length: 538 },
    { model: 'MI0800', length: 538 }
];

const STAGE3_OVERRIDE_KEYS = [
    'qty_dc_mcb', 'size_dc_mcb', 'qty_dc_fuse', 'qty_dc_spd', 'qty_dc_cable',
    'qty_ac_mcb', 'size_ac_mcb', 'qty_ac_elcb', 'size_ac_elcb', 'qty_ac_spd',
    'qty_ac_cable', 'size_ac_cable'
];

function setIfExists(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
}

function setQtyIfExists(id, value) {
    const el = document.getElementById(`qty_${id}`);
    if (!el) return;
    el.value = safeNum(value, 0);
    if (typeof calcRowTotal === 'function') calcRowTotal(id);
}

function getOverrideMap() {
    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage3Computed) window.projectData.stage3Computed = {};
    if (!window.projectData.stage3Computed.overrideMap) window.projectData.stage3Computed.overrideMap = {};
    return window.projectData.stage3Computed.overrideMap;
}

function isOverridden(key) {
    return !!getOverrideMap()[key]?.is_overridden;
}

function markOverridden(key, manualValue) {
    const map = getOverrideMap();
    map[key] = {
        ...(map[key] || {}),
        manual_value: manualValue,
        is_overridden: true
    };
}

function setAutoFieldValue(key, value) {
    const map = getOverrideMap();
    const el = document.getElementById(key);
    if (!el) return;
    map[key] = { ...(map[key] || {}), auto_value: value };
    if (!isOverridden(key)) {
        el.value = value;
        if (key.startsWith('qty_') && typeof calcRowTotal === 'function') {
            const rowId = key.replace('qty_', '');
            calcRowTotal(rowId);
        }
    }
}

function initStage3OverrideTracking() {
    STAGE3_OVERRIDE_KEYS.forEach(key => {
        const el = document.getElementById(key);
        if (!el) return;
        el.addEventListener('input', () => markOverridden(key, el.value));
        el.addEventListener('change', () => markOverridden(key, el.value));
    });
    const acMcbSel = document.getElementById('sel_ac_mcb');
    if (acMcbSel) acMcbSel.addEventListener('change', () => markOverridden('sel_ac_mcb', acMcbSel.value));
    const acElcbSel = document.getElementById('sel_ac_elcb');
    if (acElcbSel) acElcbSel.addEventListener('change', () => markOverridden('sel_ac_elcb', acElcbSel.value));
}

function parseAmpFromText(text) {
    const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*A\b/i);
    return m ? safeNum(m[1], 0) : 0;
}

function parseSqmm(text) {
    const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(?:sqmm|sq|mm2|mm²)/i);
    return m ? safeNum(m[1], 0) : 0;
}

function estimateCableAmpacity(cableSizeText) {
    const sq = parseSqmm(cableSizeText);
    if (sq <= 0) return 0;
    if (sq <= 4) return 32;
    if (sq <= 6) return 41;
    if (sq <= 10) return 57;
    if (sq <= 16) return 76;
    if (sq <= 25) return 101;
    if (sq <= 35) return 125;
    if (sq <= 50) return 150;
    if (sq <= 70) return 192;
    if (sq <= 95) return 232;
    return 260;
}

function pickSmallestProtectionOption(selectId, requiredAmp) {
    const sel = document.getElementById(selectId);
    if (!sel || !(requiredAmp > 0)) return null;
    let best = null;
    for (let i = 1; i < sel.options.length; i++) {
        const opt = sel.options[i];
        let amp = 0;
        try {
            const item = JSON.parse(opt.value || '{}');
            amp = safeNum(item?.specifications?.rating_amp ?? item?.rating_amp, 0) || parseAmpFromText(item?.name);
        } catch {
            amp = parseAmpFromText(opt.text);
        }
        if (amp >= requiredAmp && (!best || amp < best.amp)) best = { idx: i, amp };
    }
    return best;
}

function showStage3Warnings(messages) {
    const uniq = [...new Set((messages || []).filter(Boolean))];
    if (uniq.length === 0) return;
    const msg = uniq.join('\n');
    if (typeof window.showToast === 'function') {
        window.showToast(msg, 'warning', 6000);
    } else {
        console.warn('Stage 3 validation warnings:', msg);
    }
}

function getStage3DerivedInputs() {
    const s1 = window.projectData?.stage1 || {};
    const s2 = window.projectData?.strings || {};
    const stage2 = window.projectData?.stage2 || {};
    const trackers = Array.isArray(s2.trackers) ? s2.trackers : [];
    const multi = Array.isArray(s2.multiInverterDesign) ? s2.multiInverterDesign : [];

    const trackerStrings = trackers.reduce((sum, t) => {
        const qty = safeNum(t?.qty, 1);
        if (qty > 0) return sum + qty;
        const form = String(t?.formation || '');
        const m = form.match(/^\s*(\d+)\s*\*/);
        return sum + (m ? safeNum(m[1], 1) : 1);
    }, 0);
    const stringsParallel = trackerStrings > 0 ? trackerStrings : Math.max(1, safeNum(stage2.trackers?.length, 1));

    const iString =
        safeNum(s2?.stringCurrent, 0) ||
        safeNum(stage2?.stringCurrent, 0) ||
        safeNum(window.projectData?.stage4?.isc, 0) ||
        13.5;

    const inverterCountFromMulti = multi.reduce((sum, unit) => sum + safeNum(unit?.qty, 0), 0);
    const nInverters = Math.max(1, inverterCountFromMulti || safeNum(s2.inverterCount ?? stage2.inverterCount, 1));
    const nMppt = Math.max(1, trackers.length || safeNum(stage2.trackers?.length, 0) || (nInverters * 2));

    const systemType = String(s2.systemType || stage2.systemType || '').toLowerCase();
    const inverterName = String(s2.inverterModel || stage2.inverterModel || '').toLowerCase();
    const optimizerMode = systemType === 'optimizer' && inverterName.includes('solaredge') ? 'SolarEdge' : systemType;

    const totalPanels = safeNum(s1.panelCount ?? stage2.panelCount ?? window.projectData?.design?.panelCount, 0);
    const lPerString = safeNum(s1.meterDistance ?? window.projectData?.site?.meterDistance, 20) || 20;
    const buildingHeight = safeNum(
        s1.site?.location?.floors ?? window.projectData?.site?.location?.floors ?? s1.floors ?? 1,
        1
    ) * 3;
    const jbInputs = 4;

    const acCapKw = safeNum(s2.acCapacity ?? s2.totalAcKw ?? stage2.acCapacity ?? stage2.totalAcKw, 0);
    const phase = String(s1.phase || '').toLowerCase().includes('1') ? 1 : 3;
    const voltage = phase === 1 ? 230 : 415;
    const pf = 0.99;
    const ib = acCapKw > 0 ? ((acCapKw * 1000) / ((phase === 3 ? Math.sqrt(3) : 1) * voltage * pf)) : 0;
    const iFinal = safeNum(window.projectData?.stage4?.mcbRating, 0) || (ib * 1.25);
    const cableSizeFromStage4 = String(window.projectData?.stage4?.cableSize || '').trim();
    const acCableLengthFromStage4 = safeNum(window.projectData?.stage4?.totalLength, 0);

    return {
        stringsParallel,
        iString,
        nInverters,
        nMppt,
        optimizerMode,
        totalPanels,
        iFinal,
        cableSizeFromStage4,
        acCableLengthFromStage4,
        lPerString,
        buildingHeight,
        jbInputs
    };
}

function autoPopulateStage3FromDesign() {
    const d = getStage3DerivedInputs();
    const centralized = d.nInverters <= 1;
    const iDcTotal = d.stringsParallel * d.iString;
    const dcMcbRating = 1.25 * iDcTotal;
    const acMcbRating = d.iFinal;
    const useMccb = acMcbRating > 200;

    // DC side
    setAutoFieldValue('qty_dc_mcb', centralized ? 1 : d.stringsParallel);
    setAutoFieldValue('qty_dc_fuse', d.stringsParallel);
    setAutoFieldValue('qty_dc_spd', d.optimizerMode === 'SolarEdge' ? d.nInverters : d.nMppt);
    setAutoFieldValue('qty_dc_cable', d.stringsParallel * d.lPerString);
    setAutoFieldValue('size_dc_mcb', `${Math.ceil(dcMcbRating)}A min`);

    // AC side
    setAutoFieldValue('qty_ac_mcb', d.nInverters);
    setAutoFieldValue('qty_ac_elcb', d.nInverters);
    setAutoFieldValue('qty_ac_spd', d.nInverters);
    setAutoFieldValue('size_ac_mcb', `${useMccb ? 'MCCB' : 'MCB'} ${Math.ceil(acMcbRating)}A min`);
    setAutoFieldValue('size_ac_elcb', `${Math.ceil(acMcbRating)}A / 30mA`);
    if (d.cableSizeFromStage4) setAutoFieldValue('size_ac_cable', d.cableSizeFromStage4);
    if (d.acCableLengthFromStage4 > 0) setAutoFieldValue('qty_ac_cable', d.acCableLengthFromStage4);

    // Disable fuse for single string as requested.
    const fuseQtyEl = document.getElementById('qty_dc_fuse');
    if (fuseQtyEl) {
        const disableFuse = d.stringsParallel <= 1;
        fuseQtyEl.disabled = disableFuse;
        if (disableFuse && !isOverridden('qty_dc_fuse')) fuseQtyEl.value = 0;
    }

    // Catalog-based minimum spec selection for AC MCB/ELCB.
    const mcbOpt = pickSmallestProtectionOption('sel_ac_mcb', acMcbRating);
    if (mcbOpt && !isOverridden('sel_ac_mcb')) {
        const mcbSel = document.getElementById('sel_ac_mcb');
        if (mcbSel && mcbSel.selectedIndex !== mcbOpt.idx) {
            mcbSel.selectedIndex = mcbOpt.idx;
            if (typeof updateRow === 'function') updateRow('ac_mcb', '');
        }
    }
    const elcbOpt = pickSmallestProtectionOption('sel_ac_elcb', acMcbRating);
    if (elcbOpt && !isOverridden('sel_ac_elcb')) {
        const elcbSel = document.getElementById('sel_ac_elcb');
        if (elcbSel && elcbSel.selectedIndex !== elcbOpt.idx) {
            elcbSel.selectedIndex = elcbOpt.idx;
            if (typeof updateRow === 'function') updateRow('ac_elcb', '');
        }
    }

    // Derived values not rendered as rows are saved for downstream usage.
    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage3Computed) window.projectData.stage3Computed = {};
    window.projectData.stage3Computed = {
        ...window.projectData.stage3Computed,
        inputs: d,
        iDcTotal,
        qtyEarthing: 3,
        earthingStripLength: d.buildingHeight * 3,
        qtyDcJb: Math.ceil(d.stringsParallel / d.jbInputs),
        qtyAcJb: d.nInverters,
        useMccb
    };

    validateStage3Rules({
        requiredDcMcb: dcMcbRating,
        requiredAcMcb: acMcbRating,
        iFinal: d.iFinal,
        voltage: String(window.projectData?.stage1?.phase || '').toLowerCase().includes('1') ? 230 : 415
    });

    autoSizeDbPanels();
}

function validateStage3Rules(ctx) {
    const warnings = [];
    const dcMcbRated = parseAmpFromText(document.getElementById('size_dc_mcb')?.value);
    if (dcMcbRated > 0 && dcMcbRated < safeNum(ctx.requiredDcMcb, 0)) {
        warnings.push(`DC MCB rating ${dcMcbRated}A is below required ${ctx.requiredDcMcb.toFixed(2)}A.`);
    }

    let acMcbRated = 0;
    const acMcbSel = document.getElementById('sel_ac_mcb');
    if (acMcbSel?.value) {
        try {
            const item = JSON.parse(acMcbSel.value);
            acMcbRated = safeNum(item?.specifications?.rating_amp ?? item?.rating_amp, 0) || parseAmpFromText(item?.name);
        } catch {
            acMcbRated = parseAmpFromText(acMcbSel.options[acMcbSel.selectedIndex]?.text || '');
        }
    }
    if (acMcbRated > 0 && acMcbRated < safeNum(ctx.requiredAcMcb, 0)) {
        warnings.push(`AC MCB rating ${acMcbRated}A is below I_final ${ctx.requiredAcMcb.toFixed(2)}A.`);
    }

    const cableSizeText = document.getElementById('size_ac_cable')?.value || '';
    const cableAmp = estimateCableAmpacity(cableSizeText);
    if (cableAmp > 0 && cableAmp < safeNum(ctx.iFinal, 0)) {
        warnings.push(`AC cable estimated ampacity ${cableAmp}A is below I_final ${ctx.iFinal.toFixed(2)}A.`);
    }

    const dcSpdSize = String(document.getElementById('size_dc_spd')?.value || '');
    const dcSpdV = safeNum((dcSpdSize.match(/(\d+)\s*V/i) || [])[1], 0);
    if (dcSpdV > 0 && dcSpdV < safeNum(ctx.voltage, 0)) {
        warnings.push(`DC SPD voltage ${dcSpdV}V is below system voltage ${ctx.voltage}V.`);
    }
    const acSpdSize = String(document.getElementById('size_ac_spd')?.value || '');
    const acSpdV = safeNum((acSpdSize.match(/(\d+)\s*V/i) || [])[1], 0);
    if (acSpdV > 0 && acSpdV < safeNum(ctx.voltage, 0)) {
        warnings.push(`AC SPD voltage ${acSpdV}V is below system voltage ${ctx.voltage}V.`);
    }

    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage3Computed) window.projectData.stage3Computed = {};
    window.projectData.stage3Computed.validation = {
        warnings,
        hasIssues: warnings.length > 0
    };
    showStage3Warnings(warnings);
}

function getQty(rowId) {
    return safeNum(document.getElementById(`qty_${rowId}`)?.value, 0);
}

function calculatePanelSize(components, jbCatalog) {
    let totalLength = 0;
    components.forEach(c => {
        const width = safeNum(SWITCHGEAR_DIM[c.spec], 0);
        totalLength += safeNum(c.qty, 0) * width;
    });

    const finalLength = totalLength * 1.2;
    const selected = (jbCatalog || [])
        .filter(jb => safeNum(jb.length, 0) >= finalLength)
        .sort((a, b) => safeNum(a.length, 0) - safeNum(b.length, 0))[0] || null;

    return { totalLength, finalLength, selectedJb: selected };
}

function syncDbDropdownByModel(selectId, modelName, rowId, targetLen = 0) {
    const sel = document.getElementById(selectId);
    if (!sel || !modelName) return;

    // Pass 1: direct model match in option text.
    for (let i = 1; i < sel.options.length; i++) {
        const optText = String(sel.options[i]?.text || '').toUpperCase();
        if (optText.includes(String(modelName).toUpperCase())) {
            if (sel.selectedIndex !== i) {
                sel.selectedIndex = i;
                if (typeof updateRow === 'function' && rowId) updateRow(rowId, '');
            }
            return;
        }
    }

    // Pass 2: try matching from option JSON name/specs using length hint.
    if (targetLen > 0) {
        for (let i = 1; i < sel.options.length; i++) {
            const raw = sel.options[i]?.value || '';
            let item = null;
            try { item = raw ? JSON.parse(raw) : null; } catch { item = null; }
            if (!item) continue;
            const name = String(item?.name || '').toUpperCase();
            const spec = String(item?.specifications?.size || item?.specifications?.rating || '').toUpperCase();
            const lenTxt = String(targetLen);
            if (name.includes(lenTxt) || spec.includes(lenTxt)) {
                if (sel.selectedIndex !== i) {
                    sel.selectedIndex = i;
                    if (typeof updateRow === 'function' && rowId) updateRow(rowId, '');
                }
                return;
            }
        }
    }
}

function autoSizeDbPanels() {
    const dc = calculatePanelSize(
        [
            { spec: 'NB1 DC', qty: getQty('dc_mcb') },
            { spec: 'HP10M20', qty: getQty('dc_fuse') },
            { spec: 'DS50PV-1000/51', qty: getQty('dc_spd') }
        ],
        JB_CATALOG
    );

    const ac = calculatePanelSize(
        [
            { spec: 'AC MCB', qty: getQty('ac_mcb') },
            { spec: 'DS440', qty: getQty('ac_spd') }
        ],
        JB_CATALOG
    );

    const dcModel = dc.selectedJb?.model || 'Custom';
    const dcLen = dc.selectedJb?.length || Math.ceil(dc.finalLength);
    const acModel = ac.selectedJb?.model || 'Custom';
    const acLen = ac.selectedJb?.length || Math.ceil(ac.finalLength);

    setIfExists('size_dcdb', `${dcModel} (${dcLen} mm)`);
    setIfExists('size_acdb', `${acModel} (${acLen} mm)`);
    syncDbDropdownByModel('sel_dcdb', dcModel, 'dcdb', dcLen);
    syncDbDropdownByModel('sel_acdb', acModel, 'acdb', acLen);

    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage3Computed) window.projectData.stage3Computed = {};
    window.projectData.stage3Computed.panelSizing = {
        dcdb: dc,
        acdb: ac
    };
}

function normalizeCableName(name) {
    return String(name || '')
        .replace(/\s*\(default:.*?\)\s*$/i, '')
        .trim()
        .toLowerCase();
}

function findCableOptionByName(sel, cableName) {
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
        if (normalizeCableName(optionName).includes(needle) || needle.includes(normalizeCableName(optionName))) {
            return i;
        }
    }
    return -1;
}

function normalizeProtectionName(name) {
    return String(name || '')
        .replace(/\s*\(default:.*?\)\s*$/i, '')
        .trim()
        .toLowerCase();
}

function findProtectionOptionByName(sel, itemName) {
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
        if (normalizeProtectionName(optionName).includes(needle) || needle.includes(normalizeProtectionName(optionName))) {
            return i;
        }
    }
    return -1;
}

function syncStage3CableFromState() {
    const sel = document.getElementById('sel_ac_cable');
    if (!sel || sel.options.length <= 1) return;

    const preferred =
        window.projectData?.stage4?.cableSelected ||
        window.projectData?.stage3?.ac?.cable?.item ||
        '';
    if (!preferred) return;

    const idx = findCableOptionByName(sel, preferred);
    if (idx <= 0 || sel.selectedIndex === idx) return;

    sel.selectedIndex = idx;
    if (typeof updateRow === 'function') updateRow('ac_cable', '');
}

function syncStage3CableToStage4(cableName) {
    const s4Sel = document.getElementById('sel_ac_cable_s4');
    if (!s4Sel || !cableName) return;

    const idx = findCableOptionByName(s4Sel, cableName);
    if (idx <= 0 || s4Sel.selectedIndex === idx) return;

    s4Sel.selectedIndex = idx;
    if (typeof calculateEngineering === 'function') calculateEngineering();
}

function syncStage3McbFromState() {
    const sel = document.getElementById('sel_ac_mcb');
    if (!sel || sel.options.length <= 1) return;

    const preferred =
        window.projectData?.stage4?.mcbSelected ||
        window.projectData?.stage3?.ac?.mcb?.item ||
        '';
    if (!preferred) return;

    const idx = findProtectionOptionByName(sel, preferred);
    if (idx <= 0 || sel.selectedIndex === idx) return;

    sel.selectedIndex = idx;
    if (typeof updateRow === 'function') updateRow('ac_mcb', '');
}

function syncStage3McbToStage4(mcbName) {
    const s4Sel = document.getElementById('sel_ac_mcb_s4');
    if (!s4Sel || !mcbName) return;

    const idx = findProtectionOptionByName(s4Sel, mcbName);
    if (idx <= 0 || s4Sel.selectedIndex === idx) return;

    s4Sel.selectedIndex = idx;
    if (typeof calculateEngineering === 'function') calculateEngineering();
}

// Called when tab is switched to Stage 3
function refreshStage3UI() {
    const s1 = window.projectData?.stage1;
    const s2 = window.projectData?.strings;

    if (s1 && s2) {
        // Update Context Header
        document.getElementById('s3_dc_cap').innerText = `${s1.systemSizeKwp.toFixed(2)} kWp`;
        const acCapKw = parseFloat(s2.acCapacity ?? s2.totalAcKw ?? 0) || 0;
        document.getElementById('s3_ac_cap').innerText = `${acCapKw.toFixed(1)} kW`;

        // Approx Short Circuit Current (Placeholder or Calc)
        const isc = 13.5;
        document.getElementById('s3_isc').innerText = `${isc} A`;

        // Set Default Cable Lengths if empty
        const dcCab = document.getElementById('qty_dc_cable');
        const acCab = document.getElementById('qty_ac_cable');
        if (dcCab && !dcCab.value) dcCab.value = 50;
        if (acCab && !acCab.value) acCab.value = 20;

        // Trigger calculation for all rows to ensure totals are fresh
        ['dc_cable', 'dc_mcb', 'dc_fuse', 'dc_spd', 'ac_spd'].forEach(id => {
            const el = document.getElementById(`qty_${id}`);
            if (el) calcRowTotal(id);
        });
        autoPopulateStage3FromDesign();

        // If Stage 4 updated cable, reflect it back when revisiting Stage 3.
        syncStage3CableFromState();
        syncStage3McbFromState();
    }
}

// --- 1. DATA LOADING (Only for Dynamic Dropdowns) ---
async function loadStage3Materials() {
    try {
        const res = await fetch('/procurement/api/get_stage3_materials');
        let data = {};
        if (res.ok) {
            data = await res.json();
        } else {
            throw new Error(`stage3 materials API failed (${res.status})`);
        }

        // Populate only the rows that have Select elements
        populateDropdown('sel_dcdb', data.boxes);
        populateDropdown('sel_acdb', data.boxes);
        populateDropdown('sel_ac_mcb', data.protection_ac);
        populateDropdown('sel_ac_elcb', data.protection_ac);
        populateDropdown('sel_ac_cable', data.cables_ac);
        autoSizeDbPanels();
        syncStage3CableFromState();
        syncStage3McbFromState();

        // Note: DC MCB, Fuse, SPD, Cable & AC SPD are skipped
        // because they are rendered as Fixed Inputs in the HTML.
    } catch (e) {
        console.warn('Stage 3 API failed, trying materials.json fallback', e);
        try {
            const resFallback = await fetch('/materials.json');
            if (!resFallback.ok) throw new Error(`materials.json failed (${resFallback.status})`);
            const materials = await resFallback.json();
            const contains = (text, keyword) => String(text || '').toUpperCase().includes(String(keyword || '').toUpperCase());

            const fallbackData = {
                boxes: (materials || []).filter(m =>
                    contains(m?.category, 'BOX') || contains(m?.category, 'DB') || contains(m?.category, 'ENCLOSURE') ||
                    contains(m?.name, 'DB') || contains(m?.name, 'BOX')
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
                cables_ac: (materials || []).filter(m =>
                    (contains(m?.category, 'CABLE') || contains(m?.category, 'WIRE')) &&
                    (contains(m?.name, 'AC') || contains(m?.name, 'ARM') || contains(m?.name, 'COPPER') || contains(m?.name, 'ALU') || contains(m?.subcategory, 'AC'))
                ),
            };

            populateDropdown('sel_dcdb', fallbackData.boxes);
            populateDropdown('sel_acdb', fallbackData.boxes);
            populateDropdown('sel_ac_mcb', fallbackData.protection_ac);
            populateDropdown('sel_ac_elcb', fallbackData.protection_ac);
            populateDropdown('sel_ac_cable', fallbackData.cables_ac);
            autoSizeDbPanels();
            syncStage3CableFromState();
            syncStage3McbFromState();
        } catch (fallbackErr) {
            console.error('Error loading stage 3 fallback data', fallbackErr);
        }
    }
}

function populateDropdown(elementId, items) {
    const sel = document.getElementById(elementId);
    if (!sel) return; // Guard clause if element is fixed (input) instead of select

    sel.innerHTML = '<option value="">-- Select --</option>';
    (Array.isArray(items) ? items : []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify(item);
        // Display Name + Rate hint
        opt.innerText = `${item.name} (Default: INR ${item.rate})`;
        sel.appendChild(opt);
    });
}

// --- 2. ROW UPDATES (For Dropdowns) ---
window.updateRow = function(rowId, defaultSize) {
    const sel = document.getElementById(`sel_${rowId}`);
    if (!sel || !sel.value) return;

    const item = JSON.parse(sel.value);

    // 1. Update Hidden Rate
    const rate = parseFloat(item.rate) || 0;
    document.getElementById(`rate_${rowId}`).value = rate;

    // 2. Update Size (Priority: DB Spec > DB Name > Default)
    let size = defaultSize;
    if (item.specifications) {
        if (item.specifications.size) size = item.specifications.size;
        else if (item.specifications.rating) size = item.specifications.rating;
    }

    // Only update visual size if DB has specific info, else keep default
    if (size && size !== '-' && size !== '') {
        document.getElementById(`size_${rowId}`).value = size;
    }

    // 3. Recalculate Cost
    calcRowTotal(rowId);

    // Keep AC cable in sync with Stage 4 and state (without waiting for Save).
    if (rowId === 'ac_cable') {
        const cableName = item?.name || sel.options[sel.selectedIndex]?.text || '';
        if (!window.projectData) window.projectData = {};
        if (!window.projectData.stage3) window.projectData.stage3 = {};
        if (!window.projectData.stage3.ac) window.projectData.stage3.ac = {};
        if (!window.projectData.stage3.ac.cable) window.projectData.stage3.ac.cable = {};
        window.projectData.stage3.ac.cable.item = cableName;
        syncStage3CableToStage4(cableName);
    }

    if (rowId === 'ac_mcb') {
        const mcbName = item?.name || sel.options[sel.selectedIndex]?.text || '';
        if (!window.projectData) window.projectData = {};
        if (!window.projectData.stage3) window.projectData.stage3 = {};
        if (!window.projectData.stage3.ac) window.projectData.stage3.ac = {};
        if (!window.projectData.stage3.ac.mcb) window.projectData.stage3.ac.mcb = {};
        window.projectData.stage3.ac.mcb.item = mcbName;
        syncStage3McbToStage4(mcbName);
    }
};

// --- 3. COST CALCULATION ---
// Triggered when Qty changes OR Item is selected
window.calcRowTotal = function(rowId) {
    const qtyInput = document.getElementById(`qty_${rowId}`);
    const rateInput = document.getElementById(`rate_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);

    if (!qtyInput || !rateInput || !costInput) return;

    const qty = parseFloat(qtyInput.value) || 0;
    const rate = parseFloat(rateInput.value) || 0;

    // Auto-calculate Total = Qty * Rate
    const total = qty * rate;
    costInput.value = total.toFixed(2);

    if (['dc_mcb', 'dc_fuse', 'dc_spd', 'ac_mcb', 'ac_spd'].includes(rowId)) {
        autoSizeDbPanels();
    }

    calculateGrandTotal();
};

// Triggered when ANY Cost input changes manually
window.calculateGrandTotal = function() {
    let grandTotal = 0;
    const rows = ['dcdb', 'dc_mcb', 'dc_fuse', 'dc_spd', 'dc_cable', 'acdb', 'ac_mcb', 'ac_elcb', 'ac_spd', 'ac_cable'];

    rows.forEach(id => {
        const el = document.getElementById(`cost_${id}`);
        if (el) {
            // Read value directly to support Manual Overrides
            const val = parseFloat(el.value) || 0;
            grandTotal += val;
        }
    });

    const totalEl = document.getElementById('stage3_grand_total');
    if (totalEl) totalEl.innerText = grandTotal.toLocaleString('en-IN');
};

// --- 4. SAVE DATA ---
window.saveStage3 = function() {
    // Helper to extract data from either Select or Input
    const getData = (id) => {
        const el = document.getElementById(`sel_${id}`);
        let itemText = '-';

        if (el && el.tagName === 'SELECT') {
            itemText = el.options[el.selectedIndex]?.text || '-';
        } else if (el) {
            itemText = el.value;
        } else {
            const fallbackInput = document.getElementById(`item_${id}`);
            itemText = fallbackInput ? fallbackInput.value : '-';
        }

        return {
            item: itemText,
            size: document.getElementById(`size_${id}`).value,
            qty: document.getElementById(`qty_${id}`).value,
            // Critical: Saves the value currently in the box (Manual or Calculated)
            cost: document.getElementById(`cost_${id}`).value
        };
    };

    const totalCostText = document.getElementById('stage3_grand_total')?.innerText || '';
    if (!totalCostText || totalCostText === '0' || totalCostText === '0.00' || totalCostText === '0.0') {
        const allowManualOverride = confirm('Total cost is zero. Continue to next stage with manual override?');
        if (!allowManualOverride) return;
    }

    const data = {
        dc: {
            dcdb: getData('dcdb'),
            mcb: getData('dc_mcb'),
            fuse: getData('dc_fuse'),
            spd: getData('dc_spd'),
            cable: getData('dc_cable')
        },
        ac: {
            acdb: getData('acdb'),
            mcb: getData('ac_mcb'),
            elcb: getData('ac_elcb'),
            spd: getData('ac_spd'),
            cable: getData('ac_cable')
        },
        totalCost: totalCostText,
        computed: window.projectData?.stage3Computed || {}
    };

    // Save to global state
    window.projectData.stage3 = data;

    if (typeof setStageCompletion === 'function') {
        setStageCompletion(3, true);
    }

    // Proceed
    if (typeof switchStage === 'function') switchStage(5);
};
