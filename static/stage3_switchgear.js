// ==================================================================
//  stage3.js - Electrical BoQ (Hybrid: Fixed + Dynamic + Editable)
// ==================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadStage3Materials();
    // Calculate initial totals immediately to account for fixed rows
    setTimeout(calculateGrandTotal, 500); 
});

// Called when tab is switched to Stage 3
function refreshStage3UI() {
    const s1 = window.projectData?.stage1;
    const s2 = window.projectData?.strings;

    if (s1 && s2) {
        // Update Context Header
        document.getElementById('s3_dc_cap').innerText = `${s1.systemSizeKwp.toFixed(2)} kWp`;
        document.getElementById('s3_ac_cap').innerText = `${(s2.acCapacity || 0).toFixed(1)} kW`;
        
        // Approx Short Circuit Current (Placeholder or Calc)
        const isc = 13.5; 
        document.getElementById('s3_isc').innerText = `${isc} A`;
        
        // Set Default Cable Lengths if empty
        const dcCab = document.getElementById('qty_dc_cable');
        const acCab = document.getElementById('qty_ac_cable');
        if(dcCab && !dcCab.value) dcCab.value = 50; 
        if(acCab && !acCab.value) acCab.value = 20;
        
        // Trigger calculation for all rows to ensure totals are fresh
        ['dc_cable', 'dc_mcb', 'dc_fuse', 'dc_spd', 'ac_spd'].forEach(id => {
            const el = document.getElementById(`qty_${id}`);
            if(el) calcRowTotal(id);
        });
    }
}

// --- 1. DATA LOADING (Only for Dynamic Dropdowns) ---
async function loadStage3Materials() {
    try {
        const res = await fetch('/procurement/api/get_stage3_materials');
        const data = await res.json();
        
        // Populate only the rows that have Select elements
        populateDropdown('sel_dcdb', data.boxes);
        populateDropdown('sel_acdb', data.boxes);
        populateDropdown('sel_ac_mcb', data.protection_ac);
        populateDropdown('sel_ac_elcb', data.protection_ac);
        populateDropdown('sel_ac_cable', data.cables_ac);

        // Note: DC MCB, Fuse, SPD, Cable & AC SPD are skipped 
        // because they are rendered as Fixed Inputs in the HTML.

    } catch (e) { console.error("Error loading stage 3 data", e); }
}

function populateDropdown(elementId, items) {
    const sel = document.getElementById(elementId);
    if (!sel) return; // Guard clause if element is fixed (input) instead of select
    
    sel.innerHTML = '<option value="">-- Select --</option>';
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify(item);
        // Display Name + Rate hint
        opt.innerText = `${item.name} (Default: ₹${item.rate})`; 
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
    if (size && size !== "-" && size !== "") {
        document.getElementById(`size_${rowId}`).value = size;
    }

    // 3. Recalculate Cost
    calcRowTotal(rowId);
};

// --- 3. COST CALCULATION ---
// Triggered when Qty changes OR Item is selected
window.calcRowTotal = function(rowId) {
    const qtyInput = document.getElementById(`qty_${rowId}`);
    const rateInput = document.getElementById(`rate_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);

    if(!qtyInput || !rateInput || !costInput) return;

    const qty = parseFloat(qtyInput.value) || 0;
    const rate = parseFloat(rateInput.value) || 0;
    
    // Auto-calculate Total = Qty * Rate
    const total = qty * rate;
    costInput.value = total.toFixed(2);
    
    calculateGrandTotal();
};

// Triggered when ANY Cost input changes manually
window.calculateGrandTotal = function() {
    let grandTotal = 0;
    const rows = ['dcdb','dc_mcb','dc_fuse','dc_spd','dc_cable','acdb','ac_mcb','ac_elcb','ac_spd','ac_cable'];
    
    rows.forEach(id => {
        const el = document.getElementById(`cost_${id}`);
        if(el) {
            // Read value directly to support Manual Overrides
            const val = parseFloat(el.value) || 0;
            grandTotal += val;
        }
    });

    document.getElementById('stage3_grand_total').innerText = grandTotal.toLocaleString('en-IN');
};

// --- 4. SAVE DATA ---
window.saveStage3 = function() {
    // Helper to extract data from either Select or Input
    const getData = (id) => {
        const el = document.getElementById(`sel_${id}`);
        let itemText = "-";
        
        if (el.tagName === 'SELECT') {
            itemText = el.options[el.selectedIndex]?.text || "-";
        } else {
            itemText = el.value; // It's a Fixed Input
        }

        return {
            item: itemText,
            size: document.getElementById(`size_${id}`).value,
            qty: document.getElementById(`qty_${id}`).value,
            // Critical: Saves the value currently in the box (Manual or Calculated)
            cost: document.getElementById(`cost_${id}`).value 
        };
    };

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
        totalCost: document.getElementById('stage3_grand_total').innerText
    };

    // Save to global state
    window.projectData.stage3 = data;
    
    // Proceed
    if (typeof switchStage === 'function') switchStage(4);
};