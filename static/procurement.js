/* ==========================================================================
   PROCUREMENT DASHBOARD LOGIC (Complete)
   - Handles Inventory Display
   - Dynamic Spec Fields
   - Cost-Per-Watt Calculation for Panels
   - API Integration
   ========================================================================== */

// --- CONFIG: Dynamic Fields per Category ---
const specFieldsMap = {
    "Solar Panel": [
        { key: "voc", label: "Voc (Open Circuit V)", type: "number", step: "0.01" },
        { key: "isc", label: "Isc (Short Circuit A)", type: "number", step: "0.01" },
        { key: "vmp", label: "Vmp (Max Power V)", type: "number", step: "0.01" },
        { key: "imp", label: "Imp (Max Power A)", type: "number", step: "0.01" },
        { key: "voc_coeff", label: "Voc Temp Coeff (%/C)", type: "number", step: "0.001" },
        { key: "pmax_coeff", label: "Pmax Temp Coeff (%/C)", type: "number", step: "0.001" },
        { key: "noct", label: "NOCT (°C)", type: "number" },
        { key: "degradation", label: "Degradation (%)", type: "number", step: "0.01" },
        { key: "bifacial", label: "Bifacial (true/false)", type: "text" },
        { key: "warranty", label: "Warranty (Years)", type: "number" }
    ],
    "Inverter": [
        { key: "output_current", label: "Max AC Output (A)", type: "number", step: "0.1" },
        { key: "mppt", label: "MPPT Count", type: "number" },
        { key: "vmax", label: "Max DC Input (V)", type: "number" },
        { key: "vmin", label: "Start/Min Voltage (V)", type: "number" },
        { key: "imax", label: "Max Input Current (A)", type: "number", step: "0.1" },
        { key: "isc", label: "Max Short Circuit (A)", type: "number", step: "0.1" },
        { key: "fix_loss", label: "Fix Loss (%)", type: "number", step: "0.1" },
        { key: "warranty", label: "Warranty (Years)", type: "number" }
    ],
    "Optimizer": [
        { key: "power_rated", label: "Rated Power (W)", type: "number" },
        { key: "vmax_in", label: "Max Input Voltage (V)", type: "number" },
        { key: "imax_in", label: "Max Input Current (A)", type: "number", step: "0.1" },
        { key: "ratio", label: "Ratio (e.g. 1:1, 2:1)", type: "text" },
        { key: "warranty", label: "Warranty (Years)", type: "number" }
    ],
    "Cable (AC)": [
        { key: "resistance", label: "Res (Ohm/km)", type: "number", step: "0.001" },
        { key: "ccc", label: "CCC (Amp)", type: "number" }
    ],
    "Cable (DC)": [
        { key: "resistance", label: "Res (Ohm/km)", type: "number", step: "0.001" },
        { key: "ccc", label: "CCC (Amp)", type: "number" }
    ],
    "Protection": [
        { key: "model", label: "Model Number", type: "text" },
        { key: "rating", label: "Rating (A)", type: "number" }
    ],
    "Distribution Box": [
        { key: "model", label: "Model Number", type: "text" },
        { key: "size", label: "Size (mm)", type: "text" }
    ],
    "Civil Material": [
        { key: "grade", label: "Grade / Type", type: "text" }
    ]
};

// Global Store
window.materialsDB = window.materialsDB || []; 

document.addEventListener('DOMContentLoaded', () => {
    loadInventory();
});


// ==================================================================
//  1. UI INTERACTION & FORM LOGIC
// ==================================================================

// --- Handle Category Switch (Shows/Hides Wattage Field) ---
function handleCategoryChange() {
    const catSelect = document.getElementById('catInput');
    const cat = catSelect.value;
    
    // 1. Toggle Panel-Specific Fields
    const isPanel = (cat === 'Solar Panel');
    
    const wattageGroup = document.getElementById('wattageGroup');
    if(wattageGroup) wattageGroup.style.display = isPanel ? 'block' : 'none';
    
    const ratePerWattGroup = document.getElementById('ratePerWattGroup');
    if(ratePerWattGroup) ratePerWattGroup.style.display = isPanel ? 'block' : 'none';
    
    // 2. Adjust Main Rate Field (Read-only for panels)
    const rateInput = document.getElementById('rateInput');
    const costGroup = document.getElementById('finalCostGroup');
    
    if (isPanel) {
        if(costGroup) {
            costGroup.classList.add('half-width');
            costGroup.style.flex = "unset";
        }
        rateInput.setAttribute('readonly', true);
        rateInput.style.backgroundColor = "#e2e8f0";
    } else {
        if(costGroup) {
            costGroup.classList.remove('half-width');
            costGroup.style.flex = "1";
        }
        rateInput.removeAttribute('readonly');
        rateInput.style.backgroundColor = "white";
    }

    // 3. Render Standard Dynamic Fields
    renderDynamicFields();
}

