// ==================================================================
//  stage4.js - Engineering Validation & Civil Calculator
// ==================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadACCablesS4();
});

// --- 1. LOAD DROPDOWN ---
async function loadACCablesS4() {
    try {
        const res = await fetch('/procurement/api/get_stage3_materials');
        const data = await res.json();
        const sel = document.getElementById('sel_ac_cable_s4');
        const currentVal = sel.value; 
        sel.innerHTML = '<option value="">-- Select Cable --</option>';
        data.cables_ac.forEach(item => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify(item);
            opt.innerText = item.name;
            sel.appendChild(opt);
        });
        if(currentVal) sel.value = currentVal;
    } catch (e) { console.error("Error loading AC cables", e); }
}

// --- 2. MAIN REFRESH ---
function refreshStage4UI() {
    const s1 = window.projectData?.stage1 || {};
    const s2 = window.projectData?.strings || {};
    const s3 = window.projectData?.stage3 || {};

    if (s1 && s2) {
        // Electrical Data
        const invModel = s2.inverterModel || "Standard Inv";
        const totalCapKw = parseFloat(s2.acCapacity) || 0;
        const invCount = parseInt(s2.inverterCount) || 1;
        const capPerInv = (invCount > 0) ? (totalCapKw / invCount) : 0;
        const iMax = (capPerInv * 1000) / (Math.sqrt(3) * 415 * 0.99);

        document.getElementById('s4_inv_model').value = invModel;
        document.getElementById('s4_inv_cap').value = capPerInv.toFixed(2);
        document.getElementById('s4_inv_current').value = iMax.toFixed(2);
        document.getElementById('s4_tot_power').value = totalCapKw.toFixed(2);
        document.getElementById('s4_safety_current').value = (iMax * 1.25).toFixed(2);

        // Lengths
        const floors = parseFloat(s1.numFloors) || 1;
        document.getElementById('s4_floors_disp').value = floors;
        
        // Populate meter distance from Stage 1 if available
        if(s1.meterDistance && !document.getElementById('len_horizontal').value) {
             document.getElementById('len_horizontal').value = s1.meterDistance;
        }

        // Sync Cable Selection
        const sel = document.getElementById('sel_ac_cable_s4');
        if (sel.selectedIndex <= 0 && s3.ac && s3.ac.cable) syncDropdown(s3.ac.cable.item);
        
        // Sync MCB
        let mcbRating = 0;
        if (s3.ac?.mcb?.item) {
            const match = s3.ac.mcb.item.match(/(\d+)A/i);
            if(match) mcbRating = parseFloat(match[1]);
        }
        document.getElementById('s4_mcb_rating').value = mcbRating;

        // Run Calcs
        calculateEngineering(); 
        calcCivilBlocks();      
    }
}

function syncDropdown(stage3Name) {
    const sel = document.getElementById('sel_ac_cable_s4');
    for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text.includes(stage3Name.split(' (')[0])) {
            sel.selectedIndex = i;
            break;
        }
    }
}

