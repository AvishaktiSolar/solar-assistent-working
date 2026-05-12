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

// Extend spec fields to cover all keys in materials.json
specFieldsMap["Solar Panel"].push(
    { key: "isc_coeff", label: "Isc Temp Coeff (%/C)", type: "number", step: "0.001" },
    { key: "operating_temp_min", label: "Operating Temp Min (deg C)", type: "number" },
    { key: "operating_temp_max", label: "Operating Temp Max (deg C)", type: "number" },
    { key: "max_system_voltage", label: "Max System Voltage (V)", type: "number" },
    { key: "module_fuse_rating", label: "Module Fuse Rating (A)", type: "number" },
    { key: "bifaciality_factor", label: "Bifaciality Factor", type: "number", step: "0.01" },
    { key: "cell_type", label: "Cell Type", type: "text" },
    { key: "cells", label: "Cell Count", type: "number" }
);

specFieldsMap["Inverter"].push(
    { key: "ac_power_kw", label: "AC Power (kW)", type: "number", step: "0.1" },
    { key: "string_class", label: "String Class", type: "text" },
    { key: "architecture", label: "Architecture", type: "text" },
    { key: "max_dc_power", label: "Max DC Power (W)", type: "number" },
    { key: "max_efficiency", label: "Max Efficiency (%)", type: "number", step: "0.1" },
    { key: "euro_efficiency", label: "Euro Efficiency (%)", type: "number", step: "0.1" },
    { key: "dimensions", label: "Dimensions", type: "text" },
    { key: "weight", label: "Weight (kg)", type: "number", step: "0.1" },
    { key: "protection_rating", label: "Protection Rating", type: "text" },
    { key: "synergy_units", label: "Synergy Units", type: "number" },
    { key: "note", label: "Notes", type: "text" }
);

specFieldsMap["Optimizer"].push(
    { key: "max_modules_per_optimizer", label: "Max Modules per Optimizer", type: "number" },
    { key: "isc_max", label: "Max Short Circuit (A)", type: "number", step: "0.1" },
    { key: "regulated_output_voltage", label: "Regulated Output Voltage (V)", type: "number" },
    { key: "max_output_voltage", label: "Max Output Voltage (V)", type: "number" },
    { key: "max_output_current", label: "Max Output Current (A)", type: "number", step: "0.1" },
    { key: "max_system_voltage", label: "Max System Voltage (V)", type: "number" },
    { key: "string_limits", label: "String Limits (JSON)", type: "textarea", json: true },
    { key: "application", label: "Application", type: "text" },
    { key: "note", label: "Notes", type: "text" }
);

specFieldsMap["Protection"].push(
    { key: "poles", label: "Poles", type: "text" }
);

specFieldsMap["Civil Material"].push(
    { key: "type", label: "Type", type: "text" }
);

// Global Store
window.materialsDB = window.materialsDB || []; 

document.addEventListener('DOMContentLoaded', () => {
    loadInventory();
    setupFormSubmission();
    setupDetailRowToggles();
});

// ==================================================================
//  EXPANDABLE STOCK DETAILS FUNCTIONALITY
// ==================================================================

// Setup click handlers for toggling detail rows
function setupDetailRowToggles() {
    const mainRows = document.querySelectorAll('tr.main-row');
    mainRows.forEach(row => {
        row.addEventListener('click', function() {
            toggleDetailRow(this);
        });
    });
}

// Toggle visibility of detail row
function toggleDetailRow(mainRow) {
    const detailRow = document.getElementById('detail-' + mainRow.id.substring(4)); // Remove "row-" prefix
    if (detailRow) {
        const isVisible = detailRow.style.display !== 'none';
        detailRow.style.display = isVisible ? 'none' : 'table-row';
        mainRow.classList.toggle('expanded');
    }
}