// --- Render Dynamic Fields based on Category ---
function renderDynamicFields(existingData = {}) {
    const catSelect = document.getElementById('catInput');
    if (!catSelect) return;

    const cat = catSelect.value;
    const container = document.getElementById('dynamicSpecsContainer');
    container.innerHTML = ""; 

    const fields = specFieldsMap[cat] || [{ key: "details", label: "Specification Details", type: "text" }];

    // Header
    const header = document.createElement("div");
    header.className = "specs-header";
    header.innerText = "Technical Specifications";
    container.appendChild(header);

    fields.forEach(field => {
        const wrapper = document.createElement("div");
        wrapper.className = "form-group spec-item";
        
        const label = document.createElement("label");
        label.innerText = field.label;
        
        const input = document.createElement("input");
        input.type = field.type;
        input.className = "dynamic-spec-input";
        input.dataset.key = field.key; 
        if (field.step) input.step = field.step;
        
        if (existingData && existingData[field.key] !== undefined) {
            input.value = existingData[field.key];
        }

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        container.appendChild(wrapper);
    });
}

// --- Auto-Calculate Total Cost (Wattage * Rate/Wp) ---
function calculateTotalCost() {
    const cat = document.getElementById('catInput').value;
    if (cat !== 'Solar Panel') return;

    const wp = parseFloat(document.getElementById('panelWattageInput').value) || 0;
    const rateWp = parseFloat(document.getElementById('ratePerWattInput').value) || 0;

    const total = wp * rateWp;
    document.getElementById('rateInput').value = total.toFixed(2);
}

// --- Prepare Data for Submit ---
function prepareSpecsForSubmit() {
    const inputs = document.querySelectorAll('.dynamic-spec-input');
    const specsObj = {};
    
    // 1. Gather Dynamic Inputs
    inputs.forEach(inp => {
        if (inp.value.trim() !== "") {
            const val = (inp.type === 'number') ? parseFloat(inp.value) : inp.value;
            specsObj[inp.dataset.key] = val;
        }
    });

    // 2. CRITICAL: Inject Panel Wattage into Specs (for Stage 1)
    const cat = document.getElementById('catInput').value;
    if (cat === 'Solar Panel') {
        const wp = parseFloat(document.getElementById('panelWattageInput').value);
        if (wp) {
            specsObj['wattage'] = wp; // Used by Stage 1 calc.js
            specsObj['pmax'] = wp;    // Alternative key
        }
    }

    document.getElementById('finalSpecsJSON').value = JSON.stringify(specsObj);
    return true; 
}


// ==================================================================
//  2. MODAL & TABLE ACTIONS
// ==================================================================

function openAddModal() { 
    document.getElementById('materialModal').style.display = 'flex'; 
    document.getElementById('modalTitle').innerText = "Add New Component";
    document.getElementById('saveBtn').innerText = "Save to Database";
    
    // Clear form
    document.getElementById('materialForm').reset();
    document.getElementById('materialId').value = ""; 
    document.getElementById('dynamicSpecsContainer').innerHTML = ""; 
    
    // Reset specific fields
    const wInput = document.getElementById('panelWattageInput');
    if(wInput) wInput.value = "";
    const rwInput = document.getElementById('ratePerWattInput');
    if(rwInput) rwInput.value = "";
    
    handleCategoryChange(); // Reset visibility
}

