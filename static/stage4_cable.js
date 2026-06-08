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
        's4_voltage', 's4_pf', 's4_floors_disp', 'len_horizontal', 's4_len_total', 's4_phase', 's4_tot_power'
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

    const catalog = Array.isArray(s4CableCatalog) && s4CableCatalog.length > 0
        ? s4CableCatalog
        : Array.from(cableSel.options)
            .slice(1)
            .map(opt => {
                try { return JSON.parse(opt.value); } catch { return null; }
            })
            .filter(Boolean);
    const cableCandidates = catalog.map(item => ({ item, sq: parseSqmm(item?.name) }));
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
        mcbMin: iFinal
    };

    for (const cable of cableCandidates) {
        const ev = evaluateCable(cable.item, baseCtx);
        if (!(ev.cccOk && ev.vdropOk && ev.plossOk)) continue;

        const coordinatedMcb = mcbCandidates.find(m => m.rating >= iFinal && m.rating < ev.ccc && m.rating < ev.deratedCCC);
        if (!coordinatedMcb) continue;

        return {
            cableIndex: findCableOptionIndex(cableSel, cable.item?.name || ''),
            cableItem: cable.item,
            cableName: getCableSizeText(cable.item),
            cableMake: getCableMake(cable.item),
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

        // 4. Build the Visual List of Inverters (INV 1, INV 2, etc.) in the UI
        const listContainer = document.getElementById('s4_inverter_list');
        if (listContainer) {
            let html = '';
            if (siteData.breakdown && siteData.breakdown.length > 0) {
                siteData.breakdown.forEach(inv => {
                    html += `
                    <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px dashed #cbd5e1;">
                        <span><b>${inv.label}:</b> ${inv.name} ${inv.qty > 1 ? `(x${inv.qty})` : ''}</span>
                        <span style="color:#0284c7; font-weight:600;">${(inv.kw * inv.qty).toFixed(2)} kW | ${(inv.imax * inv.qty).toFixed(2)} A</span>
                    </div>`;
                });
            } else {
                html = '<div>No inverters mapped.</div>';
            }
            listContainer.innerHTML = html;
        }

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
    // 1. Manual Override Logic
    // If the user manually changes a dropdown, turn off auto-coordination so alerts can show
    const autoChk = document.getElementById('s4_auto_coord_chk');
    if (isManualChange && autoChk && autoChk.checked) {
        autoChk.checked = false; 
    }
    const autoCoord = autoChk?.checked !== false;

    const panelCount = safeNum(document.getElementById('s4_panel_count')?.value, 0);
    const panelWattage = safeNum(document.getElementById('s4_panel_wattage')?.value, 0);
    const dcCapacity = dcPower(panelCount, panelWattage);
    const dcEl = document.getElementById('s4_dc_capacity');
    if (dcEl) dcEl.value = dcCapacity.toFixed(0);

    // 2. Length Calculation: L = (F * H) + R
    const floors = safeNum(document.getElementById('s4_floors_disp')?.value, 1);
    const floorH = safeNum(document.getElementById('s4_floor_height')?.value, 4.27);
    const vert = floors * floorH;
    const vertEl = document.getElementById('s4_vert_calc');
    if (vertEl) vertEl.value = vert.toFixed(2);

    const horiz = safeNum(document.getElementById('len_horizontal')?.value, 20);
    const autoLen = vert + horiz;
    const autoLenInput = document.getElementById('s4_len_auto');
    if (autoLenInput) autoLenInput.value = autoLen.toFixed(2);

    const autoLenChk = document.getElementById('s4_auto_len_chk');
    const lenTotalEl = document.getElementById('s4_len_total');
    let totalLen = safeNum(lenTotalEl?.value, autoLen);

    if (autoLenChk?.checked) {
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

    // 3. Circuit Demand
    const phase = normalizePhase(document.getElementById('s4_phase')?.value);
    const voltage = safeNum(document.getElementById('s4_voltage')?.value, phase === '1-Phase' ? 230 : 415);
    const pf = safeNum(document.getElementById('s4_pf')?.value, 0.99);
    const totalPowerKw = safeNum(document.getElementById('s4_tot_power')?.value, 0);
    
    const iInfo = getSiteImax(totalPowerKw, voltage, pf, phase);
    const ib = iInfo.iMax;
    const invCurrentEl = document.getElementById('s4_inv_current');
    if (invCurrentEl) invCurrentEl.value = ib.toFixed(2);
    
    const iFinal = requiredMcbCurrent(ib);
    const safetyEl = document.getElementById('s4_safety_current');
    if (safetyEl) safetyEl.value = iFinal.toFixed(2) + ' A';

    if (!window.projectData) window.projectData = {};
    if (!window.projectData.stage4) window.projectData.stage4 = {};
    window.projectData.stage4.autoCoordination = autoCoord;

    // 4. Auto coordination loop
    const recommendation = getCoordinatedRecommendation();
    s4LastRecommendation = recommendation;
    const sel = document.getElementById('sel_ac_cable_s4');
    const mcbSel = document.getElementById('sel_ac_mcb_s4');
    
    if (autoCoord && recommendation && !s4SelectionLock && !isManualChange) {
        let changed = false;
        if (sel && recommendation.cableItem && selectS4CableItem(recommendation.cableItem)) {
            changed = true;
        }
        if (mcbSel && recommendation.mcbItem && selectS4McbItem(recommendation.mcbItem)) {
            changed = true;
        }
        if (changed) {
            s4SelectionLock = true;
            syncStage4CableToStage3();
            syncStage4McbToStage3();
            s4SelectionLock = false;
        }
    }

    // 5. Final selected cable data
    let rKm = 2.44;
    let ccc = 70;
    let cableItem = null;
    const hasCableSelected = !!sel?.value;
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
    window.projectData.stage4.totalLength = totalLen.toFixed(2);
    
    const rEl = document.getElementById('s4_cable_r');
    if (rEl) rEl.value = rKm;
    const cccEl = document.getElementById('s4_cable_ccc');
    if (cccEl) cccEl.value = ccc;

    // 6. Ampacity (Thermal)
    const tf = safeNum(document.getElementById('s4_temp_factor')?.value, 1);
    const gf = safeNum(document.getElementById('s4_group_factor')?.value, 1);
    const adf = tf * gf;
    const deratedCCC = ccc * adf;
    const reqIt = adf > 0 ? (ib / adf) : 0;
    
    const dcccEl = document.getElementById('s4_derated_ccc');
    if (dcccEl) dcccEl.value = deratedCCC.toFixed(2);
    const reqItEl = document.getElementById('s4_req_it');
    if (reqItEl) reqItEl.value = reqIt.toFixed(2);
    const adfEl = document.getElementById('s4_adf');
    if (adfEl) adfEl.value = adf.toFixed(3);
    const rMEl = document.getElementById('s4_cable_r_m');
    if (rMEl) rMEl.value = (rKm / 1000).toFixed(6);

    // 7. Voltage Drop
    const phaseFactors = getPhaseFactors(phase);
    const vdropFactor = phaseFactors.vdropFactor;
    const vDropVolt = (vdropFactor * ib * totalLen * rKm) / 1000;
    const vDropPct = voltage > 0 ? (vDropVolt / voltage) * 100 : 0;
    
    const vdVoltEl = document.getElementById('s4_vdrop_v');
    if (vdVoltEl) vdVoltEl.value = vDropVolt.toFixed(2) + ' V';
    const vdPctEl = document.getElementById('s4_vdrop_pct');
    if (vdPctEl) vdPctEl.value = vDropPct.toFixed(2) + ' %';

    // 8. Power loss
    const rOhmPerM = rKm / 1000;
    const invPowerW = totalPowerKw * 1000;
    const pLossPct = invPowerW > 0 ? (((ib * ib) * rOhmPerM * totalLen) / invPowerW) * 100 : 0;
    const pLossEl = document.getElementById('s4_ploss_pct');
    if (pLossEl) pLossEl.value = pLossPct.toFixed(2) + ' %';

    // 10. MCB Validation
    let mcbItem = null;
    const hasMcbSelected = !!mcbSel?.value;
    if (mcbSel?.value) {
        try { mcbItem = JSON.parse(mcbSel.value); } catch { mcbItem = null; }
    }
    const mcb = parseProtectionRating(mcbItem || document.getElementById('s4_mcb_rating')?.value);
    const mcbRatingEl = document.getElementById('s4_mcb_rating');
    if (mcbRatingEl) mcbRatingEl.value = mcb > 0 ? mcb : '';
    syncStage4McbToStage3();

    // --- REAL-TIME VALIDATIONS ---
    const isVdropOk = hasCableSelected && vDropPct <= 3.0;
    const isPowerOk = hasCableSelected && pLossPct < 2.0;
    const isCccOk = hasCableSelected && deratedCCC > iFinal;
    const isMcbSelectionOk = hasMcbSelected && mcb > 0 && mcb >= iFinal && mcb < ccc;
    const isFinalProtectionOk = hasMcbSelected && mcb > 0 && mcb < deratedCCC;
    const isMcbOk = isMcbSelectionOk && isFinalProtectionOk;

    // Helper to set HUD status pills
    const setStat = (id, condition, okText, failText) => {
        const el = document.getElementById(id);
        if (!el) return condition;
        if (condition) {
            el.innerText = okText;
            el.className = 'status-pill status-ok';
        } else {
            el.innerText = failText;
            el.className = 'status-pill status-fail';
        }
        return condition;
    };

    setStat('status_ploss', isPowerOk, 'PWR OK', 'PWR HI');
    setStat('status_vdrop', isVdropOk, 'V-DRP OK', 'V-DRP HI');
    setStat('status_ccc', isCccOk, 'CCC OK', 'CCC LO');
    setStat('status_mcb', isMcbOk, 'MCB OK', 'MCB ERR');

    // Input validation (store but don't block on compliance)
    const inputAlerts = validateEngineeringInputs(totalPowerKw, totalLen, phase, voltage, pf);

    window.projectData.stage4.validation = {
        isCompliant: hasCableSelected && hasMcbSelected && isPowerOk && isCccOk && isMcbOk && isVdropOk,
        hasCableSelected,
        hasMcbSelected,
        isPowerOk,
        isCccOk,
        isMcbOk,
        isVdropOk,
        inputAlerts,
        vDropPct: Number(vDropPct.toFixed(2)),
        pLossPct: Number(pLossPct.toFixed(2)),
        deratedCCC: Number(deratedCCC.toFixed(2)),
        safetyCurrent: Number(iFinal.toFixed(2)),
        mcbRating: mcb,
        cableCcc: Number(ccc.toFixed(2)),
        mcbSelectionOk: isMcbSelectionOk,
        finalProtectionOk: isFinalProtectionOk
    };
    window.projectData.stage4.calculationFlow = [
        'modules',
        'dcCapacity',
        'inverterCapacityAndCurrent',
        'designCurrent',
        'cableSelection',
        'temperatureDerating',
        'groupingDerating',
        'deratedCableCurrentCarryingCapacity',
        'cableCheck',
        'mcbCoordination',
        'voltageDropCheck',
        'powerLossCheck'
    ];

    // --- VISUAL RED HIGHLIGHTER ---
    const cableSelect = document.getElementById('sel_ac_cable_s4');
    const cableContainer = document.getElementById('box_cable_select');
    const fixIcon = document.getElementById('icon_cable_fix');
    const msg = document.getElementById('cable_guide_msg');

    if (cableSelect) {
        cableSelect.classList.remove('input-error');
        cableSelect.style.border = '2px solid #fbbf24';
        if(cableContainer) cableContainer.style.backgroundColor = 'transparent';

        if (!(isPowerOk && isCccOk && isMcbOk && isVdropOk)) {
            cableSelect.style.border = '2px solid #dc2626';
            cableSelect.style.backgroundColor = '#fef2f2';

            if (fixIcon) fixIcon.style.display = 'inline-block';
            if (msg) {
                if (autoCoord && !recommendation) {
                    msg.innerText = 'No compliant pair found for this length!';
                } else {
                    msg.innerText = `Alert: Current selection is unsafe.`;
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
                if (autoCoord && recommendation) {
                    msg.innerText = `Auto paired: ${recommendation.cableName}`;
                } else {
                    msg.innerText = 'Manual selection is fully compliant.';
                }
                msg.style.color = '#15803d';
                msg.style.fontWeight = 'bold';
            }
        }
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
    
    // Final validation check - only block on actual electrical failures
    const validation = window.projectData?.stage4?.validation;
    if (validation?.isCompliant === false) {
        let failureReason = [];
        if (!validation?.hasCableSelected) failureReason.push('Cable not selected');
        if (!validation?.hasMcbSelected) failureReason.push('MCB not selected');
        if (!validation?.isPowerOk) failureReason.push('Power loss exceeds 2%');
        if (!validation?.isVdropOk) failureReason.push('Voltage drop exceeds 3%');
        if (!validation?.isCccOk) failureReason.push('Cable ampacity insufficient');
        if (!validation?.isMcbOk) failureReason.push('MCB coordination failed');
        
        alert('Stage 4 is not compliant:\n\n' + failureReason.join('\n') + '\n\nApply the suggested pair or correct the highlighted warnings before proceeding.');
        return;
    }

    const existingStage4 = window.projectData.stage4 || {};
    window.projectData.stage4 = {
        ...existingStage4,
        powerLossPct: getValue('s4_ploss_pct', '0.00 %'),
        voltageDropPct: getValue('s4_vdrop_pct', '0.00 %'),
        voltageDropV: getValue('s4_vdrop_v', '0.00 V'),
        requiredIt: getValue('s4_req_it', '0.00'),
        totalLength: getValue('s4_len_total', '0'),
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
    if (typeof switchStage === 'function') switchStage(3);
};