// ==================================================================
//  0. CARD RENDERING
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

    // 4. Protection-specific top-level fields
    const protectionGroup = document.getElementById('protectionRatingsGroup');
    if (protectionGroup) {
        protectionGroup.style.display = (cat === 'Protection') ? 'grid' : 'none';
    }
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
        
        const input = (field.type === "textarea") ? document.createElement("textarea") : document.createElement("input");
        if (field.type !== "textarea") input.type = field.type;
        input.className = "dynamic-spec-input";
        input.dataset.key = field.key; 
        if (field.step) input.step = field.step;
        if (field.json) input.dataset.json = "true";
        if (field.type === "textarea") input.rows = 3;
        
        if (existingData && existingData[field.key] !== undefined) {
            const val = existingData[field.key];
            if (field.json && typeof val === "object") {
                input.value = JSON.stringify(val, null, 2);
            } else {
                input.value = val;
            }
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
        const raw = (inp.value || "").trim();
        if (raw === "") return;

        const isJson = inp.dataset.json === "true";
        const isNumber = inp.type === 'number';

        let val = raw;
        if (isJson) {
            try {
                val = JSON.parse(raw);
            } catch (e) {
                val = raw;
            }
        } else if (isNumber) {
            val = parseFloat(raw);
        }

        specsObj[inp.dataset.key] = val;
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

// --- Smooth Save/Update (Prevent Page Jump) ---
function setupFormSubmission() {
    const form = document.getElementById('materialForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ok = prepareSpecsForSubmit();
        if (!ok) return;

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.classList.add('loading');

        const scrollContainer = document.querySelector('.card-body.scrollable-y');
        const prevScroll = scrollContainer ? scrollContainer.scrollTop : window.scrollY;

        try {
            const formData = new FormData(form);
            const res = await fetch(form.action, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error('Save failed');

            closeModal();
            await loadInventory();

            // Restore scroll position smoothly
            requestAnimationFrame(() => {
                if (scrollContainer) {
                    scrollContainer.scrollTo({ top: prevScroll, behavior: 'smooth' });
                } else {
                    window.scrollTo({ top: prevScroll, behavior: 'smooth' });
                }
            });
        } catch (err) {
            console.error(err);
            alert('Update failed. Please try again.');
        } finally {
            if (saveBtn) saveBtn.classList.remove('loading');
        }
    });
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
    const ratingAmp = document.getElementById('ratingAmpInput');
    if (ratingAmp) ratingAmp.value = "";
    const sensitivityMa = document.getElementById('sensitivityMaInput');
    if (sensitivityMa) sensitivityMa.value = "";
    
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

    // Fill Protection top-level fields
    const ratingAmp = document.getElementById('ratingAmpInput');
    if (ratingAmp) ratingAmp.value = item.rating_amp ?? "";
    const sensitivityMa = document.getElementById('sensitivityMaInput');
    if (sensitivityMa) sensitivityMa.value = item.sensitivity_ma ?? "";
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
    let rows = document.querySelectorAll(".list-row");

    rows.forEach(row => {
        let name = row.querySelector(".component-title")?.innerText || "";
        let category = row.getAttribute('data-category') || "";
        
        if (name.toUpperCase().includes(filter) || category.toUpperCase().includes(filter)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

function filterCategory(event, cat) {
    let rows = document.querySelectorAll(".list-row");
    
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
    const container = document.getElementById("inventoryList");
    if (!container) return; // Guard clause

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
    const container = document.getElementById("inventoryList");
    container.innerHTML = "";

    if (data.length === 0) {
        container.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 40px; color: #999;">No items found. Add one!</td></tr>';
        return;
    }

    data.forEach(item => {
        const formatSpecValue = (val) => {
            if (val && typeof val === "object") return JSON.stringify(val);
            return val;
        };

        // Build specs HTML
        let specsHTML = "";
        const mergedSpecs = Object.assign({}, item.specifications || {});
        if (item.rating_amp !== undefined) mergedSpecs.rating_amp = item.rating_amp;
        if (item.sensitivity_ma !== undefined) mergedSpecs.sensitivity_ma = item.sensitivity_ma;

        if (Object.keys(mergedSpecs).length) {
            const specs = Object.entries(mergedSpecs);
            specs.forEach(([key, val]) => {
                const keyName = key.replace(/_/g, ' ').charAt(0).toUpperCase() + key.replace(/_/g, ' ').slice(1);
                specsHTML += `<span class="spec-badge"><strong>${keyName}:</strong> ${formatSpecValue(val)}</span>`;
            });
        } else {
            specsHTML = '<span style="color:#999;">No specifications</span>';
        }

        // Build detail specs grid HTML
        let detailSpecsHTML = "";
        if (Object.keys(mergedSpecs).length) {
            const specs = Object.entries(mergedSpecs);
            specs.forEach(([key, val]) => {
                const keyName = key.replace(/_/g, ' ').charAt(0).toUpperCase() + key.replace(/_/g, ' ').slice(1);
                detailSpecsHTML += `<div class="spec-detail"><strong>${keyName}:</strong> <span>${formatSpecValue(val)}</span></div>`;
            });
        }

        // Main row
        const mainRow = document.createElement("tr");
        mainRow.className = "main-row";
        mainRow.setAttribute("data-category", item.category);
        mainRow.id = `row-${item.id}`;
        mainRow.innerHTML = `
            <td class="name-cell" data-label="Component Name">
                <div class="component-info">
                    <h3 class="component-name">${item.name}</h3>
                    <div class="component-badges">
                        <span class="badge-sub">${item.subcategory || '-'}</span>
                    </div>
                </div>
            </td>
            <td class="category-cell" data-label="Category">
                <span class="badge-sub">${item.category}</span>
            </td>
            <td class="specs-cell" data-label="Key Specs">
                <div class="specs-container">
                    ${specsHTML}
                </div>
            </td>
            <td class="stock-cell ${item.stock < 20 ? 'low-stock' : ''}" data-label="Stock">
                <span class="stock-pill">${item.stock}</span>
            </td>
            <td class="unit-cell" data-label="Unit">
                <span class="meta-pill unit-pill">${item.unit}</span>
            </td>
            <td class="cost-cell" data-label="Cost">
                <span class="meta-pill cost-pill">₹${"%.2f".replace("%", (item.rate || 0).toFixed(2))}</span>
            </td>
            <td class="actions-cell" data-label="Actions">
                <button class="btn-icon-edit" onclick="openEditModal(${item.id})" title="Edit Item" type="button">
                    <i class="fas fa-edit"></i>
                </button>
                <a href="/procurement/delete/${item.id}" class="btn-icon-delete" onclick="return confirm('Delete ${item.name}?')" title="Delete">
                    <i class="fas fa-trash"></i>
                </a>
            </td>
        `;
        container.appendChild(mainRow);

        // Detail row
        const detailRow = document.createElement("tr");
        detailRow.className = "stock-detail-row";
        detailRow.id = `detail-${item.id}`;
        detailRow.style.display = "none";
        detailRow.innerHTML = `
            <td colspan="7" class="detail-content">
                <div class="detail-specs-grid">
                    ${detailSpecsHTML}
                </div>
            </td>
        `;
        container.appendChild(detailRow);
    });

    // Re-attach toggle event listeners
    setupDetailRowToggles();
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
            alert("Delete failed.");
        }
    } catch (err) {
        console.error(err);
    }
}
