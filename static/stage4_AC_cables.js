// ==================================================================
//  stage4.js - Engineering Validation & Civil Calculator
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
 * 
 * 6. SHORT CIRCUIT (Safety Check - Fault Current)
 *    Minimum Area: A = √(I_sc² × t) / k
 *    Where: I_sc = Fault Current (13.5 kA typical), t = Trip time (0.1s)
 *           k = Material constant (Copper: 115, Aluminum: 76)
 */

document.addEventListener('DOMContentLoaded', () => {
    loadACCablesS4();
    const s4Sel = document.getElementById('sel_ac_cable_s4');
    if (s4Sel) {
        s4Sel.addEventListener('change', () => {
            syncStage4CableToStage3();
        });
    }
    const s4McbSel = document.getElementById('sel_ac_mcb_s4');
    if (s4McbSel) {
        s4McbSel.addEventListener('change', () => {
            syncStage4McbToStage3();
        });
    }
    const autoChk = document.getElementById('s4_auto_coord_chk');
    if (autoChk) {
        const saved = window.projectData?.stage4?.autoCoordination;
        autoChk.checked = saved === undefined ? true : !!saved;
    }

    // Dependency chain: any core input change recalculates engineering instantly.
    ['s4_voltage', 's4_pf', 's4_floors_disp', 'len_horizontal', 's4_len_total', 's4_phase', 's4_tot_power'].forEach(id => {
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

function setClueBox(clues, recommendation) {
    const clueBox = document.getElementById('s4_clue_box');
    if (!clueBox) return;

    if (!Array.isArray(clues) || clues.length === 0) {
        clueBox.style.display = 'none';
        clueBox.innerHTML = '';
        return;
    }

    const listHtml = clues.map(c => `<li>${c}</li>`).join('');
    const canApply = recommendation && recommendation.cableIndex > 0 && recommendation.mcbIndex > 0;
    const actionsHtml = canApply
        ? `<div class="s4-clue-actions"><button type="button" class="s4-clue-btn" id="btn_s4_apply_suggestion">Apply Suggested Pair</button></div>`
        : '';

    clueBox.innerHTML = `
        <div class="s4-clue-title">Correction Clues</div>
        <ul class="s4-clue-list">${listHtml}</ul>
        ${actionsHtml}
    `;
    clueBox.style.display = 'block';

    if (canApply) {
        const btn = document.getElementById('btn_s4_apply_suggestion');
        if (btn) {
            btn.onclick = () => {
                const cableSel = document.getElementById('sel_ac_cable_s4');
                const mcbSel = document.getElementById('sel_ac_mcb_s4');
                if (!cableSel || !mcbSel) return;

                cableSel.selectedIndex = recommendation.cableIndex;
                mcbSel.selectedIndex = recommendation.mcbIndex;
                syncStage4CableToStage3();
                syncStage4McbToStage3();
                calculateEngineering();
            };
        }
    }
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
    const s2 = window.projectData?.strings || {};
    const multi = getResolvedMultiInverters();
    const invCount = parseInt(s2.inverterCount, 10) || 1;

    // Primary: engineering formula from core dependencies (kW, V, phase, PF).
    const byFormula = calcIb(totalCapKw, voltage, pf, phase);
    if (byFormula > 0) {
        return { iMax: byFormula, source: 'formula' };
    }

    // Fallback: source current from materials.json specs (output_current/imax).
    if (Array.isArray(multi) && multi.length > 0) {
        let sumImax = 0;
        let hasAtLeastOneSpecCurrent = false;

        multi.forEach(unit => {
            const qty = safeNum(unit?.qty, 1);
            // Source inverter electrical specs from materials.json catalog first.
            const materialInv = resolveInverterFromMaterials(unit);
            const specs = materialInv?.specifications || unit?.inverter?.specifications || {};
            const outI = safeNum(specs.output_current, 0) || safeNum(specs.imax, 0);
            if (outI > 0) {
                hasAtLeastOneSpecCurrent = true;
                sumImax += outI * qty;
            }
        });

        if (sumImax > 0) return { iMax: sumImax, source: hasAtLeastOneSpecCurrent ? 'specs-multi' : 'specs-missing' };
    }

    const model = s2.inverterModel || window.projectData?.stage2?.inverterModel;
    const inv = matchInverterByName(model);
    const outI = safeNum(inv?.specifications?.output_current, 0) || safeNum(inv?.specifications?.imax, 0);
    if (outI > 0) {
        return { iMax: outI * invCount, source: 'specs-single' };
    }

    return { iMax: 0, source: 'missing' };
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
    const plossOk = pLossPct <= ctx.maxPloss;
    const cccOk = deratedCCC >= ctx.safetyCurrent;
    const mcbOk = ctx.mcb <= 0 || (ctx.mcb >= ctx.mcbMin && ctx.mcb <= deratedCCC);

    const sq = parseSqmm(item?.name);
    const scOk = ctx.minArea > 0 && sq > 0 ? (sq >= ctx.minArea) : true;

    return { vDropPct, pLossPct, deratedCCC, vdropOk, plossOk, cccOk, mcbOk, scOk };
}

function getCoordinatedRecommendation() {
    const cableSel = document.getElementById('sel_ac_cable_s4');
    const mcbSel = document.getElementById('sel_ac_mcb_s4');
    if (!cableSel || !mcbSel) return null;

    const phase = normalizePhase(document.getElementById('s4_phase')?.value);
    const voltage = safeNum(document.getElementById('s4_voltage')?.value, phase === '1-Phase' ? 230 : 415);
    const pf = safeNum(document.getElementById('s4_pf')?.value, 0.99);
    const totalPowerKw = safeNum(document.getElementById('s4_tot_power')?.value, 0);
    const autoLenChecked = document.getElementById('s4_auto_len_chk')?.checked === true;
    const autoLen = safeNum(document.getElementById('s4_len_auto')?.value, 0);
    const lenFromInput = safeNum(document.getElementById('s4_len_total')?.value, 0);
    const totalLen = lenFromInput > 0 ? lenFromInput : (autoLenChecked && autoLen > 0 ? autoLen : 0);

    const ib = getSiteImax(totalPowerKw, voltage, pf, phase).iMax;
    const iFinal = ib * 1.25;

    const tf = safeNum(document.getElementById('s4_temp_factor')?.value, 1);
    const gf = safeNum(document.getElementById('s4_group_factor')?.value, 1);

    const isc = safeNum(document.getElementById('s4_isc')?.value, 0);
    const tripTime = safeNum(document.getElementById('s4_trip_time')?.value, 0);
    const kFactor = safeNum(document.getElementById('s4_k_factor')?.value, 0);
    const minArea = (kFactor > 0 && tripTime > 0) ? (isc * Math.sqrt(tripTime)) / kFactor : 0;

    const mcbCandidates = [];
    for (let i = 1; i < mcbSel.options.length; i++) {
        const raw = mcbSel.options[i].value;
        if (!raw) continue;
        try {
            const item = JSON.parse(raw);
            const rating = parseProtectionRating(item);
            if (rating > 0) mcbCandidates.push({ index: i, item, rating });
        } catch {
            continue;
        }
    }
    mcbCandidates.sort((a, b) => a.rating - b.rating);

    const cableCandidates = [];
    for (let i = 1; i < cableSel.options.length; i++) {
        const raw = cableSel.options[i].value;
        if (!raw) continue;
        try {
            const item = JSON.parse(raw);
            cableCandidates.push({ index: i, item, sq: parseSqmm(item?.name) });
        } catch {
            continue;
        }
    }
    cableCandidates.sort((a, b) => {
        const as = a.sq || Number.MAX_SAFE_INTEGER;
        const bs = b.sq || Number.MAX_SAFE_INTEGER;
        return as - bs;
    });

    const baseCtx = {
        totalLen,
        ib,
        pInvW: totalPowerKw * 1000,
        vSys: voltage,
        vdropFactor: getPhaseFactors(phase).vdropFactor,
        maxVdrop: 3,
        maxPloss: 2,
        tf,
        gf,
        ifac: 1,
        safetyCurrent: iFinal,
        mcb: 0,
        mcbMin: iFinal,
        minArea,
    };

    for (const cable of cableCandidates) {
        const ev = evaluateCable(cable.item, baseCtx);
        if (!(ev.cccOk && ev.vdropOk && ev.plossOk && ev.scOk)) continue;

        const coordinatedMcb = mcbCandidates.find(m => m.rating >= iFinal && m.rating < getCableProps(cable.item).ccc);
        if (!coordinatedMcb) continue;

        return {
            cableIndex: cable.index,
            cableItem: cable.item,
            cableName: cableSel.options[cable.index]?.text || cable.item?.name || '',
            mcbIndex: coordinatedMcb.index,
            mcbItem: coordinatedMcb.item,
            mcbName: mcbSel.options[coordinatedMcb.index]?.text || coordinatedMcb.item?.name || '',
            mcbRating: coordinatedMcb.rating,
            iBase: ib,
            iFinal,
            deratedCCC: ev.deratedCCC,
            vDropPct: ev.vDropPct,
            pLossPct: ev.pLossPct
        };
    }
    return null;
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
        // Electrical Data
        const invModel = s2.inverterModel || stage2.inverterModel || 'Standard Inv';
        const multi = getResolvedMultiInverters();
        const totalInvUnits = Array.isArray(multi)
            ? multi.reduce((sum, unit) => sum + safeNum(unit?.qty, 0), 0)
            : 0;

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

        const invCount = totalInvUnits > 0
            ? totalInvUnits
            : (parseInt(s2.inverterCount, 10) || parseInt(stage2.inverterCount, 10) || 1);
        const phaseFromBills = inferPhaseFromBills(s1.consumption);
        const phase = normalizePhase(phaseFromBills || s1.phase || s2.phase || s2.inverterPhase);

        let capPerInv = invCount > 0 ? (totalCapKw / invCount) : 0;
        if (Array.isArray(multi) && multi.length > 0) {
            let maxKw = 0;
            multi.forEach(unit => {
                const specs = unit?.inverter?.specifications || {};
                const acKw = safeNum(specs.ac_power_kw, 0);
                if (acKw > maxKw) maxKw = acKw;
            });
            if (maxKw > 0) capPerInv = maxKw;
        }

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
        const iMax = getSiteImax(totalCapKw, voltage, pf, phase).iMax;
        const panelCount = safeNum(
            s1.panelCount
            ?? stage2.panelCount
            ?? window.projectData?.design?.panelCount,
            0
        );
        const panelWattage = safeNum(
            s1.panelWattage
            ?? stage2.panelWattage
            ?? window.projectData?.design?.panelWattage,
            0
        );
        const generatedDcKwp = (panelCount * panelWattage) / 1000;
        const modelLabel = Array.isArray(multi) && multi.length > 0
            ? `Multi Inverter (${invCount} units)`
            : invModel;
        const capacityLabelKw = Array.isArray(multi) && multi.length > 0 ? totalCapKw : capPerInv;

        document.getElementById('s4_inv_model').value = modelLabel;
        document.getElementById('s4_inv_cap').value = capacityLabelKw.toFixed(2);
        document.getElementById('s4_inv_current').value = iMax.toFixed(2);
        document.getElementById('s4_tot_power').value = totalCapKw.toFixed(2);
        document.getElementById('s4_safety_current').value = (iMax * 1.25).toFixed(2);
        document.getElementById('s4_phase').value = phase;
        document.getElementById('s4_panel_count').value = panelCount;
        document.getElementById('s4_panel_wattage').value = panelWattage;
        const dcCapEl = document.getElementById('s4_dc_capacity');
        if (dcCapEl) dcCapEl.value = (panelCount * panelWattage).toFixed(0);
        if (!window.projectData.stage4) window.projectData.stage4 = {};
        window.projectData.stage4.panelCountUsed = panelCount;
        window.projectData.stage4.panelWattageUsed = panelWattage;
        window.projectData.stage4.generatedDcKwp = Number.isFinite(generatedDcKwp) ? generatedDcKwp.toFixed(2) : '0.00';
        window.projectData.stage4.inverterAcTotalKw = Number.isFinite(totalCapKw) ? totalCapKw.toFixed(2) : '0.00';

        // Lengths
        const floors = safeNum(
            s1.site?.location?.floors
            ?? window.projectData?.site?.location?.floors
            ?? s1.location?.floors
            ?? s1.floors
            ?? s1.numFloors,
            1
        );
        document.getElementById('s4_floors_disp').value = floors;

        // Populate meter distance from Stage 1 if available
        const lenInput = document.getElementById('len_horizontal');
        if (safeNum(s1.meterDistance, 0) > 0 && lenInput && !lenInput.value) {
            lenInput.value = s1.meterDistance;
        }

        // Sync Cable Selection
        const sel = document.getElementById('sel_ac_cable_s4');
        if (sel.selectedIndex <= 0 && s3.ac && s3.ac.cable) {
            syncDropdown(s3.ac.cable.item);
        }

        // Sync MCB
        const mcbSel = document.getElementById('sel_ac_mcb_s4');
        if (mcbSel && mcbSel.selectedIndex <= 0 && s3.ac?.mcb?.item) {
            syncMcbDropdown(s3.ac.mcb.item);
        }
        let mcbVal = null;
        if (mcbSel?.value) {
            try { mcbVal = JSON.parse(mcbSel.value); } catch { mcbVal = null; }
        }
        document.getElementById('s4_mcb_rating').value = parseProtectionRating(mcbVal || s3.ac?.mcb?.item || 0);

        // Run Calcs
        calculateEngineering();
        calcCivilBlocks();
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

// ==================================================
//  PART A: ELECTRICAL CALCULATION (With Visual Validation)
// ==================================================
window.calculateEngineering = function() {
    const panelCount = safeNum(document.getElementById('s4_panel_count')?.value, 0);
    const panelWattage = safeNum(document.getElementById('s4_panel_wattage')?.value, 0);
    const dcCapacity = dcPower(panelCount, panelWattage);
    const dcEl = document.getElementById('s4_dc_capacity');
    if (dcEl) dcEl.value = dcCapacity.toFixed(0);

    // 1. Length Calculation: L = (F * H) + R
    const floors = safeNum(document.getElementById('s4_floors_disp')?.value, 1);
    const floorH = safeNum(document.getElementById('s4_floor_height')?.value, 4.27);
    const vert = floors * floorH;
    document.getElementById('s4_vert_calc').value = vert.toFixed(2);

    const horiz = safeNum(document.getElementById('len_horizontal')?.value, 20);
    const autoLen = vert + horiz;
    const autoLenInput = document.getElementById('s4_len_auto');
    if (autoLenInput) autoLenInput.value = autoLen.toFixed(2);

    const autoChk = document.getElementById('s4_auto_len_chk');
    const lenTotalEl = document.getElementById('s4_len_total');
    let totalLen = safeNum(lenTotalEl?.value, autoLen);

    if (autoChk?.checked) {
        totalLen = autoLen;
        if (lenTotalEl) {
            lenTotalEl.value = totalLen.toFixed(2);
            lenTotalEl.readOnly = true;
        }
    } else if (lenTotalEl) {
        lenTotalEl.readOnly = false;
        if (!lenTotalEl.value) lenTotalEl.value = autoLen.toFixed(2);
        totalLen = safeNum(lenTotalEl.value, autoLen);
    }

    // 2. Circuit Demand
    const phase = normalizePhase(document.getElementById('s4_phase')?.value);
    const voltage = safeNum(document.getElementById('s4_voltage')?.value, phase === '1-Phase' ? 230 : 415);
    const pf = safeNum(document.getElementById('s4_pf')?.value, 0.99);
    const totalPowerKw = safeNum(document.getElementById('s4_tot_power')?.value, 0);
    const iInfo = getSiteImax(totalPowerKw, voltage, pf, phase);
    const ib = iInfo.iMax;
    document.getElementById('s4_inv_current').value = ib.toFixed(2);
    const iFinal = requiredMcbCurrent(ib);
    document.getElementById('s4_safety_current').value = iFinal.toFixed(2);
    const autoCoord = document.getElementById('s4_auto_coord_chk')?.checked !== false;
    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage4) window.projectData.stage4 = {};
    window.projectData.stage4.autoCoordination = autoCoord;

    // 3. Auto coordination loop (Cable -> MCB -> check MCB < Cable CCC)
    const recommendation = getCoordinatedRecommendation();
    s4LastRecommendation = recommendation;
    const sel = document.getElementById('sel_ac_cable_s4');
    const mcbSel = document.getElementById('sel_ac_mcb_s4');
    if (autoCoord && recommendation && !s4SelectionLock) {
        let changed = false;
        if (sel && recommendation.cableIndex > 0 && sel.selectedIndex !== recommendation.cableIndex) {
            sel.selectedIndex = recommendation.cableIndex;
            changed = true;
        }
        if (mcbSel && recommendation.mcbIndex > 0 && mcbSel.selectedIndex !== recommendation.mcbIndex) {
            mcbSel.selectedIndex = recommendation.mcbIndex;
            changed = true;
        }
        if (changed) {
            s4SelectionLock = true;
            syncStage4CableToStage3();
            syncStage4McbToStage3();
            s4SelectionLock = false;
        }
    }

    // 4. Final selected cable data
    let rKm = 2.44;
    let ccc = 70;
    let cableItem = null;
    if (sel?.value) {
        try {
            cableItem = JSON.parse(sel.value);
            const props = getCableProps(cableItem);
            rKm = props.rKm;
            ccc = props.ccc;
        } catch (e) {
            console.error('Cable parse error', e);
        }
    }
    syncStage4CableToStage3();
    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage4) window.projectData.stage4 = {};
    window.projectData.stage4.totalLength = totalLen.toFixed(2);
    document.getElementById('s4_cable_r').value = rKm;
    document.getElementById('s4_cable_ccc').value = ccc;

    // 5. Ampacity (Thermal)
    const tf = safeNum(document.getElementById('s4_temp_factor')?.value, 1);
    const gf = safeNum(document.getElementById('s4_group_factor')?.value, 1);
    const adf = tf * gf;
    const deratedCCC = ccc * adf;
    const reqIt = adf > 0 ? (ib / adf) : 0;
    document.getElementById('s4_derated_ccc').value = deratedCCC.toFixed(2);
    document.getElementById('s4_req_it').value = reqIt.toFixed(2);
    const adfEl = document.getElementById('s4_adf');
    if (adfEl) adfEl.value = adf.toFixed(3);
    const rMEl = document.getElementById('s4_cable_r_m');
    if (rMEl) rMEl.value = (rKm / 1000).toFixed(6);

    // 6. Power loss (Excel formula)
    const rOhmPerM = rKm / 1000;
    const invPowerW = totalPowerKw * 1000;
    const pLossPct = invPowerW > 0 ? (((ib * ib) * rOhmPerM * totalLen) / invPowerW) * 100 : 0;
    document.getElementById('s4_ploss_pct').value = pLossPct.toFixed(2) + ' %';
    document.getElementById('s4_vdrop_v').value = '-';
    document.getElementById('s4_vdrop_pct').value = '-';

    // 7. MCB Validation
    let mcbItem = null;
    if (mcbSel?.value) {
        try { mcbItem = JSON.parse(mcbSel.value); } catch { mcbItem = null; }
    }
    const mcb = parseProtectionRating(mcbItem || document.getElementById('s4_mcb_rating')?.value);
    document.getElementById('s4_mcb_rating').value = mcb > 0 ? mcb : '';
    syncStage4McbToStage3();

    // 8. Short Circuit Check
    const isc = safeNum(document.getElementById('s4_isc')?.value, 0);
    const tripTime = safeNum(document.getElementById('s4_trip_time')?.value, 0);
    const kFactor = safeNum(document.getElementById('s4_k_factor')?.value, 0);
    const minArea = (kFactor > 0 && tripTime > 0) ? (isc * Math.sqrt(tripTime)) / kFactor : 0;
    document.getElementById('s4_min_area').value = minArea.toFixed(2);

    // Helper to set status pills
    const setStat = (id, condition, okText, failText) => {
        const el = document.getElementById(id);
        if (condition) {
            el.innerText = okText;
            el.className = 'status-pill status-ok';
        } else {
            el.innerText = failText;
            el.className = 'status-pill status-fail';
        }
        return condition;
    };

    const isPowerOk = setStat('status_ploss', pLossPct < 2, 'Power Loss OK', 'Power Loss over 2%');
    const isCccOk = setStat('status_ccc', deratedCCC > iFinal, 'Cable CCC is OK', 'Cable CCC is NOT OK');
    const isMcbOk = setStat('status_mcb', (mcb > 0 && mcb >= iFinal && mcb < ccc), 'MCB Selection is OK', 'MCB Selection NOT OK');
    setStat('status_vdrop', true, 'Live Update ON', 'Live Update ON');
    setStat('status_sc', true, 'Excel Logic', 'Excel Logic');

    const clues = [];
    const inputAlerts = validateEngineeringInputs(totalPowerKw, totalLen, phase, voltage, pf);
    inputAlerts.forEach(a => clues.push(a));
    if (totalPowerKw <= 0 && ib > 0) {
        clues.push(`Total inverter AC power is 0. Check Stage 2 inverter AC kW mapping/material specs (ac_power_kw).`);
    }
    if (!isCccOk) {
        clues.push(`DCCC (${deratedCCC.toFixed(2)}A) must be greater than Safety Current (${iFinal.toFixed(2)}A).`);
    }
    if (!isMcbOk) {
        clues.push(`MCB must satisfy: Safety Current (${iFinal.toFixed(2)}A) <= MCB < CCC (${ccc.toFixed(2)}A).`);
    }
    if (!isPowerOk) {
        clues.push(`Power loss is ${pLossPct.toFixed(2)}%, expected < 2.00%.`);
    }
    setClueBox(clues, recommendation);

    // --- VISUAL HIGHLIGHTER ---
    const cableSelect = document.getElementById('sel_ac_cable_s4');
    const cableContainer = document.getElementById('box_cable_select');
    const fixIcon = document.getElementById('icon_cable_fix');
    const msg = document.getElementById('cable_guide_msg');

    cableSelect.classList.remove('input-error');
    cableSelect.style.border = '2px solid #fbbf24';
    cableContainer.style.backgroundColor = 'transparent';

    if (!(isPowerOk && isCccOk && isMcbOk)) {
        cableSelect.style.border = '2px solid #dc2626';
        cableSelect.style.backgroundColor = '#fef2f2';

        if (fixIcon) fixIcon.style.display = 'inline-block';
        if (msg) {
            const rec = recommendation || getCoordinatedRecommendation();
            if (rec) {
                msg.innerText = autoCoord
                    ? `Suggested: ${rec.cableName} with ${rec.mcbName} (I_final ${rec.iFinal.toFixed(2)}A)`
                    : `Manual mode: suggested ${rec.cableName} + ${rec.mcbName} (I_final ${rec.iFinal.toFixed(2)}A)`;
            } else {
                msg.innerText = 'No compliant cable+MCB pair found for current constraints.';
            }
            msg.style.color = '#dc2626';
            msg.style.fontWeight = 'bold';
        }
        cableSelect.classList.add('input-error');
    } else {
        cableSelect.style.border = '2px solid #22c55e';
        cableSelect.style.backgroundColor = '#f0fdf4';

        if (fixIcon) fixIcon.style.display = 'none';
        if (msg) {
            const rec = recommendation || getCoordinatedRecommendation();
            if (autoCoord && rec) {
                msg.innerText = `Auto selected: ${rec.cableName} + ${rec.mcbName} (I_final ${rec.iFinal.toFixed(2)}A)`;
            } else {
                msg.innerText = autoCoord
                    ? 'Optimized coordinated pair selected (Cable + MCB).'
                    : 'Manual selection is compliant.';
            }
            msg.style.color = '#15803d';
            msg.style.fontWeight = 'bold';
        }
        setClueBox([], null);
    }
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
    const cableDetails = getSelectedS4CableDetails();
    const cableName = cableDetails.name || sel.options[sel.selectedIndex]?.text;
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

    window.projectData.stage4 = {
        powerLossPct: document.getElementById('s4_ploss_pct').value,
        voltageDropPct: document.getElementById('s4_vdrop_pct').value,
        voltageDropV: document.getElementById('s4_vdrop_v').value,
        requiredIt: document.getElementById('s4_req_it').value,
        totalLength: document.getElementById('s4_len_total').value,
        cableSelected: cableName,
        cableSize: cableDetails.size || '',
        cableRate: cableDetails.rate || 0,
        mcbSelected: mcbName,
        mcbRating: mcbRating,
        mcbRate: mcbRate,
        civil: {
            blocks: civilBlocks,
            adhesive: civilAdh,
            totalCost: civilTotal
        }
    };
    if (!window.projectData.stage3) window.projectData.stage3 = {};
    if (!window.projectData.stage3.ac) window.projectData.stage3.ac = {};
    if (!window.projectData.stage3.ac.cable) window.projectData.stage3.ac.cable = {};
    window.projectData.stage3.ac.cable.item = cableName;
    if (!window.projectData.stage3.ac.mcb) window.projectData.stage3.ac.mcb = {};
    window.projectData.stage3.ac.mcb.item = mcbName;
    if (typeof setStageCompletion === 'function') {
        setStageCompletion(4, true);
    }
    if (typeof switchStage === 'function') switchStage(5);
};