function openEditModal(id) {
    const item = window.materialsDB.find(m => m.id === id);
    if (!item) {
        console.error("Item not found:", id);
        return;
    }

    document.getElementById('materialModal').style.display = 'flex'; 
    document.getElementById('modalTitle').innerText = "Edit Component";
    document.getElementById('saveBtn').innerText = "Update Component";

    // Fill Standard Fields
    document.getElementById('materialId').value = item.id;
    document.getElementById('catInput').value = item.category;
    document.getElementById('subInput').value = item.subcategory || "";
    document.getElementById('nameInput').value = item.name;
    document.getElementById('stockInput').value = item.stock;
    document.getElementById('unitInput').value = item.unit;
    document.getElementById('rateInput').value = item.rate;

    // Trigger Visibility Update
    handleCategoryChange();

    // Fill Special Fields (Wattage)
    if (item.category === 'Solar Panel') {
        const wp = item.specifications?.wattage || item.specifications?.pmax || 0;
        const wInput = document.getElementById('panelWattageInput');
        if(wInput) wInput.value = wp;
        
        // Reverse Calculate Rate Per Watt
        const rate = parseFloat(item.rate) || 0;
        const rwInput = document.getElementById('ratePerWattInput');
        if(rwInput && wp > 0) {
            rwInput.value = (rate / wp).toFixed(2);
        }
    }

    renderDynamicFields(item.specifications || {});
}

function closeModal() { 
    document.getElementById('materialModal').style.display = 'none'; 
}

window.onclick = function(event) {
    if (event.target == document.getElementById('materialModal')) closeModal();
}


// ==================================================================
//  3. SEARCH & FILTER
// ==================================================================

function searchTable() {
    let input = document.getElementById("searchBox");
    let filter = input.value.toUpperCase();
    let rows = document.querySelectorAll("#inventoryTable tbody tr");

    rows.forEach(row => {
        let cat = row.querySelector(".category-cell")?.innerText || "";
        let name = row.querySelector(".name-cell")?.innerText || "";
        
        if (name.toUpperCase().includes(filter) || cat.toUpperCase().includes(filter)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

function filterCategory(event, cat) {
    let rows = document.querySelectorAll("#inventoryTable tbody tr");
    
    rows.forEach(row => {
        const rowCat = row.getAttribute('data-category');
        if (cat === 'all' || (rowCat && rowCat.includes(cat))) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
    
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
}


// ==================================================================
//  4. API INTEGRATION (Load, Save, Delete)
// ==================================================================

async function loadInventory() {
    const tbody = document.querySelector("#inventoryTable tbody");
    if (!tbody) return; // Guard clause

    try {
        const res = await fetch('/procurement/api/get_inventory'); 
        if (!res.ok) throw new Error("Failed to fetch inventory");
        
        const data = await res.json();
        window.materialsDB = data; // Update global store
        renderTable(data);
    } catch (error) {
        console.error("Load Error:", error);
    }
}

function renderTable(data) {
    const tbody = document.querySelector("#inventoryTable tbody");
    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No items found. Add one!</td></tr>';
        return;
    }

    data.forEach(item => {
        const tr = document.createElement("tr");
        tr.setAttribute("data-category", item.category);
        tr.id = `row-${item.id}`;

        let specHtml = "";
        if (item.specifications) {
            for (const [key, val] of Object.entries(item.specifications)) {
                // Formatting key names nicely
                const keyName = key.replace(/_/g, ' '); 
                specHtml += `<span class="spec-badge"><strong>${keyName}:</strong> ${val}</span> `;
            }
        } else {
            specHtml = '<span style="color:#ccc">-</span>';
        }

        tr.innerHTML = `
            <td class="category-cell" data-label="Category">${item.category}</td>
            <td data-label="Sub-Type"><span class="badge-sub">${item.subcategory || '-'}</span></td>
            <td class="name-cell" data-label="Name">${item.name}</td>
            <td class="specs-cell" data-label="Specs">${specHtml}</td>
            <td class="stock-cell ${item.stock < 20 ? 'low-stock' : ''}" data-label="Stock">${item.stock}</td>
            <td data-label="Unit">${item.unit}</td>
            <td data-label="Cost">₹${item.rate}</td>
            <td data-label="Action" style="display:flex; gap:5px;">
                <button class="btn-icon-edit" onclick="openEditModal(${item.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon-delete" onclick="deleteMaterial(${item.id})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Custom Save Function (if not using standard form submit)
// Note: Your HTML uses form action="/procurement/save", so standard submit works.
// This function is here if you want to switch to AJAX in the future.

async function deleteMaterial(id) {
    if(!confirm("Are you sure?")) return;

    try {
        const res = await fetch(`/procurement/delete/${id}`); // Assumes GET/Delete route
        if (res.ok) {
            loadInventory(); // Refresh UI
        } else {
            alert("Failed to delete.");
        }
    } catch (err) {
        console.error(err);
    }
}