// ==================================================
//  PART A: ELECTRICAL CALCULATION (With Visual Validation)
// ==================================================
window.calculateEngineering = function() {
    // 1. Length Calculation
    const floors = parseFloat(document.getElementById('s4_floors_disp').value) || 1;
    // Formula: Vertical = (14 * Floors) / 3.2808
    const vert = (floors * 14) / 3.2808; 
    document.getElementById('s4_vert_calc').value = vert.toFixed(2); 

    const horiz = parseFloat(document.getElementById('len_horizontal').value) || 20;
    const totalLen = vert + horiz;
    document.getElementById('s4_len_total').value = totalLen.toFixed(2);

    // 2. Cable Data Parsing
    const sel = document.getElementById('sel_ac_cable_s4');
    let rKm = 2.44; let ccc = 70; let make = "Generic";

    if (sel.value) {
        const item = JSON.parse(sel.value);
        make = item.name.split(' ')[0]; 
        
        // Resistance Data (Ohms/km) & CCC (Amps) - Approximations
        if(item.name.includes("4sqmm")) { rKm = 4.61; ccc = 45; }
        else if(item.name.includes("6sqmm")) { rKm = 3.08; ccc = 58; }
        else if(item.name.includes("10sqmm")) { rKm = 1.83; ccc = 75; }
        else if(item.name.includes("16sqmm")) { rKm = 1.15; ccc = 95; }
        else if(item.name.includes("25sqmm")) { rKm = 0.72; ccc = 120; }
        else if(item.name.includes("35sqmm")) { rKm = 0.52; ccc = 140; }
        else if(item.name.includes("50sqmm")) { rKm = 0.38; ccc = 170; }
        
        // Aluminum Adjustment
        if(item.name.toUpperCase().includes("AL") || item.name.toUpperCase().includes("ARMORED")) {
            if(item.name.includes("16")) { rKm = 2.44; ccc = 70; }
            if(item.name.includes("25")) { rKm = 1.54; ccc = 85; }
            if(item.name.includes("50")) { rKm = 0.82; ccc = 105; }
        }
    }

    document.getElementById('s4_cable_make').value = make;
    document.getElementById('s4_cable_r').value = rKm;
    document.getElementById('s4_cable_ccc').value = ccc;

    // 3. Power Loss Calculation
    const invPowerW = parseFloat(document.getElementById('s4_inv_cap').value) * 1000 || 1;
    const iMax = parseFloat(document.getElementById('s4_inv_current').value) || 0;
    const rM = rKm / 1000;
    
    // 3-Phase Power Loss = 3 * I^2 * R * L
    const pLossWatts = 3 * (iMax * iMax) * rM * totalLen;
    const pLossPct = (pLossWatts / invPowerW) * 100;
    document.getElementById('s4_ploss_pct').value = pLossPct.toFixed(2) + " %";

    // 4. Derating Factors
    const tf = parseFloat(document.getElementById('s4_temp_factor').value) || 1;
    const gf = parseFloat(document.getElementById('s4_group_factor').value) || 1;
    const deratedCCC = ccc * tf * gf;
    document.getElementById('s4_derated_ccc').value = deratedCCC.toFixed(2);

    // 5. VALIDATION & HIGHLIGHTING LOGIC
    const safetyCurrent = parseFloat(document.getElementById('s4_safety_current').value) || 0;
    const mcb = parseFloat(document.getElementById('s4_mcb_rating').value) || 0;

    // Helper to set status pills
    const setStat = (id, condition, okText, failText) => {
        const el = document.getElementById(id);
        if(condition) { el.innerText = okText; el.className = "status-pill status-ok"; } 
        else { el.innerText = failText; el.className = "status-pill status-fail"; }
        return condition;
    };

    const isPlossOk = setStat('status_ploss', pLossPct <= 2.0, "Power Loss OK", `Loss High (>2%)`);
    setStat('status_ccc', deratedCCC > safetyCurrent, "Cable CCC OK", `Cable Undersized`);
    setStat('status_mcb', (mcb > safetyCurrent && mcb <= deratedCCC), "MCB Rating OK", "Check MCB");

    // --- VISUAL HIGHLIGHTER ---
    const cableSelect = document.getElementById('sel_ac_cable_s4');
    const cableContainer = document.getElementById('box_cable_select');
    const fixIcon = document.getElementById('icon_cable_fix');
    const msg = document.getElementById('cable_guide_msg');

    // Reset Classes
    cableSelect.classList.remove('input-error');
    cableSelect.style.border = "2px solid #fbbf24"; // Default Yellow/Gold
    cableContainer.style.backgroundColor = "transparent";

    if (!isPlossOk) {
        // ERROR STATE: High Voltage Drop -> Needs Thicker Cable
        cableSelect.style.border = "2px solid #dc2626"; // Red Border
        cableSelect.style.backgroundColor = "#fef2f2"; // Red Tint
        
        if(fixIcon) fixIcon.style.display = "inline-block";
        if(msg) {
            msg.innerText = "⚠️ High Voltage Drop! Increase Cable Size.";
            msg.style.color = "#dc2626";
            msg.style.fontWeight = "bold";
        }
        // Optional: Add blinking class
        cableSelect.classList.add('input-error');

    } else {
        // SUCCESS STATE
        cableSelect.style.border = "2px solid #22c55e"; // Green Border
        cableSelect.style.backgroundColor = "#f0fdf4"; // Green Tint
        
        if(fixIcon) fixIcon.style.display = "none";
        if(msg) {
            msg.innerText = "✅ Optimized. Voltage drop within limits.";
            msg.style.color = "#15803d";
            msg.style.fontWeight = "bold";
        }
    }
};

// ==================================================
//  PART B: CIVIL & ADHESIVE CALCULATOR
// ==================================================
window.calcCivilBlocks = function() {
    const count = parseFloat(document.getElementById('civil_count').value) || 0;
    const L = parseFloat(document.getElementById('civil_l').value) || 0.3;
    const W = parseFloat(document.getElementById('civil_w').value) || 0.3;
    const H = parseFloat(document.getElementById('civil_h').value) || 0.3;
    const make = document.getElementById('civil_make').value; 

    // 1. Block Calc
    let blockCost = 0;
    if(make === 'Precast') {
        blockCost = count * 350; 
    } else {
        // Site Mix (Approx 2500kg/m3 density)
        const totalVol = L * W * H * count;
        const totalWeight = totalVol * 2500;
        blockCost = (totalWeight * 4) + 1500; // Rs 4/kg + Transport
    }
    document.getElementById('res_block_cost').innerText = "₹ " + Math.round(blockCost).toLocaleString();

    // 2. Adhesive Calc
    const adhSelect = document.getElementById('adhesive_make').value; 
    // Rate extraction: "Sika_150" -> 150 * 10 = 1500/kg (Example logic)
    const adhRate = parseFloat(adhSelect.split('_')[1]) * 10; 
    
    // Logic: Bottom Area * 2mm thickness * Density
    const surfaceArea = L * W * count; 
    const adhKg = Math.ceil(surfaceArea * 3); // 3kg per m2 approx for 2mm
    const adhCost = adhKg * adhRate;

    document.getElementById('res_adh_qty').innerText = adhKg;
    document.getElementById('res_adh_cost').innerText = "₹ " + adhCost.toLocaleString();

    // 3. Total
    const total = blockCost + adhCost;
    document.getElementById('res_civil_total').innerText = "₹ " + total.toLocaleString();
};

// --- 4. SAVE ---
window.saveStage4 = function() {
    const sel = document.getElementById('sel_ac_cable_s4');
    const cableName = sel.options[sel.selectedIndex]?.text;
    
    window.projectData.stage4 = {
        powerLossPct: document.getElementById('s4_ploss_pct').value,
        totalLength: document.getElementById('s4_len_total').value,
        cableSelected: cableName,
        civil: {
            blocks: document.getElementById('civil_count').value,
            adhesive: document.getElementById('adhesive_make').value,
            totalCost: document.getElementById('res_civil_total').innerText
        }
    };
    if (typeof switchStage === 'function') switchStage(5);
};