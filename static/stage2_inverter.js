// ==================================================================
//  stage2.js - Enhanced Multi-Inverter String & Optimizer Sizing Engine
//  Version: 3.1 - Fixed 2:1 optimizer check, ac_power_kw, global export
// ==================================================================

// ============================================================
// GLOBAL STATE
// ============================================================
let multiInverterDesign = [];
let currentSystemType = "string";
let hasAutoSelected = false;
let manualModeEnabled = false;
let manualLayoutState = null;
let manualLayoutSeq = 1;
let optimizerCatalog = [];

window.multiInverterDesign = multiInverterDesign;
window.currentSystemType = currentSystemType;
window.hasAutoSelected = hasAutoSelected;
window.manualModeEnabled = manualModeEnabled;
window.manualLayoutState = manualLayoutState;
window.optimizerCatalog = optimizerCatalog;

function getAcKw(specs) {
  if (!specs) return 0;
  if (specs.ac_power_kw && specs.ac_power_kw > 0) return specs.ac_power_kw;
  if (specs.maxAC && specs.maxAC > 0) return specs.maxAC / 1000;
  if (specs.ac_power && specs.ac_power > 0) return specs.ac_power / 1000;
  return 0;
}
function getMaxDcV(specs) {
  return specs?.max_dc_voltage || specs?.vmax || 1100;
}
function getMinMpptV(specs) {
  return specs?.min_mppt_voltage || specs?.vmin || 160;
}
function getMaxDcPow(specs) {
  if (!specs) return 15000;
  if (specs.max_dc_power && specs.max_dc_power > 0) return specs.max_dc_power;
  const acKw = getAcKw(specs);
  if (acKw > 0) return acKw * 1000 * 1.25;
  return 15000;
}

function getStage1Snapshot() {
  const globalData = window.projectData || {};
  return {
    ...globalData.stage1,
    ...(globalData.performance || {}),
    ...(globalData.design || {}),
    ...(globalData.parameters || {}),
    monthlyTable:
      globalData.performance?.monthlyTable || globalData.stage1?.monthlyTable || globalData.monthlyTable || [],
  };
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  loadInverters();
  loadOptimizers();

  const invCountInput = document.getElementById("inv_count");
  if (invCountInput) {
    invCountInput.addEventListener("change", () => {
      hasAutoSelected = true;
      calculateStage2();
    });
  }

  const recalcBtn = document.getElementById("btn_recalc");
  if (recalcBtn) {
    recalcBtn.addEventListener("click", () => {
      hasAutoSelected = false;
      calculateStage2();
    });
  }
});
  document.addEventListener('change', function(e) {
    if (e.target.id === 'inverter_selector' || e.target.id === 'optimizer_selector') {
      if (document.getElementById('ec4-wrap')) {
        _ec4UpdateRatio();
        _ec4UpdateHealthBar();
      }
    }
  });

// ============================================================
// LOADERS
// ============================================================
async function loadInverters() {
  try {
    const res = await fetch("/procurement/api/get_inverters");
    const items = await res.json();
    populateSelect("inverter_selector", items);
  } catch {
    populateSelect("inverter_selector", [
      {
        name: "SolarEdge 10kW (SE10K)",
        subcategory: "3-Phase",
        specifications: { ac_power_kw: 10, max_dc_voltage: 900, min_mppt_voltage: 750, mppt: 2, max_dc_power: 12500, imax_string: 15, string_class: "SE12.5K-20K" },
      },
      {
        name: "SolarEdge 15kW (SE15K)",
        subcategory: "3-Phase",
        specifications: { ac_power_kw: 15, max_dc_voltage: 1000, min_mppt_voltage: 750, mppt: 2, max_dc_power: 22500, imax_string: 15, string_class: "SE12.5K-20K" },
      },
      {
        name: "SolarEdge 17kW (SE17K)",
        subcategory: "3-Phase",
        specifications: { ac_power_kw: 17, max_dc_voltage: 900, min_mppt_voltage: 750, mppt: 2, max_dc_power: 21250, imax_string: 15, string_class: "SE12.5K-20K" },
      },
      {
        name: "Goodwe 10kW (GW10K-SDT)",
        subcategory: "3-Phase",
        specifications: { ac_power_kw: 10, max_dc_voltage: 1000, min_mppt_voltage: 160, mppt: 2, max_dc_power: 13000 },
      },
      {
        name: "Goodwe 15kW (GW15K-SDT)",
        subcategory: "3-Phase",
        specifications: { ac_power_kw: 15, max_dc_voltage: 1000, min_mppt_voltage: 160, mppt: 2, max_dc_power: 19500 },
      },
      {
        name: "Goodwe 5kW (GW5000-MS)",
        subcategory: "1-Phase",
        specifications: { ac_power_kw: 5, max_dc_voltage: 600, min_mppt_voltage: 60, mppt: 2, max_dc_power: 7500 },
      },
    ]);
  }
}

async function loadOptimizers() {
  try {
    const res = await fetch("/procurement/api/get_optimizers");
    const items = await res.json();
    optimizerCatalog = items;
    window.optimizerCatalog = optimizerCatalog;
    populateSelect("optimizer_selector", items);
  } catch {
    const fallback = [
      {
        name: "S650B Optimizer (1:1)",
        specifications: {
          ratio: "1:1",
          power_rated: 650,
          imax_in: 15,
          vmax_in: 80,
          string_limits: { "1-Phase": { min: 8, max: 25 }, "SE12.5K-20K": { min: 8, max: 25 } },
        },
      },
      {
        name: "S1200 Optimizer (2:1)",
        specifications: {
          ratio: "2:1",
          power_rated: 1200,
          imax_in: 15,
          vmax_in: 125,
          string_limits: { "1-Phase": { min: 14, max: 30 }, "SE12.5K-20K": { min: 14, max: 30 } },
          string_limits_1to1: { "1-Phase": { min: 8, max: 25 }, "SE12.5K-20K": { min: 8, max: 25 } },
        },
      },
    ];
    optimizerCatalog = fallback;
    window.optimizerCatalog = optimizerCatalog;
    populateSelect("optimizer_selector", fallback);
  }
}

function populateSelect(id, items) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select --</option>';
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = JSON.stringify(item);
    opt.innerText = item.name;
    sel.appendChild(opt);
  });
}

// ============================================================
// MULTI-INVERTER MANAGEMENT
// ============================================================
window.addInverterToDesign = function () {
  const invSelect = document.getElementById("inverter_selector");
  const countInput = document.getElementById("inv_count");
  if (!invSelect?.value) return alert("Please select an inverter first.");

  const inverter = JSON.parse(invSelect.value);
  const qty = parseInt(countInput?.value) || 1;

  // Get specs and calculate panels based on max DC capacity
  const specs = inverter.specifications || {};

  // Priority: max_dc_power > (ac_power_kw * 1.25) > (getAcKw * 1.3 * 1000)
  let maxDcWatts = specs.max_dc_power;

  if (!maxDcWatts) {
    const acKw = specs.ac_power_kw || getAcKw(specs) || 0;
    if (acKw > 0) {
      maxDcWatts = acKw * 1000 * 1.25; // 1.25x DC/AC ratio is optimal
    } else {
      maxDcWatts = 15000; // Safe fallback
    }
  }

  const panelWattage = window.projectData?.stage1?.panelWattage || 400;
  const suggestedPanels = Math.floor((maxDcWatts / panelWattage) * qty);

  multiInverterDesign.push({
    id: Date.now(),
    inverter,
    qty,
    assignedPanels: suggestedPanels,
    manualOverride: false,
    manualTrackers: [],
  });
  window.multiInverterDesign = multiInverterDesign;
  renderInverterSplitControls();
};

function renderInverterSplitControls() {
  const container = document.getElementById("added_inverters_list");
  if (!container) return;
  if (multiInverterDesign.length === 0) {
    container.innerHTML = "";
    return;
  }

  const totalPanels = window.projectData?.stage1?.panelCount || 0;
  const totalAssigned = multiInverterDesign.reduce((s, i) => s + (i.assignedPanels || 0), 0);
  const remaining = totalPanels - totalAssigned;
  const remainColor = remaining === 0 ? "#16a34a" : remaining < 0 ? "#dc2626" : "#d97706";

  container.innerHTML = `
    <div style="padding:8px 12px; background:#f1f5f9; border-radius:6px; margin-bottom:12px; font-size:0.75rem; border-left:3px solid ${remainColor};">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <span><strong style="color:${remainColor};">${totalAssigned}/${totalPanels}</strong> <span style="color:${remainColor};">${remaining === 0 ? "✓ Complete" : remaining > 0 ? remaining + " left" : Math.abs(remaining) + " over"}</span></span>
        <button onclick="recalculateInverterPanels()" style="padding:3px 8px; font-size:0.7rem; background:#e0f2fe; border:1px solid #0ea5e9; color:#0c4a6e; border-radius:4px; cursor:pointer; font-weight:600;">Recalculate</button>
      </div>
    </div>
    ${multiInverterDesign
      .map((item, idx) => {
        const specs = item.inverter.specifications || {};
        const acKw = getAcKw(specs);
        const maxDcKw = getMaxDcPow(specs) / 1000;
        const panelKwp =
          item.assignedPanels > 0
            ? ((item.assignedPanels * (window.projectData?.stage1?.panelWattage || 0)) / 1000).toFixed(2)
            : 0;
        return `
        <div style="border:1px solid #e2e8f0; border-radius:6px; margin-bottom:8px; padding:10px; background:white; display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div style="flex:1;">
            <div style="font-weight:600; font-size:0.85rem; margin-bottom:4px;">${item.qty}× ${item.inverter.name}</div>
            <div style="font-size:0.7rem; color:#64748b; margin-bottom:6px;">
              AC: ${(acKw * item.qty).toFixed(1)}kW | Max DC: ${(maxDcKw * item.qty).toFixed(1)}kWp
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="number" value="${item.assignedPanels}" min="0"
                     onchange="updateAssignedPanels(${item.id}, this.value)"
                     style="width:60px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px; font-weight:700; font-size:0.8rem;">
              <span style="font-size:0.75rem; color:#64748b;">${panelKwp} kWp</span>
            </div>
          </div>
          <button onclick="removeInverterFromDesign(${item.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;padding:4px;align-self:flex-start;">
            <i class="fas fa-trash" style="font-size:1rem;"></i>
          </button>
        </div>`;
      })
      .join("")}`;
}

window.updateAssignedPanels = function (id, val) {
  const item = multiInverterDesign.find(i => i.id === id);
  if (item) item.assignedPanels = parseInt(val) || 0;
  renderInverterSplitControls();
  calculateStage2();
};

window.removeInverterFromDesign = function (id) {
  multiInverterDesign = multiInverterDesign.filter(i => i.id !== id);
  window.multiInverterDesign = multiInverterDesign;
  renderInverterSplitControls();
  calculateStage2();
};

/**
 * Recalculate panel allocations based on current panel wattage
 * Useful when panel wattage changes in Stage 1
 */
window.recalculateInverterPanels = function () {
  const panelWattage = window.projectData?.stage1?.panelWattage || 400;
  multiInverterDesign.forEach(item => {
    const specs = item.inverter.specifications || {};

    // Priority: max_dc_power > (ac_power_kw * 1.25) > (getAcKw * 1.3 * 1000)
    let maxDcWatts = specs.max_dc_power;
    if (!maxDcWatts) {
      const acKw = specs.ac_power_kw || getAcKw(specs) || 0;
      if (acKw > 0) {
        maxDcWatts = acKw * 1000 * 1.25;
      } else {
        maxDcWatts = 15000;
      }
    }

    item.assignedPanels = Math.floor((maxDcWatts / panelWattage) * item.qty);
  });
  renderInverterSplitControls();
  calculateStage2();
};

// ============================================================
// STAGE REFRESH
// ============================================================
function refreshStage2UI() {
  const globalData = window.projectData || {};
  const s1 = { ...globalData.stage1, ...(globalData.design || {}), ...(globalData.parameters || {}) };
  if (s1.systemSizeKwp) {
    const capEl = document.getElementById("stg2_dc_capacity");
    const infoEl = document.getElementById("stg2_panel_info");
    if (capEl) capEl.innerText = `${(s1.systemSizeKwp || 0).toFixed(2)} kWp`;
    if (infoEl) infoEl.innerText = `${s1.panelCount || 0} Panels (${s1.panelWattage || 0}Wp)`;
    hasAutoSelected = false;
    setTimeout(calculateStage2, 500);
  }
}

function updateManualModeUI() {
  const btnOff = document.getElementById("btn-manual-off");
  const btnOn = document.getElementById("btn-manual-on");
  if (btnOff) btnOff.classList.toggle("active", !manualModeEnabled);
  if (btnOn) btnOn.classList.toggle("active", manualModeEnabled);

  const badge = document.getElementById("manual_mode_badge");
  if (badge) {
    badge.style.display = manualModeEnabled ? "inline" : "none";
    badge.innerText = manualModeEnabled
      ? (currentSystemType === "optimizer" ? "Optimizer Manual" : "String Manual")
      : "";
  }

  const manualSection = document.getElementById("manual_override_section");
  if (manualSection) manualSection.classList.toggle("hidden", !manualModeEnabled);
}

function setManualMode(enabled) {
  manualModeEnabled = !!enabled;
  window.manualModeEnabled = manualModeEnabled;
  updateManualModeUI();

  if (!manualModeEnabled) {
    manualLayoutState = null;
    window.manualLayoutState = manualLayoutState;
    interactiveCanvasState.currentString    = [];
    interactiveCanvasState.completedStrings = [];
    resetToAutoDesign();
    calculateStage2();
    return;
  }

  manualLayoutState = null;
  window.manualLayoutState = manualLayoutState;

  if (currentSystemType === "optimizer") {
    const invertersToUse = resolveManualInverters();
    if (!invertersToUse.length) {
      alert("Please select an inverter before enabling manual mode.");
      manualModeEnabled = false;
      window.manualModeEnabled = false;
      updateManualModeUI();
      return;
    }

    const optimizer = getSelectedOptimizer();
    if (!optimizer) {
      alert("Please select an optimizer before enabling manual mode.");
      manualModeEnabled = false;
      window.manualModeEnabled = false;
      updateManualModeUI();
      return;
    }

    // Reset canvas state fresh
    interactiveCanvasState.currentString    = [];
    interactiveCanvasState.completedStrings = [];

    const s1    = getStage1Snapshot();
    const total = s1.panelCount || 20;
    const cols  = Math.min(12, Math.ceil(Math.sqrt(total * 1.5)));
    const rows  = Math.ceil(total / cols);

    // Show section first, then render canvas, then calculateStage2
    const section = document.getElementById("visual_string_diagram");
    if (section) section.classList.remove("hidden");

    generateInteractiveGrid(rows, cols);
    calculateStage2();
    return;
  }

  // GoodWe string path
  const baseTrackers = getTrackersForManualSeed();
  if (baseTrackers?.length) {
    initManualLayoutFromTrackers(baseTrackers);
    applyManualLayoutToDesign();
  }
  updateManualStringBuilder();
  renderManualVisualDiagram();
  calculateStage2();
}

// ============================================================
// SYSTEM TYPE TOGGLE
// ============================================================
function setSystemType(type) {
  currentSystemType = type;
  window.currentSystemType = type;
  hasAutoSelected = false;
  window.hasAutoSelected = false;

  const btnString = document.getElementById("btn-type-string");
  const btnOpt    = document.getElementById("btn-type-opt");
  if (btnString) btnString.classList.toggle("active", type === "string");
  if (btnOpt)    btnOpt.classList.toggle("active", type === "optimizer");

  const isOpt      = type === "optimizer";
  const optSection = document.getElementById("optimizer_section");
  const modeA      = document.getElementById("report_mode_a");
  const modeB      = document.getElementById("report_mode_b");
  const indicator  = document.getElementById("report_mode_indicator");
  if (optSection) optSection.style.display = isOpt ? "block" : "none";
  if (modeA)      modeA.style.display      = isOpt ? "none"  : "block";
  if (modeB)      modeB.style.display      = isOpt ? "block" : "none";
  if (indicator)  indicator.innerText      = isOpt ? "SolarEdge Optimizer Mode" : "GoodWe String Inverter Mode";

  updateManualModeUI();
  calculateStage2();

  if (manualModeEnabled) {
    // Reset layout state so the new system type starts fresh
    manualLayoutState = null;
    window.manualLayoutState = manualLayoutState;

    if (type === "optimizer") {
      const invertersToUse = resolveManualInverters();
      const optimizer      = getSelectedOptimizer();

      if (!invertersToUse.length || !optimizer) {
        manualModeEnabled = false;
        window.manualModeEnabled = false;
        updateManualModeUI();
        return;
      }

      // Reset canvas state fresh on type switch
      interactiveCanvasState.currentString    = [];
      interactiveCanvasState.completedStrings = [];

      const s1    = getStage1Snapshot();
      const total = s1.panelCount || 20;
      const cols  = Math.min(12, Math.ceil(Math.sqrt(total * 1.5)));
      const rows  = Math.ceil(total / cols);

      const section = document.getElementById("visual_string_diagram");
      if (section) section.classList.remove("hidden");

      generateInteractiveGrid(rows, cols);
    } else {
      // Re-launch slider UI for string mode
      const baseTrackers = getTrackersForManualSeed();
      if (baseTrackers?.length) {
        initManualLayoutFromTrackers(baseTrackers);
        applyManualLayoutToDesign();
      }
      updateManualStringBuilder();
      renderManualVisualDiagram();
    }
  }
}
// ============================================================
// MAIN DISPATCHER
// ============================================================
function calculateStage2() {
  const globalData = window.projectData || {};
  const s1 = {
    ...globalData.stage1,
    ...(globalData.performance || {}),
    ...(globalData.design || {}),
    ...(globalData.parameters || {}),
    monthlyTable:
      globalData.performance?.monthlyTable || globalData.stage1?.monthlyTable || globalData.monthlyTable || [],
  };
  if (!s1.systemSizeKwp) return;
  
  // Auto-refresh canvas if panel count changed in manual optimizer mode
  refreshInteractiveCanvasIfEnabled();
  
  currentSystemType === "string" ? calculateGoodWeMode(s1) : calculateSolarEdgeMode(s1);
}

// ============================================================
// AUTO-SELECT INVERTER
// ============================================================
function autoSelectAndSizeInverter(dcCapacityKw, systemType) {
  if (hasAutoSelected) return;

  const sel = document.getElementById("inverter_selector");
  const countInput = document.getElementById("inv_count");
  const reqPhase = window.projectData?.stage1?.phase || "3-Phase";

  let bestMatchIndex = 0,
    minScore = Infinity,
    bestCount = 1;

  for (let i = 1; i < sel.options.length; i++) {
    const inv = JSON.parse(sel.options[i].value);
    const specs = inv.specifications || {};
    const isSE = inv.name.toLowerCase().includes("solaredge");

    // FIX #1: Logic inverted to allow all non-SE brands in string mode
    if (systemType === "optimizer" && !isSE) continue;
    if (systemType === "string" && isSE) continue;

    const invPhase = inv.subcategory || "";
    if (reqPhase === "1-Phase" && invPhase !== "1-Phase") continue;
    if (reqPhase === "3-Phase" && invPhase !== "3-Phase") continue;

    const acKw = getAcKw(specs);
    if (acKw <= 0) continue;

    let neededCount = Math.max(1, Math.min(Math.ceil(dcCapacityKw / (acKw * 1.25)), 10));
    const totalAc = acKw * neededCount;
    const actualRatio = dcCapacityKw / totalAc;

    // Scoring logic (prioritize 1.2 DC/AC ratio)
    let score = Math.abs(actualRatio - 1.2) * 100 + (neededCount - 1) * 50;
    if (score < minScore) {
      minScore = score;
      bestMatchIndex = i;
      bestCount = neededCount;
    }
  }

  if (bestMatchIndex > 0) {
    sel.selectedIndex = bestMatchIndex;
    if (countInput) countInput.value = bestCount;
    hasAutoSelected = true;
  }
}
// ============================================================
// GOODWE STRING MODE
// ============================================================
function calculateGoodWeMode(s1) {
  autoSelectAndSizeInverter(s1.systemSizeKwp, "string");
  const invSelect = document.getElementById("inverter_selector");
  const countInput = document.getElementById("inv_count");
  if (!invSelect?.value) return;

  const primaryInverter = JSON.parse(invSelect.value);
  const primaryQty = parseInt(countInput?.value) || 1;
  const units = buildUnitsToProcess(primaryInverter, primaryQty, s1.panelCount);

  let allTrackers = [],
    unitReports = [],
    totalDcKwp = 0,
    totalAcKw = 0;

  units.forEach(unit => {
    const specs = unit.inverter.specifications || {};
    const panelCount = unit.assignedPanels;
    const panelsPerInv = Math.floor(panelCount / (unit.qty || 1));
    let options;
    if (unit.manualOverride && unit.manualTrackers?.length > 0) {
      options = [buildManualStringOptionForUnit(unit, s1)];
    } else {
      options = generateStringOptions(panelsPerInv, s1.panelVoc || 49.5, s1.panelVmp || 41.5, specs, s1);
    }
    const best = options.find(o => o.valid) || options[0];

    const unitAcKw = getAcKw(specs) * unit.qty;
    const unitDcKwp = (panelCount * (s1.panelWattage || 0)) / 1000;

    const mappedTrackers = (best.trackers || []).map(t => ({
      ...t,
      assignedInverterId: unit.id,
      assignedInverterName: unit.inverter.name,
      assignedInverterQty: unit.qty,
    }));

    allTrackers.push(...mappedTrackers);
    totalDcKwp += unitDcKwp;
    totalAcKw += unitAcKw;
    unitReports.push({ unit, best, specs, unitDcKwp, unitAcKw, panelCount, trackers: mappedTrackers });
    runGoodWeVerification(best, specs, unit.inverter.name);
  });

  const systemOption = {
    id: "str_auto_design",
    trackers: allTrackers,
    config: allTrackers.map(t => `${t.assignedInverterName}|MPPT${t.id}:${t.formation}`).join(" | "),
    valid: allTrackers.length > 0,
    totalDcKwp,
    totalAcKw,
  };

  renderGoodWeSystemReport(unitReports, s1, systemOption);
  renderDetailedSystemReport(
    units.map((u, i) => ({ modelName: u.inverter.name, qty: u.qty, trackers: unitReports[i].trackers })),
  );
  renderVisualStringDiagram(allTrackers);
  if (s1.monthlyTable?.length > 0) renderMiniChart(s1.monthlyTable);
  applyDesignOption(systemOption, primaryInverter, primaryQty, s1);
}

function buildUnitsToProcess(primaryInverter, primaryQty, totalPanels) {
  if (multiInverterDesign.length === 0) {
    return [
      { id: "primary", inverter: primaryInverter, qty: primaryQty, assignedPanels: totalPanels, manualOverride: false },
    ];
  }
  const totalAssigned = multiInverterDesign.reduce((s, u) => s + (u.assignedPanels || 0), 0);
  if (totalAssigned < totalPanels) {
    multiInverterDesign[multiInverterDesign.length - 1].assignedPanels += totalPanels - totalAssigned;
  }
  return multiInverterDesign;
}

function runGoodWeVerification(bestOption, invSpecs, invName) {
  const errorList = document.getElementById("error_list");
  const errorPanel = document.getElementById("error_panel");
  const errors = [];
  const maxV = getMaxDcV(invSpecs);
  (bestOption.trackers || []).forEach(t => {
    if (t.vocAtCold > maxV) errors.push(`[${invName}] MPPT${t.id}: Voc (${t.vocAtCold.toFixed(0)}V) exceeds ${maxV}V!`);
    if (t.mismatchPct > 10) errors.push(`[${invName}] MPPT${t.id}: String Mismatch > 10%!`);
  });
  updateErrorUI(errors, errorPanel, errorList);
}

// ============================================================
// SOLAREDGE OPTIMIZER MODE
// ============================================================
function calculateSolarEdgeMode(s1) {
  autoSelectAndSizeInverter(s1.systemSizeKwp, "optimizer");
  const invSelect = document.getElementById("inverter_selector");
  const optSelect = document.getElementById("optimizer_selector");
  const countInput = document.getElementById("inv_count");
  if (!invSelect?.value || !optSelect?.value) return;

  const primaryInverter = JSON.parse(invSelect.value);
  const primaryQty = parseInt(countInput?.value) || 1;
  const optimizer = JSON.parse(optSelect.value);
  const units = buildUnitsToProcess(primaryInverter, primaryQty, s1.panelCount);

  let allTrackers = [],
    combinedBom = [],
    totalDcPower = 0,
    unitReports = [];

  units.forEach(unit => {
    const panelCount = unit.assignedPanels;
    const specs = unit.inverter.specifications || {};
    let options;
    if (unit.manualOverride && unit.manualTrackers?.length > 0) {
      options = [buildManualOptionForUnit(unit, optimizer, s1)];
    } else {
      options = generateOptimizerOptions(panelCount, s1.panelWattage, unit.inverter, optimizer, s1);
    }

    const best = options.find(o => o.valid) || options[0];
    if (!best) return;

    const mappedTrackers = (best.trackers || []).map(t => ({
      ...t,
      assignedInverterId: unit.id,
      assignedInverterName: unit.inverter.name,
    }));

    allTrackers.push(...mappedTrackers);
    combinedBom.push(...(best.bom || []));
    totalDcPower += best.totalDcPower || 0;

    const unitAcKw = getAcKw(specs) * unit.qty;
    const unitDcKwp = (panelCount * (s1.panelWattage || 0)) / 1000;

    unitReports.push({
      unit,
      best: { ...best, trackers: mappedTrackers },
      specs,
      unitDcKwp,
      unitAcKw,
      panelCount,
      trackers: mappedTrackers,
      isManualOverride: unit.manualOverride,
    });
  });

  const finalBom = consolidateBom(combinedBom);
  const aggregated = {
    id: "opt_calculated_epc",
    trackers: allTrackers,
    bom: finalBom,
    totalDcPower,
    stringPower: allTrackers.length > 0 ? totalDcPower / allTrackers.length / 1000 : 0,
    valid: allTrackers.length > 0 && unitReports.every(r => r.best.valid),
    config: `${allTrackers.length} String(s) across ${units.length} Unit(s)`,
  };

  runModeBVerification(aggregated, primaryInverter, optimizer);
  renderSolarEdgeMetrics(aggregated, primaryInverter, primaryQty, s1, unitReports);
  renderDetailedSystemReport(
    units.map(unit => ({
      modelName: unit.inverter.name,
      qty: unit.qty,
      trackers: allTrackers.filter(t => t.assignedInverterId === unit.id),
    })),
  );
  renderVisualStringDiagram(allTrackers);
  renderSolarEdgeCombinedReport(unitReports, s1, aggregated, optimizer);
  if (s1.monthlyTable?.length > 0) renderMiniChart(s1.monthlyTable);
  applyDesignOption(aggregated, primaryInverter, primaryQty, s1);
}

function buildManualStringOptionForUnit(unit, s1) {
  const trackers = unit.manualTrackers || [];
  const totalDcPower = trackers.reduce((s, t) => s + (t.stringPower || 0), 0);
  const totalPanels = trackers.reduce((s, t) => s + (t.panelsPerString || 0) * (t.stringQty || 1), 0);
  const errors = verifyManualStringDesign({ trackers, totalDcPower, totalPanels }, unit.inverter.specifications, s1);
  return {
    id: "str_manual_" + unit.id,
    trackers,
    totalDcPower,
    totalPanels,
    valid: errors.length === 0,
    warning: errors.join(" | ") || null,
    config: `${trackers.length} Manual MPPT(s)`,
  };
}

function buildManualOptionForUnit(unit, optimizer, s1) {
  const trackers = unit.manualTrackers;
  const totalDcPower = trackers.reduce((s, t) => s + t.stringPower, 0);
  const bom = trackers.map(t => ({ name: t.type === "2:1" ? getOptimizerNameForRatio(2) : getOptimizerNameForRatio(1), qty: t.optimizerQty }));
  return {
    id: "opt_manual_" + unit.id,
    trackers,
    bom: consolidateBom(bom),
    totalDcPower,
    stringPower: trackers.length > 0 ? totalDcPower / trackers.length / 1000 : 0,
    valid: true,
    warning: null,
    config: `${trackers.length} Manual String(s)`,
  };
}

// ============================================================
// VERIFICATION
// ============================================================
function runModeBVerification(bestOption, inverterOrSpecs, optimizer) {
  const errorList = document.getElementById("error_list");
  const errorPanel = document.getElementById("error_panel");
  const errors = [];
  const invSpecs = inverterOrSpecs?.specifications || inverterOrSpecs || {};
  const invPhase = inverterOrSpecs?.subcategory || invSpecs?.subcategory || "";
  if (bestOption.warning) errors.push(bestOption.warning);
  const maxKw = invPhase === "1-Phase" ? 5.7 : 11.25;
  if (bestOption.stringPower > maxKw)
    errors.push(`String power (${bestOption.stringPower.toFixed(2)}kW) exceeds limit!`);
  updateErrorUI(errors, errorPanel, errorList);
}

function updateErrorUI(errors, panel, list) {
  if (!panel || !list) return;
  if (errors.length > 0) {
    panel.classList.remove("hidden");
    list.innerHTML = errors.map(e => `<li><i class="fas fa-times-circle"></i> ${e}</li>`).join("");
  } else {
    panel.classList.add("hidden");
  }
}

// ============================================================
// STRING GENERATION (GoodWe)
// ============================================================
function generateStringOptions(panelCount, voc, vmp, invSpecs, s1) {
  const maxV = getMaxDcV(invSpecs);
  const minV = getMinMpptV(invSpecs);
  const totalMppts = invSpecs.mppt || 2;
  const invImax = invSpecs.imax || 12.5;
  const panelImp = s1.panelImp || 13.5;

  const vocCold = voc * (1 + (parseFloat(s1.voc_coeff || -0.26) / 100) * ((s1.tempMin || 10) - 25));
  const vmpHot = vmp * (1 + (parseFloat(s1.pmax_coeff || -0.33) / 100) * ((s1.tempMax || 45) - 25));

  const maxLen = Math.floor(maxV / vocCold);
  const minLen = Math.ceil(minV / vmpHot);

  const maxParallelStringsPerMppt = Math.floor(invImax / panelImp) || 1;

  let panelsPerString = Math.min(maxLen, Math.max(minLen, Math.floor((maxLen + minLen) / 2)));

  for (let l = Math.min(panelCount, maxLen); l >= minLen; l--) {
    if (panelCount % l === 0 || panelCount % l >= minLen) {
      panelsPerString = l;
      break;
    }
  }

  const totalStringsNeeded = Math.ceil(panelCount / panelsPerString);
  const stringsPerMppt = Math.ceil(totalStringsNeeded / totalMppts);

  const currentExceeded = stringsPerMppt > maxParallelStringsPerMppt;

  let trackers = [];
  let panelsRemaining = panelCount;
  let stringsRemaining = totalStringsNeeded;

  for (let i = 1; i <= totalMppts && panelsRemaining > 0; i++) {
    const sOnT = Math.min(stringsPerMppt, stringsRemaining);
    const pOnT = Math.min(panelsRemaining, sOnT * panelsPerString);
    const actualPPS = sOnT > 0 ? Math.ceil(pOnT / sOnT) : 0;

    if (actualPPS > 0) {
      trackers.push({
        id: i,
        formation: `${sOnT}*${actualPPS}`,
        panelsPerString: actualPPS,
        stringQty: sOnT,
        vmpAt25: actualPPS * vmp,
        vocAtCold: actualPPS * vocCold,
        current: sOnT * panelImp,
        isCurrentValid: sOnT <= maxParallelStringsPerMppt,
      });
      panelsRemaining -= sOnT * actualPPS;
      stringsRemaining -= sOnT;
    }
  }

  return [
    {
      id: "str_auto",
      trackers,
      valid:
        !currentExceeded &&
        panelsRemaining === 0 &&
        trackers.every(t => t.vocAtCold <= maxV && t.panelsPerString >= minLen),
      warning: currentExceeded
        ? `Critical: MPPT Current (${(stringsPerMppt * panelImp).toFixed(1)}A) exceeds Inverter Limit (${invImax}A)`
        : null,
    },
  ];
}
// ============================================================
// OPTIMIZER GENERATION (SolarEdge)  FIXED 2:1 PRIORITY
// ============================================================
/**
 * generateOptimizerOptions (v3.2)
 * Enhanced with Dynamic Commercial Limits, String Class Mapping, and Imax Safety.
 */
function generateOptimizerOptions(panelCount, wattage, inverterOrSpecs, selectedOpt, s1) {
  const options = [];
  const warnings = [];
  const invSpecs = inverterOrSpecs?.specifications || inverterOrSpecs || {};
  const invPhase = inverterOrSpecs?.subcategory || invSpecs?.subcategory || "";

  const ratioStr = selectedOpt?.specifications?.ratio?.toString() || "1:1";
  const ratio = parseInt(ratioStr.charAt(0)) || 1;

  console.log("🔧 [S1200 DEBUG] Optimizer:", selectedOpt?.name);
  console.log("🔧 [S1200 DEBUG] Ratio string:", ratioStr, "| Parsed ratio:", ratio);
  console.log("🔧 [S1200 DEBUG] Panel count:", panelCount, "| Inverter phase:", invPhase);

  const panelPmax = s1?.panelWattage || wattage || 580;
  const panelImp = s1?.panelImp || 13.5;
  const tMin = s1?.tempMin || 10;
  const vocBase = s1?.panelVoc || 49.5;
  const vmpBase = s1?.panelVmp || 41.5;
  const vocCoeff = Math.abs(parseFloat(s1?.voc_coeff || -0.26) / 100);
  const vocCold = vocBase * (1 + vocCoeff * (25 - tMin));

  const optPower = selectedOpt?.specifications?.power_rated || 650;
  const optImaxIn = selectedOpt?.specifications?.imax_in || 15;
  const optVmaxIn = selectedOpt?.specifications?.vmax_in || 80;

  const iMatch = panelImp <= optImaxIn;
  const pMatch = panelPmax * ratio <= optPower;
  const vMatch = vocCold <= optVmaxIn;

  if (!iMatch || !pMatch || !vMatch) {
    return [
      {
        id: "invalid",
        title: " Incompatible Hardware",
        valid: false,
        warning: `${!iMatch ? ` Panel Imp (${panelImp}A) > Opt Imax (${optImaxIn}A) | ` : ""}${!pMatch ? ` Total P (${panelPmax * ratio}W) > Opt P (${optPower}W) | ` : ""}${!vMatch ? ` Voc Cold (${vocCold.toFixed(1)}V) > Opt Vmax (${optVmaxIn}V)` : ""}`,
        trackers: [],
        bom: [],
        totalDcPower: 0,
      },
    ];
  }

  const is1Phase = invPhase === "1-Phase";
  const targetVolt = is1Phase ? 350 : 750;
  const invImaxStr = invSpecs.imax_string || 15;
  const maxStrPower = invImaxStr * targetVolt;
  const maxDcPower = getMaxDcPow(invSpecs);

  const invClass = invSpecs.string_class || (is1Phase ? "1-Phase" : "SE12.5K-20K");
  const classLimits = selectedOpt?.specifications?.string_limits?.[invClass] || {
    min: ratio === 2 ? 14 : 8,
    max: ratio === 2 ? 30 : 25,
  };

  console.log("🔧 [S1200 DEBUG] Is1Phase:", is1Phase, "| InvClass:", invClass);
  console.log("🔧 [S1200 DEBUG] ClassLimits:", classLimits);
  console.log("🔧 [S1200 DEBUG] MaxDcPower:", maxDcPower, "| MaxStrPower:", maxStrPower);

  const nMin = classLimits.min;
  const nMax = classLimits.max;

  let optLen = nMin;
  const wattsPerOptimizer = panelPmax * ratio;

  if (optLen * wattsPerOptimizer < targetVolt * 0.8) {
    optLen = Math.ceil((targetVolt * 0.8) / wattsPerOptimizer);
  }
  optLen = Math.max(nMin, Math.min(optLen, nMax));

  while (optLen * wattsPerOptimizer > maxStrPower && optLen > nMin) optLen--;

  let remaining = panelCount;
  let usedDcPower = 0;
  let trackers = [];
  let bom = [];
  let tId = 1;

  const pps = optLen * ratio;
  const strPower = pps * panelPmax;

  console.log("🔧 [S1200 DEBUG] OptLen:", optLen, "| PPS:", pps, "| StrPower:", strPower);
  console.log("🔧 [S1200 DEBUG] While condition - remaining:", remaining, ">= pps:", pps, "?", remaining >= pps);
  console.log(
    "🔧 [S1200 DEBUG] While condition - usedDcPower:",
    usedDcPower,
    "+ strPower:",
    strPower,
    "<= maxDcPower:",
    maxDcPower,
    "?",
    usedDcPower + strPower <= maxDcPower,
  );

  while (remaining >= pps && usedDcPower + strPower <= maxDcPower) {
    trackers.push({
      id: tId++,
      formation: `1*${optLen}`,
      stringQty: 1,
      panelsPerString: pps,
      optimizerQty: optLen,
      type: `${ratio}:1`,
      vmpAt25: vmpBase * optLen,
      vocAtCold: vocCold * optLen,
      stringPower: strPower,
    });
    bom.push({
      name: selectedOpt.name,
      qty: optLen,
    });
    remaining -= pps;
    usedDcPower += strPower;
  }

  // Handle remaining panels for both 2:1 (fallback to 1:1) and 1:1 (direct) ratios
  if (remaining > 0 && ratio === 2) {
    const fallback1to1Limits = selectedOpt?.specifications?.string_limits_1to1?.[invClass] || { min: 1, max: 16 };
    const fb1to1Min = Math.max(1, Math.min(16, fallback1to1Limits.min || 1));
    const fb1to1Max = Math.max(fb1to1Min, Math.min(16, fallback1to1Limits.max || 16));

    let fbLen = Math.min(remaining, fb1to1Max);
    if (fbLen * panelPmax < targetVolt * 0.8) fbLen = Math.ceil((targetVolt * 0.8) / panelPmax);
    fbLen = Math.max(fb1to1Min, Math.min(fbLen, fb1to1Max));

    while (fbLen * panelPmax > maxStrPower && fbLen > fb1to1Min) fbLen--;

    while (remaining >= fb1to1Min) {
      const fbPanels = Math.min(remaining, fbLen);
      const fbStrPower = fbPanels * panelPmax;
      if (usedDcPower + fbStrPower > maxDcPower) break;

      trackers.push({
        id: tId++,
        formation: `1*${fbPanels}`,
        stringQty: 1,
        panelsPerString: fbPanels,
        optimizerQty: fbPanels,
        type: "1:1",
        vmpAt25: vmpBase * fbPanels,
        vocAtCold: vocCold * fbPanels,
        stringPower: fbStrPower,
      });
      bom.push({
        name: "S650B Optimizer",
        qty: fbPanels,
      });
      usedDcPower += fbStrPower;
      remaining -= fbPanels;
    }

    // Always consume a final remainder with 1:1 cleanup (EPC request: 2:1 first, then 1:1 for leftover panels).
    if (remaining > 0) {
      const finalFbPanels = Math.min(remaining, fb1to1Max);
      const finalFbStrPower = finalFbPanels * panelPmax;
      if (usedDcPower + finalFbStrPower <= maxDcPower) {
        trackers.push({
          id: tId++,
          formation: `1*${finalFbPanels}`,
          stringQty: 1,
          panelsPerString: finalFbPanels,
          optimizerQty: finalFbPanels,
          type: "1:1",
          vmpAt25: vmpBase * finalFbPanels,
          vocAtCold: vocCold * finalFbPanels,
          stringPower: finalFbStrPower,
        });
        bom.push({
          name: "S650B Optimizer",
          qty: finalFbPanels,
        });
        if (finalFbPanels < fb1to1Min) {
          warnings.push(
            `Cleanup 1:1 string uses ${finalFbPanels} optimizers (< min ${fb1to1Min}) to finish panel allocation.`,
          );
        }
        usedDcPower += finalFbStrPower;
        remaining -= finalFbPanels;
      }
    }
  } else if (remaining > 0 && ratio === 1) {
    // Handle remaining panels for 1:1 ratio (NEW FIX)
    const opt1to1Limits = selectedOpt?.specifications?.string_limits_1to1?.[invClass] || selectedOpt?.specifications?.string_limits?.[invClass] || { min: 1, max: 16 };
    const opt1to1Min = Math.max(1, Math.min(16, opt1to1Limits.min || 1));
    const opt1to1Max = Math.max(opt1to1Min, Math.min(16, opt1to1Limits.max || 16));

    // Try to create additional strings from remaining panels
    while (remaining > 0) {
      let rmLen = Math.min(remaining, opt1to1Max);

      // Ensure minimum string voltage is met
      if (rmLen * panelPmax < targetVolt * 0.8) {
        rmLen = Math.ceil((targetVolt * 0.8) / panelPmax);
      }

      rmLen = Math.max(opt1to1Min, Math.min(rmLen, opt1to1Max));

      // Check if this string violates power limits
      while (rmLen * panelPmax > maxStrPower && rmLen > opt1to1Min) {
        rmLen--;
      }

      // If we have enough remaining panels for a valid string
      if (remaining >= rmLen) {
        const rmStrPower = rmLen * panelPmax;
        if (usedDcPower + rmStrPower > maxDcPower) break;

        trackers.push({
          id: tId++,
          formation: `1*${rmLen}`,
          stringQty: 1,
          panelsPerString: rmLen,
          optimizerQty: rmLen,
          type: "1:1",
          vmpAt25: vmpBase * rmLen,
          vocAtCold: vocCold * rmLen,
          stringPower: rmStrPower,
        });
        bom.push({
          name: "S650B Optimizer",
          qty: rmLen,
        });
        usedDcPower += rmStrPower;
        remaining -= rmLen;
      } else {
        break;
      }
    }

    // Final cleanup for any remaining panels (use smaller string if necessary)
    if (remaining > 0) {
      const finalPanels = remaining;
      const finalStrPower = finalPanels * panelPmax;
      if (usedDcPower + finalStrPower <= maxDcPower) {
        trackers.push({
          id: tId++,
          formation: `1*${finalPanels}`,
          stringQty: 1,
          panelsPerString: finalPanels,
          optimizerQty: finalPanels,
          type: "1:1",
          vmpAt25: vmpBase * finalPanels,
          vocAtCold: vocCold * finalPanels,
          stringPower: finalStrPower,
        });
        bom.push({
          name: "S650B Optimizer",
          qty: finalPanels,
        });
        if (finalPanels < opt1to1Min) {
          warnings.push(
            `Cleanup 1:1 string uses ${finalPanels} optimizers (< min ${opt1to1Min}) to finish panel allocation.`,
          );
        }
        usedDcPower += finalStrPower;
        remaining -= finalPanels;
      }
    }
  }

  const totalPanelUsed = panelCount - remaining;
  if (remaining > 0)
    warnings.push(
      ` ${remaining} panels could not be assigned to a valid string (DC power limit or voltage constraint).`,
    );
  if (ratio === 2 && panelCount % 2 !== 0)
    warnings.push(`Note: Odd panel count handled with additional 1:1 cleanup string.`);

  options.push({
    id: "opt_calculated_epc",
    title: " EPC Cost-Optimized Design",
    desc: `Bus: ${targetVolt}V | Class: ${invClass} | ${ratio}:1 primary`,
    config: `${trackers.length} String(s) | ${totalPanelUsed}/${panelCount} Panels`,
    trackers,
    bom: consolidateBom(bom),
    totalDcPower: usedDcPower,
    stringPower: trackers.length > 0 ? usedDcPower / trackers.length / 1000 : 0,
    valid: remaining === 0 && usedDcPower <= maxDcPower,
    warning: warnings.join(" | "),
    canOverride: true,
    metadata: {
      invClass,
      maxStrPower,
      dcUtilization: ((usedDcPower / maxDcPower) * 100).toFixed(1) + "%",
    },
  });

  return options;
}
// ============================================================
// RENDER: GOODWE COMBINED REPORT
// ============================================================
function renderGoodWeSystemReport(unitReports, s1, systemOption) {
  const container = document.getElementById("goodwe_combined_report");
  if (!container) return;

  const totalAcKw = unitReports.reduce((s, r) => s + r.unitAcKw, 0);
  const totalDcKwp = unitReports.reduce((s, r) => s + r.unitDcKwp, 0);
  const ratio = totalAcKw > 0 ? (totalDcKwp / totalAcKw).toFixed(2) : "-";
  const ratioColor = ratio !== "-" && ratio >= 1.15 && ratio <= 1.25 ? "#16a34a" : "#d97706";

  container.innerHTML = `
    <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; margin-bottom:20px;">
      <div style="background:linear-gradient(135deg,#1e293b,#0f172a); color:white; padding:16px 20px;">
        <div style="font-size:0.65rem; text-transform:uppercase; opacity:0.6; letter-spacing:1.5px; font-weight:700; margin-bottom:8px;">GoodWe System Combined Report</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px;">
          ${[
            ["Total DC Capacity", totalDcKwp.toFixed(2) + " kWp"],
            ["Total AC Capacity", totalAcKw.toFixed(1) + " kW"],
            ["DC/AC Ratio", ratio],
            ["Total Inverter Units", unitReports.reduce((s, r) => s + r.unit.qty, 0).toString()],
            ["Total Panels", s1.panelCount?.toString() || "-"],
          ]
            .map(
              ([lbl, val]) => `
            <div style="background:rgba(255,255,255,0.08); padding:10px; border-radius:8px; text-align:center;">
              <div style="font-size:0.6rem; opacity:0.7; margin-bottom:4px; text-transform:uppercase;">${lbl}</div>
              <div style="font-size:1.05rem; font-weight:800; ${lbl === "DC/AC Ratio" ? "color:" + ratioColor : ""}">${val}</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>
      <div style="padding:16px;">
        ${unitReports
          .map((r, idx) => {
            const dcAc = r.unitAcKw > 0 ? (r.unitDcKwp / r.unitAcKw).toFixed(2) : "-";
            const dcAcColor = dcAc !== "-" && dcAc >= 1.15 && dcAc <= 1.25 ? "#16a34a" : "#d97706";
            return `
          <div style="border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:12px; background:#f8fafc;">
            <div style="font-weight:800; color:#1e293b; font-size:0.9rem; margin-bottom:10px;">
              <span style="background:#3b82f6; color:white; padding:2px 8px; border-radius:4px; font-size:0.7rem; margin-right:6px;">Unit ${idx + 1}</span>
              ${r.unit.qty} ${r.unit.inverter.name}
              ${r.isManualOverride ? '<span style="background:#f59e0b; color:white; padding:2px 6px; border-radius:4px; font-size:0.65rem; margin-left:6px;"> Manual</span>' : ""}
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px; margin-bottom:12px;">
              ${[
                ["DC Capacity", r.unitDcKwp.toFixed(2) + " kWp", "#3b82f6"],
                ["AC Capacity", r.unitAcKw.toFixed(1) + " kW", "#8b5cf6"],
                ["DC/AC Ratio", dcAc, dcAcColor],
                ["MPPT Trackers", r.trackers.length + " MPPT", "#0ea5e9"],
                ["Panels", r.panelCount.toString(), "#64748b"],
              ]
                .map(
                  ([lbl, val, col]) => `
                <div style="background:white; padding:8px; border-radius:6px; border:1px solid #e2e8f0; text-align:center;">
                  <div style="font-size:0.6rem; color:#94a3b8; margin-bottom:2px;">${lbl}</div>
                  <div style="font-size:0.85rem; font-weight:800; color:${col};">${val}</div>
                </div>`,
                )
                .join("")}
            </div>
            <!-- Panel Allocation Info for Multi-Inverter -->
            ${interactiveCanvasState.inverterSlices && interactiveCanvasState.inverterSlices.length > 0 ? `
            <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:10px; margin-bottom:12px;">
              <div style="font-size:0.65rem; font-weight:700; color:#0369a1; margin-bottom:6px; text-transform:uppercase;">Panel Allocation</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${interactiveCanvasState.inverterSlices.map((s, idx) => `
                  <span style="display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border-radius:4px; background:white; border:1px solid ${s.color};">
                    <span style="width:6px; height:6px; border-radius:50%; background:${s.color};"></span>
                    <span style="font-size:0.7rem; font-weight:700; color:#1e293b;">INV ${s.idx + 1}: ${s.count}p (${s.start + 1}-${s.end + 1})</span>
                  </span>
                `).join("")}
              </div>
            </div>
            ` : ''}
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${r.trackers
                .map(t => {
                  const [strings, panels] = t.formation.split("*").map(Number);
                  const vOk = t.vocAtCold <= getMaxDcV(r.specs);
                  return `<div style="background:${vOk ? "#f0fdf4" : "#fee2e2"}; border:1px solid ${vOk ? "#86efac" : "#fca5a5"}; border-radius:6px; padding:6px 10px; font-size:0.75rem;">
                  <strong style="color:${vOk ? "#166534" : "#991b1b"};">MPPT${t.id}</strong>
                  <span style="color:#64748b; margin:0 4px;">|</span>
                  <span style="font-family:monospace; font-weight:700;">${t.formation}</span>
                  <span style="color:#94a3b8; margin-left:4px;">${strings * panels} panels</span>
                </div>`;
                })
                .join("")}
            </div>
          </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

// ============================================================
// RENDER: SOLAREDGE COMBINED REPORT
// ============================================================
function renderSolarEdgeCombinedReport(unitReports, s1, aggregated, optimizer) {
  const container = document.getElementById("se_combined_report");
  if (!container) return;

  const totalAcKw = unitReports.reduce((s, r) => s + r.unitAcKw, 0);
  const totalDcKwp = (aggregated.totalDcPower || 0) / 1000;
  const ratio = totalAcKw > 0 ? (totalDcKwp / totalAcKw).toFixed(2) : "-";
  const ratioColor = ratio !== "-" && ratio >= 1.15 && ratio <= 1.25 ? "#16a34a" : "#d97706";
  const totalOpts = (aggregated.bom || []).reduce((s, b) => s + b.qty, 0);

  // Build complete BOM with all components
  const completeBom = [];
  (aggregated.bom || []).forEach(item => {
    const existing = completeBom.find(b => b.name === item.name);
    if (existing) {
      existing.qty += item.qty;
    } else {
      completeBom.push({ ...item });
    }
  });

  container.innerHTML = `
    <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; margin-bottom:20px;">
      <div style="background:linear-gradient(135deg,#1e3a8a,#3b82f6); color:white; padding:16px 20px;">
        <div style="font-size:0.65rem; text-transform:uppercase; opacity:0.6; letter-spacing:1.5px; font-weight:700; margin-bottom:8px;">SolarEdge System Combined Report</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px;">
          ${[
            ["Total DC Capacity", totalDcKwp.toFixed(2) + " kWp"],
            ["Total AC Capacity", totalAcKw.toFixed(1) + " kW"],
            ["DC/AC Ratio", ratio],
            ["Total Optimizers", totalOpts.toString()],
            ["Total Strings", aggregated.trackers.length.toString()],
          ]
            .map(
              ([lbl, val]) => `
            <div style="background:rgba(255,255,255,0.12); padding:10px; border-radius:8px; text-align:center;">
              <div style="font-size:0.6rem; opacity:0.7; margin-bottom:4px; text-transform:uppercase;">${lbl}</div>
              <div style="font-size:1.05rem; font-weight:800; ${lbl === "DC/AC Ratio" ? "color:" + ratioColor : ""}">${val}</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>

      <!-- COMPLETE BILL OF MATERIALS -->
      <div style="padding:16px 20px; background:#f0f9ff; border-bottom:2px solid #bfdbfe;">
        <div style="font-size:0.75rem; font-weight:800; color:#1e40af; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px;"> Complete Bill of Materials</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px;">
          ${completeBom
            .map(
              item => `
            <div style="background:white; border:1.5px solid #3b82f6; border-radius:8px; padding:12px; position:relative;">
              <div style="position:absolute; top:6px; right:10px; background:#3b82f6; color:white; font-size:0.85rem; font-weight:800; padding:3px 10px; border-radius:12px;">
                ${item.qty}
              </div>
              <div style="font-size:0.8rem; color:#0f172a; font-weight:700; margin-right:40px; word-break:break-word;">
                ${item.name}
              </div>
            </div>`,
            )
            .join("")}
          ${unitReports
            .map(
              (r, idx) => `
            <div style="background:#dbeafe; border:1.5px solid #0ea5e9; border-radius:8px; padding:12px; position:relative;">
              <div style="position:absolute; top:6px; right:10px; background:#0ea5e9; color:white; font-size:0.85rem; font-weight:800; padding:3px 10px; border-radius:12px;">
                ${r.unit.qty}
              </div>
              <div style="font-size:0.8rem; color:#0c4a6e; font-weight:700; margin-right:40px; word-break:break-word;">
                ${r.unit.inverter.name}
              </div>
            </div>`,
            )
            .join("")}
        </div>
      </div>
      <!-- INVERTER DETAILS PER UNIT -->
      <div style="padding:16px;">
        ${unitReports
          .map((r, idx) => {
            const unitOpts = r.trackers.reduce((s, t) => s + (t.optimizerQty || 0), 0);
            const dcAc = r.unitAcKw > 0 ? (r.unitDcKwp / r.unitAcKw).toFixed(2) : "-";
            const dcAcColor = dcAc !== "-" && dcAc >= 1.15 && dcAc <= 1.25 ? "#16a34a" : "#d97706";
            const ratioTypes = [...new Set(r.trackers.map(t => t.type || "-"))].join(", ");
            return `
          <div style="border:1.5px solid #cbd5e1; border-radius:12px; padding:16px; margin-bottom:14px; background:linear-gradient(135deg,#f8fafc,#f0f9ff); transition:all 0.3s ease; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <strong style="font-size:0.9rem; color:#1e293b;">
                <span style="background:#6366f1; color:white; padding:3px 10px; border-radius:6px; font-size:0.7rem; margin-right:8px; font-weight:800;">Unit ${idx + 1}</span>
                ${r.unit.qty} ${r.unit.inverter.name}
                ${r.isManualOverride ? '<span style="background:#f59e0b; color:white; padding:2px 6px; border-radius:4px; font-size:0.65rem; margin-left:6px;"> Manual</span>' : ""}
              </strong>
              <span style="font-size:0.7rem; background:#dbeafe; color:#1d4ed8; padding:4px 10px; border-radius:6px; font-weight:700;">
                ${ratioTypes ? "Optimizer: " + ratioTypes : "No strings"}
              </span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px; margin-bottom:12px;">
              ${[
                ["DC Capacity", r.unitDcKwp.toFixed(2) + " kWp", "#3b82f6"],
                ["AC Capacity", r.unitAcKw.toFixed(1) + " kW", "#8b5cf6"],
                ["DC/AC Ratio", dcAc, dcAcColor],
                ["Strings", r.trackers.length.toString(), "#0ea5e9"],
                ["Optimizers", unitOpts.toString(), "#ec4899"],
                ["Panels", r.panelCount.toString(), "#64748b"],
              ]
                .map(
                  ([lbl, val, col]) => `
                <div style="background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0; text-align:center; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                  <div style="font-size:0.6rem; color:#94a3b8; margin-bottom:3px; font-weight:600;">${lbl}</div>
                  <div style="font-size:0.95rem; font-weight:800; color:${col};">${val}</div>
                </div>`,
                )
                .join("")}
            </div>
            <!-- Panel Allocation Info for Multi-Inverter SolarEdge -->
            ${interactiveCanvasState.inverterSlices && interactiveCanvasState.inverterSlices.length > 0 ? `
            <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:10px; margin:12px 0;">
              <div style="font-size:0.65rem; font-weight:700; color:#0369a1; margin-bottom:6px; text-transform:uppercase;">Panel Allocation</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${interactiveCanvasState.inverterSlices.map((s, idx) => `
                  <span style="display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border-radius:4px; background:white; border:1px solid ${s.color};">
                    <span style="width:6px; height:6px; border-radius:50%; background:${s.color};"></span>
                    <span style="font-size:0.7rem; font-weight:700; color:#1e293b;">INV ${s.idx + 1}: ${s.count}p (${s.start + 1}-${s.end + 1})</span>
                  </span>
                `).join("")}
              </div>
            </div>
            ` : ''}
            <div style="display:flex; flex-wrap:wrap; gap:6px; padding:8px 0; border-top:1px solid #e2e8f0; padding-top:12px;">
              ${r.trackers
                .map(t => {
                  const tColor = t.type === "2:1" ? "#ea580c" : "#ca8a04";
                  const tBg = t.type === "2:1" ? "#fff7ed" : "#fefce8";
                  const tBorder = t.type === "2:1" ? "#fdba74" : "#fde68a";
                  return `<div style="background:${tBg}; border:1px solid ${tBorder}; border-radius:6px; padding:6px 10px; font-size:0.75rem; display:flex; align-items:center; gap:4px;">
                  <strong style="color:${tColor}; font-size:0.8rem;">${t.isManual ? " " : ""}S${t.id}</strong>
                  <span style="color:#64748b;">|</span>
                  <span style="font-family:monospace; font-weight:700; color:#1e293b;">${t.formation}</span>
                  <span style="color:${tColor}; font-weight:700;">[${t.type}]</span>
                  <span style="color:#94a3b8; font-weight:600;">${t.panelsPerString}p</span>
                </div>`;
                })
                .join("")}
            </div>
          </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

// ============================================================
// RENDER: DETAILED MPPT CARDS
// ============================================================
function renderDetailedSystemReport(scheme) {
  const schemePlaceholder = document.getElementById("rpt_scheme_container");
  if (schemePlaceholder) schemePlaceholder.style.display = "none";

  if (scheme.length > 0) {
    updateElement("rpt_inv_model", scheme[0].modelName);
    updateElement("rpt_inv_qty", scheme[0].qty);
    const grandTotal = scheme.reduce(
      (acc, g) =>
        acc +
        g.trackers.reduce((s, t) => {
          const strings = t.stringQty || 1;
          const totalPanelsPerString = t.panelsPerString || (t.formation ? Number(t.formation.split("*")[1]) || 0 : 0);
          return s + strings * totalPanelsPerString;
        }, 0),
      0,
    );
    updateElement("rpt_inv_pv_qty", grandTotal);
  }

  let html = `<div style="display:flex; flex-direction:column; gap:25px; padding:5px;">`;
  scheme.forEach((group, idx) => {
    const totalPanels = group.trackers.reduce((s, t) => {
      const strings = t.stringQty || 1;
      const totalPanelsPerString = t.panelsPerString || (t.formation ? Number(t.formation.split("*")[1]) || 0 : 0);
      return s + strings * totalPanelsPerString;
    }, 0);
    html += `
      <div class="inverter-report-block fade-in" style="background:white; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 10px 15px -3px rgba(0,0,0,0.05); overflow:hidden;">
        <div style="background:linear-gradient(90deg,#0f172a,#1e293b); padding:18px 24px; display:flex; justify-content:space-between; align-items:center; color:white;">
          <div style="display:flex; align-items:center; gap:15px;">
            <div style="width:42px; height:42px; background:rgba(59,130,246,0.2); border:1px solid rgba(59,130,246,0.5); border-radius:10px; display:flex; align-items:center; justify-content:center;">
              <i class="fas fa-server" style="color:#60a5fa; font-size:1.2rem;"></i>
            </div>
            <div>
              <div style="font-size:0.65rem; text-transform:uppercase; opacity:0.6; letter-spacing:1.5px; font-weight:700;">Inverter Unit ${idx + 1}</div>
              <div style="font-size:1.15rem; font-weight:800;">${group.modelName}</div>
            </div>
          </div>
          <span style="background:#0ea5e9; color:white; padding:4px 14px; border-radius:20px; font-size:0.85rem; font-weight:800;">${totalPanels} Modules</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px; padding:24px; background:#f8fafc;">
          ${group.trackers
            .map(t => {
              const strings = t.stringQty || (t.formation ? Number(t.formation.split("*")[0]) || 1 : 1);
              const seriesLen = t.optimizerQty || (t.formation ? Number(t.formation.split("*")[1]) || 0 : 0);
              const totalPanelsPerString = t.panelsPerString || seriesLen;
              const total = strings * totalPanelsPerString;
              return `
              <div class="mppt-card" style="background:white; padding:20px; border-radius:14px; border:1px solid #cbd5e1; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:15px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:8px; height:8px; background:#3b82f6; border-radius:50%; box-shadow:0 0 8px #3b82f6;"></span>
                    <span style="font-weight:800; color:#1e40af; font-size:0.85rem;">${t.type ? "STRING " + t.id : "MPPT TRACKER " + t.id}</span>
                  </div>
                  ${t.type ? `<span style="font-size:0.7rem; font-weight:700; color:#ea580c; background:#fff7ed; padding:2px 8px; border-radius:4px; border:1px solid #fdba74;">${t.type}</span>` : `<div style="font-size:0.7rem; font-weight:700; color:#16a34a; background:#f0fdf4; padding:2px 8px; border-radius:4px; border:1px solid #dcfce7;"><i class="fas fa-check"></i> ACTIVE</div>`}
                </div>
                <div style="display:flex; align-items:flex-end; gap:12px; padding:12px; background:#f1f5f9; border-radius:10px; margin-bottom:15px;">
                  <div style="flex:1;">
                    <div style="font-size:0.6rem; color:#94a3b8; text-transform:uppercase; font-weight:700; margin-bottom:2px;">Configuration</div>
                    <div style="font-family:'Courier New',monospace; font-size:1.4rem; font-weight:800; color:#0f172a;">${t.formation}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:0.85rem; font-weight:800; color:#3b82f6;">${total} <small style="font-weight:600; color:#64748b;">Panels</small></div>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                  <div style="border-left:3px solid #e2e8f0; padding-left:10px;">
                    <div style="font-size:0.65rem; color:#64748b; font-weight:600;">Parallel Strings</div>
                    <div style="font-size:0.9rem; font-weight:800; color:#334155;">${strings} Str.</div>
                  </div>
                  <div style="border-left:3px solid #e2e8f0; padding-left:10px;">
                    <div style="font-size:0.65rem; color:#64748b; font-weight:600;">Series Length</div>
                    <div style="font-size:0.9rem; font-weight:800; color:#334155;">${seriesLen} ${t.type ? "Opt." : "Mod."}</div>
                  </div>
                </div>
                ${
                  t.vocAtCold
                    ? `
                <div style="margin-top:12px; display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                  <div style="background:#f0f9ff; padding:6px 8px; border-radius:6px; font-size:0.7rem;">
                    <div style="color:#0369a1; font-weight:700;">Vmp @ 25C</div>
                    <div style="font-weight:800; color:#0c4a6e;">${(t.vmpAt25 || 0).toFixed(1)}V</div>
                  </div>
                  <div style="background:#fff7ed; padding:6px 8px; border-radius:6px; font-size:0.7rem;">
                    <div style="color:#c2410c; font-weight:700;">Voc Cold</div>
                    <div style="font-weight:800; color:#7c2d12;">${(t.vocAtCold || 0).toFixed(1)}V</div>
                  </div>
                </div>`
                    : ""
                }
              </div>`;
            })
            .join("")}
        </div>
        <div style="padding:14px 24px; background:#fff; border-top:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:0.75rem; color:#475569; font-weight:600;"><i class="fas fa-certificate" style="color:#10b981;"></i> Voltage verified for temperature extremes.</span>
          <span style="font-size:0.65rem; color:#94a3b8; font-weight:700; text-transform:uppercase;">Stage 2 Design v3.1</span>
        </div>
      </div>`;
  });
  html += `</div>`;
  const detailContainer = document.getElementById("string_config_detail");
  if (detailContainer) detailContainer.innerHTML = html;
}

// ============================================================
// RENDER: SOLAREDGE METRICS
// ============================================================
function renderSolarEdgeMetrics(bestOption, inverter, invCount, s1, unitReports = []) {
  if (!bestOption) return;
  const totalDcKwp = (bestOption.totalDcPower || 0) / 1000 || s1.systemSizeKwp || 0;
  const nominalAcKw = getAcKw(inverter?.specifications || {}) * invCount;
  const annualMwh = (s1.totalAnnualEnergy || 0) / 1000;
  const hasUnitReports = Array.isArray(unitReports) && unitReports.length > 0;

  const inverterGroups = (
    hasUnitReports
      ? unitReports.map(r => ({ name: r.unit?.inverter?.name || inverter.name, qty: r.unit?.qty || 1 }))
      : [{ name: inverter.name, qty: invCount }]
  ).reduce((acc, item) => {
    const existing = acc.find(x => x.name === item.name);
    if (existing) existing.qty += item.qty;
    else acc.push({ ...item });
    return acc;
  }, []);

  updateElement("se_dc_power", totalDcKwp.toFixed(2) + " kWp");
  updateElement("se_ac_power", nominalAcKw.toFixed(1) + " kW");
  updateElement("se_annual_prod", annualMwh.toFixed(2) + " MWh");

  const co2 = annualMwh * 0.703;
  const trees = Math.round(co2 * 16.5);
  updateElement("se_co2_saved", co2.toFixed(1));
  updateElement("se_trees_planted", trees.toString());

  const panelCount = s1.panelCount || 0;
  const totalOpts = (bestOption.bom || []).reduce((s, b) => s + b.qty, 0);
  const totalInvCount = inverterGroups.reduce((s, g) => s + (g.qty || 0), 0);
  updateElement("se_panel_count_val", panelCount.toString());
  updateElement("se_inv_count_val", totalInvCount.toString());
  updateElement("se_opt_count_val", totalOpts.toString());

  const bomBody = document.getElementById("se_bom_body");
  if (bomBody) {
    const optimizerRows = (bestOption.bom || [])
      .map(
        item => `
      <tr>
        <td style="padding:12px; font-weight:600; color:#1e40af;">Optimizer</td>
        <td>${item.name}</td>
        <td style="text-align:center; font-weight:700;">${item.qty}</td>
      </tr>`,
      )
      .join("");

    const inverterRows = inverterGroups
      .map(
        (inv, idx) => `
      <tr style="${idx === 0 ? "background:#f8fafc; border-top:2px solid #e2e8f0;" : "background:#f8fafc;"}">
        <td style="padding:12px; font-weight:600; color:#1e40af;">Inverter</td>
        <td>${inv.name}</td>
        <td style="text-align:center; font-weight:700;">${inv.qty}</td>
      </tr>`,
      )
      .join("");

    bomBody.innerHTML = optimizerRows + inverterRows;
  }

  const getPanelsPerTracker = t => {
    const pps = t.panelsPerString || (t.formation ? Number(t.formation.split("*")[1]) || 0 : 0);
    const qty = t.stringQty || (t.formation ? Number(t.formation.split("*")[0]) || 1 : 1);
    return pps * qty;
  };
  const getOptimizersPerTracker = t => {
    const oq = t.optimizerQty || 0;
    const qty = t.stringQty || 1;
    return oq * qty;
  };

  const elecRows = document.getElementById("se_elec_design_rows");
  if (elecRows) {
    const rows = hasUnitReports
      ? unitReports
      : [
          {
            unit: { qty: invCount, inverter },
            trackers: bestOption.trackers || [],
            panelCount,
          },
        ];

    const buildUnitDiagram = (r, idx) => {
      const unitName = r.unit?.inverter?.name || inverter.name;
      const unitQty = r.unit?.qty || 1;
      const trackers = r.trackers || [];
      if (trackers.length === 0) {
        return `<div style="padding:12px; color:#94a3b8; font-size:0.8rem;">No string allocation available for Unit ${idx + 1}.</div>`;
      }
      const unitPanels = trackers.reduce((s, t) => s + getPanelsPerTracker(t), 0);
      const unitOpts = trackers.reduce((s, t) => s + getOptimizersPerTracker(t), 0);
      const unitStrings = trackers.length;
      const maxOptCount = Math.max(...trackers.map(t => Math.max(1, getOptimizersPerTracker(t))));
      const cellW = 62;
      const rowH = 88;
      const padX = 28;
      const padY = 24;
      const boardW = maxOptCount * cellW + padX * 2;
      const boardH = trackers.length * rowH + padY * 2;

      const rowsSvg = trackers
        .map((t, tIndex) => {
          const optCount = Math.max(1, getOptimizersPerTracker(t));
          const panelCountLocal = Math.max(1, getPanelsPerTracker(t));
          const ratio = t.type || "1:1";
          const panelPerOpt = ratio === "2:1" ? 2 : 1;
          const y = padY + tIndex * rowH + 40;
          const nodes = [];
          for (let i = 0; i < optCount; i++) {
            const dirIndex = tIndex % 2 === 0 ? i : optCount - 1 - i;
            const x = padX + dirIndex * cellW + 30;
            nodes.push({ n: i + 1, x, y });
          }

          const nodePanelBack = nodes
            .map(
              n =>
                `<rect x="${n.x - 28}" y="${n.y - 20}" width="56" height="40" rx="3" fill="#5b6476" stroke="#dbe0ea" stroke-width="1"/>`,
            )
            .join("");
          const panelIcons = nodes
            .map(n => {
              if (panelPerOpt === 2) {
                return `
              <rect x="${n.x - 13}" y="${n.y - 30}" width="10" height="12" rx="2" fill="#cbd5e1" stroke="#111827" stroke-width="0.8"/>
              <rect x="${n.x + 3}" y="${n.y - 30}" width="10" height="12" rx="2" fill="#cbd5e1" stroke="#111827" stroke-width="0.8"/>
            `;
              }
              return `<rect x="${n.x - 5}" y="${n.y - 30}" width="10" height="12" rx="2" fill="#cbd5e1" stroke="#111827" stroke-width="0.8"/>`;
            })
            .join("");
          const chainD = nodes
            .map((n, idx) =>
              idx === 0 ? `M ${n.x} ${n.y}` : `Q ${(nodes[idx - 1].x + n.x) / 2} ${y - 14} ${n.x} ${n.y}`,
            )
            .join(" ");
          const nodeCircles = nodes
            .map(
              n => `
          <circle cx="${n.x}" cy="${n.y}" r="17" fill="#d1d5db" stroke="#9ca3af" stroke-width="1.5"/>
          <text x="${n.x}" y="${n.y + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="#111827">${n.n}</text>
        `,
            )
            .join("");
          const rowLabel = `<text x="8" y="${y + 5}" fill="#e2e8f0" font-size="12" font-weight="700">S${t.id} ${ratio}</text>`;
          const rowStats = `<text x="${boardW - 8}" y="${y + 5}" text-anchor="end" fill="#cbd5e1" font-size="11">${panelCountLocal}p / ${optCount}o</text>`;

          return `
          ${nodePanelBack}
          <path d="${chainD}" stroke="#d1d5db" stroke-width="4" fill="none" stroke-linecap="round"/>
          ${nodeCircles}
          ${panelIcons}
          ${rowLabel}
          ${rowStats}
        `;
        })
        .join("");

      return `
        <div style="margin-bottom:18px; ${idx > 0 ? "padding-top:14px; border-top:1px dashed #cbd5e1;" : ""}">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
            <div style="font-weight:800; color:#0f172a; font-size:0.9rem;">Unit ${idx + 1}: ${unitQty}x ${unitName}</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <span style="font-size:0.7rem; color:#1d4ed8; background:#dbeafe; padding:3px 8px; border-radius:999px;">${unitStrings} strings</span>
              <span style="font-size:0.7rem; color:#9a3412; background:#ffedd5; padding:3px 8px; border-radius:999px;">${unitOpts} optimizers</span>
              <span style="font-size:0.7rem; color:#065f46; background:#d1fae5; padding:3px 8px; border-radius:999px;">${unitPanels} panels</span>
            </div>
          </div>
          <div style="background:#111827; border:1px solid #334155; border-radius:12px; padding:12px;">
            <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:8px; font-weight:700;">Electrical Design: Optimizer-Panel Configuration</div>
            <svg viewBox="0 0 ${boardW} ${boardH}" width="100%" height="${Math.max(220, boardH)}" style="display:block; background:
              radial-gradient(circle at 1px 1px, rgba(148,163,184,.25) 1px, transparent 1px),
              linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px),
              linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), #1f2937;
              background-size:12px 12px, 40px 40px, 40px 40px;">
              ${rowsSvg}
            </svg>
          </div>
        </div>`;
    };

    elecRows.innerHTML = rows.map(buildUnitDiagram).join("");
  }

  const netMwh = annualMwh * 0.895;
  updateElement("se_loss_ghi", annualMwh.toFixed(2) + " MWh");
  updateElement("se_loss_final", netMwh.toFixed(2) + " MWh");
  updateElement("se_sys_type", "Fixed Voltage Optimizer System");
}
// ============================================================
// RENDER: MINI CHART
// ============================================================
function renderMiniChart(monthlyData) {
  const container = document.getElementById("rpt_bar_chart");
  if (!container || !monthlyData?.length) return;
  container.innerHTML = "";
  const keys = ["energyYield", "energy", "yield", "value"];
  const eKey = keys.find(k => monthlyData[0]?.[k] !== undefined);
  if (!eKey) return;
  const maxVal = Math.max(...monthlyData.map(m => m[eKey] || 0));
  if (!maxVal) return;
  const frag = document.createDocumentFragment();
  monthlyData.forEach((m, idx) => {
    const energy = m[eKey] || 0;
    const bar = document.createElement("div");
    bar.className = "chart-bar fade-in";
    bar.style.height = `${(energy / maxVal) * 100}%`;
    bar.style.minHeight = "2px";
    bar.title = `${m.month || `Month ${idx + 1}`}: ${Math.round(energy)} kWh`;
    const badge = document.createElement("div");
    badge.style.cssText =
      "position:absolute; top:-20px; left:50%; transform:translateX(-50%); font-size:0.6rem; color:#0ea5e9; font-weight:700; opacity:0; transition:opacity 0.2s; pointer-events:none;";
    badge.innerText = Math.round(energy);
    const lbl = document.createElement("div");
    lbl.className = "chart-label";
    lbl.innerText = m.month ? m.month.substring(0, 3) : idx + 1;
    bar.appendChild(badge);
    bar.appendChild(lbl);
    bar.onmouseenter = () => (badge.style.opacity = "1");
    bar.onmouseleave = () => (badge.style.opacity = "0");
    frag.appendChild(bar);
  });
  container.appendChild(frag);
}

function getTrackersForManualSeed() {
  return window.stage2Result?.trackers || window.projectData?.strings?.trackers || [];
}

function initManualLayoutFromTrackers(trackers) {
  manualLayoutSeq = 1;
  manualLayoutState = { systemType: currentSystemType, strings: [] };
  const invertersToUse = resolveManualInverters();

  (trackers || []).forEach(t => {
    const strings = t.stringQty || (t.formation ? Number(t.formation.split("*")[0]) || 1 : 1);
    const panelsPerString = t.panelsPerString || (t.formation ? Number(t.formation.split("*")[1]) || 0 : 0);
    const optQty = t.optimizerQty || (t.formation ? Number(t.formation.split("*")[1]) || 0 : 0);
    const ratio = t.type ? parseInt(t.type.split(":")[0]) : 2;
    const baseInvId = t.assignedInverterId || invertersToUse[0]?.id || "default";
    const baseInvName = t.assignedInverterName || invertersToUse[0]?.inverter?.name || "";

    for (let s = 0; s < strings; s++) {
      manualLayoutState.strings.push({
        uid: manualLayoutSeq++,
        assignedInverterId: baseInvId,
        assignedInverterName: baseInvName,
        panelsPerString,
        stringQty: 1,
        optimizerQty: optQty,
        ratio: ratio || 2,
      });
    }
  });

  window.manualLayoutState = manualLayoutState;
}

// ============================================================
// ==================================================================
//  INTERACTIVE CANVAS CONTROLLER v4.0 — Mixed Optimizer Strings
//  Features: Combined BOM (2:1+1:1), real-time health highlighting,
//  per-string ratios, status-colored pills, deletable strings
// ==================================================================

// ──────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────
let interactiveCanvasState = {
  activeRatio:       2,        // ratio for the NEXT string being drawn
  currentString:     [],       // [{ panelId }]  — in-progress
  completedStrings:  [],       // [{ panels, panelCount, optimizerQty, ratio, status }]
  totalPanels:       0,
  panelToInverter:   [],       // panel index -> { id, name, idx, color, start, end }
  inverterSlices:    [],       // [{ id, name, idx, color, start, end, count }]
  cols:              0,
  CELL:              0,
};

const _PAL = [
  '#2563eb','#dc2626','#16a34a','#9333ea','#ea580c',
  '#0891b2','#be185d','#b45309','#4f46e5','#0d9488',
  '#d97706','#7c3aed','#c2410c','#0369a1','#15803d',
];

function _normalizeCanvasInverterSlices(totalPanels) {
  const invertersToUse = resolveManualInverters();
  if (!invertersToUse || invertersToUse.length === 0) return [];

  const units = invertersToUse.map((u, idx) => ({
    id: u.id,
    name: u?.inverter?.name || `Inverter ${idx + 1}`,
    idx: idx + 1,
    color: _PAL[idx % _PAL.length],
    count: Math.max(0, parseInt(u?.assignedPanels || 0)),
  }));

  if (units.length === 1 && units[0].count === 0) units[0].count = totalPanels;

  let sum = units.reduce((s, u) => s + u.count, 0);
  if (sum < totalPanels && units.length > 0) units[units.length - 1].count += totalPanels - sum;
  if (sum > totalPanels) {
    let overflow = sum - totalPanels;
    for (let i = units.length - 1; i >= 0 && overflow > 0; i--) {
      const cut = Math.min(overflow, units[i].count);
      units[i].count -= cut;
      overflow -= cut;
    }
  }

  const slices = [];
  let cursor = 0;
  units.forEach(u => {
    if (u.count <= 0) return;
    const start = cursor;
    const end = Math.min(totalPanels - 1, cursor + u.count - 1);
    const count = end >= start ? end - start + 1 : 0;
    if (count > 0) {
      slices.push({ id: u.id, name: u.name, idx: u.idx, color: u.color, start, end, count });
      cursor = end + 1;
    }
  });

  if (slices.length === 0 && totalPanels > 0) {
    slices.push({ id: "default", name: "Inverter 1", idx: 1, color: _PAL[0], start: 0, end: totalPanels - 1, count: totalPanels });
  }

  if (cursor < totalPanels && slices.length > 0) {
    const last = slices[slices.length - 1];
    last.end = totalPanels - 1;
    last.count = last.end - last.start + 1;
  }

  return slices;
}

function _buildPanelToInverterMap(totalPanels) {
  const slices = _normalizeCanvasInverterSlices(totalPanels);
  const map = new Array(totalPanels).fill(null);
  slices.forEach(slice => {
    for (let i = slice.start; i <= slice.end && i < totalPanels; i++) {
      map[i] = slice;
    }
  });
  return { slices, map };
}

function _ownerForPanel(panelId) {
  return interactiveCanvasState.panelToInverter?.[panelId] || null;
}

function _sameOwnerAsCurrent(panelId) {
  const owner = _ownerForPanel(panelId);
  if (!owner) return true;
  if (!interactiveCanvasState.currentString.length) return true;
  const firstOwner = _ownerForPanel(interactiveCanvasState.currentString[0].panelId);
  return !firstOwner || firstOwner.id === owner.id;
}

function _renderInverterSliceLegend() {
  const host = document.getElementById("ec4-inv-slices");
  if (!host) return;
  const slices = interactiveCanvasState.inverterSlices || [];
  if (!slices.length) {
    host.innerHTML = "";
    host.style.display = "none";
    return;
  }
  host.style.display = "flex";
  host.innerHTML = slices
    .map(s => `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid ${s.color};background:${s.color}22;color:#0f172a;font-size:.66rem;font-weight:700;">
      <span style="width:8px;height:8px;border-radius:50%;background:${s.color};"></span>
      INV ${s.idx}: ${s.count} panels (${s.start + 1}-${s.end + 1})
    </span>`)
    .join("");
}

// ──────────────────────────────────────────────────────────────────
// LIMITS HELPER  (reads live inverter + optimizer selectors)
// ──────────────────────────────────────────────────────────────────
function _resolveManualInverterById(invId) {
  const inverters = resolveManualInverters() || [];
  return inverters.find(u => u?.id?.toString() === (invId ?? "").toString()) || null;
}

function _getLimits(ratio, ownerInverterId = null) {
  let invObj = {};
  let invSpecs = {};
  const owner = ownerInverterId ? _resolveManualInverterById(ownerInverterId) : null;
  if (owner?.inverter) {
    invObj = owner.inverter;
    invSpecs = owner.inverter.specifications || {};
  } else {
    const invSel  = document.getElementById('inverter_selector');
    try {
      if (invSel?.value) {
        invObj   = JSON.parse(invSel.value);
        invSpecs = invObj.specifications || {};
      }
    } catch (_) {}
  }

  const s1        = getStage1Snapshot();
  const panelWatt = s1.panelWattage || 580;

  const is1Phase = (invObj.subcategory === '1-Phase')
                || (invSpecs.subcategory === '1-Phase');

  let invClass = invSpecs.string_class || null;
  if (!invClass) {
    if (is1Phase) {
      invClass = '1-Phase';
    } else {
      const acKw = invSpecs.ac_power_kw || getAcKw(invSpecs) || 0;
      if      (acKw > 0  && acKw <= 10) invClass = 'SE3K-10K';
      else if (acKw > 10 && acKw <= 20) invClass = 'SE12.5K-20K';
      else if (acKw > 20 && acKw <= 33) invClass = 'SE25K+';
      else                              invClass = 'SE12.5K-20K';
    }
  }

  const busVolt = is1Phase ? 350 : 750;

  const imaxStr = invSpecs.imax_string || 15;

  const maxPow = imaxStr * busVolt;

  const optimizer = resolveOptimizerForRatio(ratio);
  const optSpec   = optimizer?.specifications || {};
  const strLimits = optSpec.string_limits || {};

  const resolved =
       strLimits[invClass]
    || strLimits[is1Phase ? '1-Phase' : '3-Phase']
    || (ratio === 2 ? { min: 14, max: 30 } : { min: 8, max: 25 });

  const defaultMin = ratio === 2 ? 14 : 1;
  const defaultMax = ratio === 2 ? 30 : 16;

  const catalogMin = (typeof resolved?.min === 'number') ? resolved.min : defaultMin;
  const catalogMax = (typeof resolved?.max === 'number') ? resolved.max : defaultMax;

  const wattsPerOpt  = panelWatt * ratio;
  const powerMaxOpts = (wattsPerOpt > 0)
    ? Math.floor(maxPow / wattsPerOpt)
    : catalogMax;

  const effectiveMax = Math.min(catalogMax, powerMaxOpts);

  // Stage 2 business rule override:
  // For 2:1 mode, treat 14-20 optimizers (28-40 panels) as the valid window
  // for finish-status checks, independent of dynamic power clipping.
  if (ratio === 2) {
    return {
      min: 14,
      max: 20,
      catalogMax: 20,
      maxPow,
      busVolt,
      is1Phase,
      invClass,
    };
  }

  // Stage 2 business rule override:
  // For 1:1 mode, treat 1-16 panels (optimizers) as the valid window.
  if (ratio === 1) {
    return {
      min: 1,
      max: 16,
      catalogMax: 16,
      maxPow,
      busVolt,
      is1Phase,
      invClass,
    };
  }

  return {
    min:        catalogMin,
    max:        effectiveMax,
    catalogMax,
    maxPow,
    busVolt,
    is1Phase,
    invClass,
  };
}
// ──────────────────────────────────────────────────────────────────
// HEALTH CHECK  for a given (panelCount, ratio)
//   status: 'too-short' | 'too-long' | 'over-power' | 'odd-pair' | 'ok'
// ──────────────────────────────────────────────────────────────────
function _checkHealth(panelCount, ratio, ownerInverterId = null) {
  const s1   = getStage1Snapshot();
  const watt = s1.panelWattage || 580;
  const lim  = _getLimits(ratio, ownerInverterId);

  if (!lim || typeof lim.min !== 'number') {
    return {
      status: 'idle', canFinish: false, optFloor: 0,
      msg:    'Select an inverter and optimizer first',
      lim:    { min: 0, max: 0 }, power: 0,
    };
  }

  // For 2:1, ceil keeps optimizer quantity aligned for odd panel counts.
  // For 1:1, each optimizer handles 1 panel.
  const optFloor = (ratio === 2) ? Math.ceil(panelCount / 2) : panelCount;
  const power    = panelCount * watt;

  // Stage 2 business rule override for 2:1 status:
  // Show valid/green finish state for any panel count from 27 to 40.
  if (ratio === 2) {
    const minPanels2to1 = 27;
    const maxPanels2to1 = 40;
    if (panelCount < minPanels2to1) {
      return {
        status: 'too-short', canFinish: false, optFloor,
        msg:    `Too short: ${panelCount} panels < min ${minPanels2to1} — add ${minPanels2to1 - panelCount} more panel${(minPanels2to1 - panelCount) > 1 ? 's' : ''}`,
        lim, power,
      };
    }
    if (panelCount > maxPanels2to1) {
      return {
        status: 'too-long', canFinish: false, optFloor,
        msg:    `Too long: ${panelCount} panels > max ${maxPanels2to1} — remove ${panelCount - maxPanels2to1} panel${(panelCount - maxPanels2to1) > 1 ? 's' : ''}`,
        lim, power,
      };
    }
    return {
      status: 'ok', canFinish: true, optFloor,
      msg:    `Valid — ${panelCount} panels (${optFloor} optimizers) [2:1 policy range ${minPanels2to1}-${maxPanels2to1}]`,
      lim, power,
    };
  }

  // Validate against optimizer count limits (not panel count)
  if (optFloor < lim.min) {
    const panelsNeeded = (lim.min - optFloor) * ratio;
    return {
      status: 'too-short', canFinish: false, optFloor,
      msg:    `Too short: ${optFloor} optimizers < min ${lim.min} — add ${panelsNeeded} more panel${panelsNeeded > 1 ? 's' : ''}`,
      lim, power,
    };
  }

  if (optFloor > lim.max) {
    const isPowerLimited = lim.max < lim.catalogMax;
    const reason         = isPowerLimited
      ? `power limit ${(lim.maxPow / 1000).toFixed(2)} kW`
      : `catalog limit ${lim.catalogMax} optimizers`;
    const panelsOver = (optFloor - lim.max) * ratio;
    return {
      status: 'too-long', canFinish: false, optFloor,
      msg:    `Too long: ${optFloor} optimizers > max ${lim.max} (${reason}) — remove ${panelsOver} panel${panelsOver > 1 ? 's' : ''}`,
      lim, power,
    };
  }

  // All checks passed — any value within range is valid
  return {
    status: 'ok', canFinish: true, optFloor,
    msg:    `Valid — ${optFloor} optimizer${optFloor !== 1 ? 's' : ''} · ${panelCount} panels · ${(power / 1000).toFixed(2)} kW`,
    lim, power,
  };
}
// Status → colours
const _SC = {
  'ok':        { fill: '#f0fdf4', stroke: '#16a34a', bar: '#14532d', barTxt: '#bbf7d0', icon: '✓' },
  'too-short': { fill: '#fefce8', stroke: '#ca8a04', bar: '#713f12', barTxt: '#fde68a', icon: '▲' },
  'too-long':  { fill: '#fef2f2', stroke: '#dc2626', bar: '#7f1d1d', barTxt: '#fecaca', icon: '✕' },
  'over-power':{ fill: '#fef2f2', stroke: '#dc2626', bar: '#7f1d1d', barTxt: '#fecaca', icon: '⚡' },
  'odd-pair':  { fill: '#fff7ed', stroke: '#ea580c', bar: '#78350f', barTxt: '#fde68a', icon: '⋯' },
  'idle':      { fill: '#f1f5f9', stroke: '#cbd5e1', bar: '#1e293b', barTxt: '#94a3b8', icon: 'i' },
};

// ══════════════════════════════════════════════════════════════════
// CSS
// ══════════════════════════════════════════════════════════════════
function injectCanvasCss() {
  if (document.getElementById('ec4-styles')) return;
  const el = document.createElement('style');
  el.id    = 'ec4-styles';
  el.innerHTML = `
  #ec4-wrap{border-radius:12px;overflow:hidden;border:1px solid #1e293b;box-shadow:0 16px 48px rgba(0,0,0,.22);font-family:system-ui,sans-serif;}
  #ec4-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 14px;background:#0f172a;}
  .ec4-title{color:#e2e8f0;font-weight:800;font-size:.78rem;letter-spacing:.5px;display:flex;align-items:center;gap:6px;}
  .ec4-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;}
  .ec4-tag-pill{background:#1e293b;color:#64748b;padding:2px 8px;border-radius:4px;font-size:.63rem;font-weight:700;}
  .ec4-ratio-wrap{display:flex;gap:3px;padding:3px;background:rgba(255,255,255,.07);border-radius:7px;margin:0 6px;}
  .ec4-rb{padding:5px 15px;border-radius:5px;font-weight:800;font-size:.74rem;cursor:pointer;border:2px solid transparent;transition:all .15s;line-height:1.2;}
  .ec4-rb-1on{background:#fefce8;color:#713f12;border-color:#ca8a04;}
  .ec4-rb-2on{background:#fff7ed;color:#7c2d12;border-color:#ea580c;}
  .ec4-rb-off{background:rgba(255,255,255,.07);color:#94a3b8;}
  .ec4-rb small{display:block;font-size:.58rem;font-weight:500;opacity:.75;}
  .ec4-sp{flex:1;}
  .ec4-btn{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:6px;font-weight:700;font-size:.7rem;cursor:pointer;border:none;transition:filter .12s,transform .1s;white-space:nowrap;}
  .ec4-btn:hover{filter:brightness(1.12);transform:translateY(-1px);}
  .ec4-btn:active{transform:translateY(0);}
  .ec4-btn-undo{background:#d97706;color:#fff;}
  .ec4-btn-fin{background:#2563eb;color:#fff;}
  .ec4-btn-fin[disabled]{background:#475569;opacity:.55;pointer-events:none;}
  .ec4-btn-apply{background:#16a34a;color:#fff;}
  .ec4-btn-clear{background:#dc2626;color:#fff;}
  #ec4-healthbar{padding:9px 14px;font-size:.72rem;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap;transition:background .2s,color .2s;border-bottom:1px solid rgba(255,255,255,.06);}
  .ec4-hb-right{margin-left:auto;font-size:.68rem;opacity:.85;}
  #ec4-legend{display:flex;gap:10px;padding:6px 14px;background:#fff;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;}
  .ec4-leg{display:flex;align-items:center;gap:4px;font-size:.65rem;color:#64748b;}
  .ec4-sw{width:12px;height:12px;border-radius:2px;border:1.5px solid;}
  /* limits display */
  #ec4-limits{padding:5px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:.67rem;}
  .ec4-lim-badge{padding:3px 10px;border-radius:4px;font-weight:700;border:1px solid;}
  #ec4-grid-wrap{background:#0f172a;overflow:auto;min-height:400px;display:flex;align-items:flex-start;justify-content:center;padding:20px;}
  #ec4-metrics{display:flex;gap:6px;padding:10px 14px;background:#fff;border-top:1px solid #e2e8f0;flex-wrap:wrap;}
  .ec4-met{flex:1;min-width:76px;padding:7px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;}
  .ec4-met-l{font-size:.57rem;color:#94a3b8;text-transform:uppercase;font-weight:700;letter-spacing:.3px;}
  .ec4-met-v{font-size:.87rem;font-weight:800;margin-top:2px;}
  #ec4-summary{padding:8px 14px;background:#f8fafc;border-top:1px solid #e2e8f0;min-height:36px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:.69rem;}
  .ec4-spill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:4px;font-size:.66rem;font-weight:700;border:1.5px solid;cursor:pointer;}
  .ec4-spill:hover{filter:brightness(.93);}
  .ec4-rem{margin-left:auto;font-weight:700;}
  #ec4-remaining-hint{padding:6px 14px;font-size:.7rem;font-weight:700;background:#f0f9ff;border-top:1px solid #bae6fd;display:none;align-items:center;gap:8px;flex-wrap:wrap;}
  #ec4-remaining-hint button{padding:3px 10px;border-radius:4px;border:1px solid #0ea5e9;background:#e0f2fe;color:#0c4a6e;font-size:.68rem;font-weight:700;cursor:pointer;}
  #ec4-bom{padding:10px 14px;background:#fff;border-top:1px solid #e2e8f0;}
  .ec4-bom-title{font-size:.65rem;text-transform:uppercase;font-weight:800;color:#1e40af;letter-spacing:.5px;margin-bottom:8px;}
  .ec4-bom-grid{display:flex;gap:8px;flex-wrap:wrap;}
  .ec4-bom-card{padding:8px 14px;border-radius:8px;border:1.5px solid #3b82f6;background:#eff6ff;display:flex;align-items:center;gap:8px;}
  .ec4-bom-qty{font-size:1.1rem;font-weight:800;color:#1e40af;}
  .ec4-bom-name{font-size:.72rem;color:#1e40af;font-weight:600;}
  /* Advanced Optimizer Styles */
  .ec4-panel-rect{transition:all 0.2s cubic-bezier(0.4, 0, 0.2, 1);cursor:pointer;}
  /* 2:1 Bridge Look */
  .opt-bridge-2to1{filter:drop-shadow(0 0 4px rgba(59, 130, 246, 0.5));}
  /* Status-based Glows */
  .status-ok-glow{filter:drop-shadow(0 0 8px rgba(22, 163, 74, 0.4));}
  .status-error-glow{filter:drop-shadow(0 0 8px rgba(220, 38, 38, 0.4));}
  /* High-tech Panel divider */
  .panel-grid-line{stroke-opacity:0.1;stroke:#fff;pointer-events:none;}
  `;
  document.head.appendChild(el);
}

// ══════════════════════════════════════════════════════════════════
// MAIN ENTRY
// ══════════════════════════════════════════════════════════════════
function generateInteractiveGrid(_r, _c) {
  const container = document.getElementById('diagram_container');
  if (!container) return;
  injectCanvasCss();

  const s1    = getStage1Snapshot();
  const total = parseInt(s1.panelCount) || 20;
  const ownership = _buildPanelToInverterMap(total);

  // Full state reset
  interactiveCanvasState.totalPanels      = total;
  interactiveCanvasState.currentString    = [];
  interactiveCanvasState.completedStrings = [];
  interactiveCanvasState.panelToInverter  = ownership.map;
  interactiveCanvasState.inverterSlices   = ownership.slices;
  interactiveCanvasState.cols             = 0;  // force recalc
  interactiveCanvasState.activeRatio      = interactiveCanvasState.activeRatio || 2;

  container.innerHTML = `
  <div id="ec4-wrap">
    <!-- Toolbar -->
    <div id="ec4-toolbar">
      <div class="ec4-title">
        <span class="ec4-dot"></span> STRING BUILDER
        <span class="ec4-tag-pill">${total} PANELS</span>
      </div>
      <div class="ec4-ratio-wrap">
        <button class="ec4-rb" id="ec4_r1" onclick="setCanvasRatio(1)">
          1:1 <small>1 panel/opt</small>
        </button>
        <button class="ec4-rb" id="ec4_r2" onclick="setCanvasRatio(2)">
          2:1 <small>2 panels/opt</small>
        </button>
      </div>
      <div class="ec4-sp"></div>
      <button class="ec4-btn ec4-btn-undo"  onclick="undoLastPanel()">↩ Undo</button>
      <button class="ec4-btn ec4-btn-fin" id="ec4_fin" onclick="finishCurrentString()" disabled>＋ Finish String</button>
      <button class="ec4-btn ec4-btn-apply" onclick="applyDrawnStrings()">⚡ Apply Design</button>
      <button class="ec4-btn ec4-btn-clear" onclick="clearAllStrings()">✕ Clear</button>
    </div>

    <!-- Health bar -->
    <div id="ec4-healthbar" style="background:#1e293b;color:#94a3b8;">
      <span id="ec4-hb-msg">Click panels to start building a string</span>
      <span class="ec4-hb-right" id="ec4-hb-right"></span>
    </div>

    <!-- Limits display -->
    <div id="ec4-limits">
      <span style="color:#475569;font-weight:700;">Active Ratio Limits:</span>
      <span class="ec4-lim-badge" id="ec4-lim-badge" style="background:#fefce8;color:#713f12;border-color:#ca8a04;">Loading…</span>
      <span style="color:#94a3b8;">|</span>
      <span style="color:#475569;">Max string power: <strong id="ec4-lim-pow">–</strong></span>
    </div>

    <!-- Legend -->
    <div id="ec4-legend">
      <div class="ec4-leg"><div class="ec4-sw" style="background:#f1f5f9;border-color:#cbd5e1;"></div>Free</div>
      <div class="ec4-leg"><div class="ec4-sw" style="background:#dbeafe;border-color:#3b82f6;"></div>In progress</div>
      <div class="ec4-leg"><div class="ec4-sw" style="background:#fefce8;border-color:#ca8a04;"></div>Too short</div>
      <div class="ec4-leg"><div class="ec4-sw" style="background:#f0fdf4;border-color:#16a34a;"></div>Valid</div>
      <div class="ec4-leg"><div class="ec4-sw" style="background:#fef2f2;border-color:#dc2626;"></div>Too long / error</div>
      <div class="ec4-leg"><div class="ec4-sw" style="background:#fff7ed;border-color:#ea580c;"></div>Odd pair</div>
    </div>
    <div id="ec4-inv-slices" style="display:none;gap:8px;padding:6px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;"></div>

    <!-- SVG grid -->
    <div id="ec4-grid-wrap"></div>

    <!-- Metrics -->
    <div id="ec4-metrics">
      <div class="ec4-met"><div class="ec4-met-l">Total</div><div class="ec4-met-v" id="ec4m-tot" style="color:#1e293b;">${total}</div></div>
      <div class="ec4-met"><div class="ec4-met-l">Assigned</div><div class="ec4-met-v" id="ec4m-done" style="color:#3b82f6;">0</div></div>
      <div class="ec4-met"><div class="ec4-met-l">Remaining</div><div class="ec4-met-v" id="ec4m-rem" style="color:#64748b;">${total}</div></div>
      <div class="ec4-met"><div class="ec4-met-l">In String</div><div class="ec4-met-v" id="ec4m-prog" style="color:#f59e0b;">0</div></div>
      <div class="ec4-met" style="flex:2;min-width:120px;"><div class="ec4-met-l">Current String</div><div class="ec4-met-v" id="ec4m-cur" style="color:#94a3b8;">–</div></div>
      <div class="ec4-met"><div class="ec4-met-l">Strings</div><div class="ec4-met-v" id="ec4m-strs" style="color:#8b5cf6;">0</div></div>
    </div>

    <!-- String pills -->
    <div id="ec4-summary"><span style="color:#94a3b8;">No strings yet — pick a ratio and click panels.</span></div>

    <!-- Remaining cleanup helper -->
    <div id="ec4-remaining-hint">
      <span id="ec4-rem-hint-msg"></span>
      <button onclick="_ec4AutoCleanup1to1()">Auto-assign as 1:1 string</button>
      <button onclick="_ec4AutoCleanup1to1(true)">Split into minimum 1:1 strings</button>
    </div>

    <!-- Live BOM -->
    <div id="ec4-bom" style="display:none;">
      <div class="ec4-bom-title">📦 Combined Bill of Materials (live)</div>
      <div class="ec4-bom-grid" id="ec4-bom-grid"></div>
    </div>
  </div>`;

  _ec4BuildGrid();
  _ec4UpdateRatio();
  _renderInverterSliceLegend();
  _ec4Refresh();

  // Attach drag listeners to the persistent wrapper, not the replaceable SVG
  const gridWrap = document.getElementById('ec4-grid-wrap');
  if (gridWrap && !gridWrap._dragBound) {
    gridWrap._dragBound = true;  // prevent duplicate bindings on re-init
    let _isDragging = false;

    function _svgCoord(e) {
      const svgEl = gridWrap.querySelector('svg');
      if (!svgEl) return null;
      const rect = svgEl.getBoundingClientRect();
      const touch = e.touches ? e.touches[0] : e;
      const scaleX = svgEl.viewBox.baseVal.width / rect.width;
      const scaleY = svgEl.viewBox.baseVal.height / rect.height;
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }

    function _panelFromSvgPoint(px, py) {
      const CELL_W = interactiveCanvasState.CELL;
      const CELL_H = interactiveCanvasState.CELL_H || CELL_W;
      const cols   = interactiveCanvasState.cols;
      const GAP_X  = 4, GAP_Y = 5;
      const c = Math.floor((px - GAP_X / 2) / CELL_W);
      const r = Math.floor((py - GAP_Y / 2) / CELL_H);
      if (c < 0 || c >= cols || r < 0) return -1;
      const id = r * cols + c;
      return id < interactiveCanvasState.totalPanels ? id : -1;
    }

    function _tryAddDrag(px, py) {
      const id = _panelFromSvgPoint(px, py);
      if (id < 0) return;
      if (interactiveCanvasState.completedStrings.some(s => s.panels.includes(id))) return;
      if (interactiveCanvasState.currentString.some(p => p.panelId === id)) return;
      if (!_sameOwnerAsCurrent(id)) return;
      interactiveCanvasState.currentString.push({ panelId: id });
      _ec4BuildGrid();
      _ec4UpdateHealthBar();
      _ec4Refresh();
    }

    gridWrap.addEventListener('mousedown', e => {
      _isDragging = true;
      const coord = _svgCoord(e);
      if (coord) _tryAddDrag(coord.x, coord.y);
      e.preventDefault();
    });
    gridWrap.addEventListener('mousemove', e => {
      if (!_isDragging) return;
      const coord = _svgCoord(e);
      if (coord) _tryAddDrag(coord.x, coord.y);
    });
    gridWrap.addEventListener('mouseup',    () => { _isDragging = false; });
    gridWrap.addEventListener('mouseleave', () => { _isDragging = false; });

    gridWrap.addEventListener('touchstart', e => {
      _isDragging = true;
      const coord = _svgCoord(e);
      if (coord) _tryAddDrag(coord.x, coord.y);
      e.preventDefault();
    }, { passive: false });
    gridWrap.addEventListener('touchmove', e => {
      if (!_isDragging) return;
      const coord = _svgCoord(e);
      if (coord) _tryAddDrag(coord.x, coord.y);
      e.preventDefault();
    }, { passive: false });
    gridWrap.addEventListener('touchend', () => { _isDragging = false; });
  }
}

// ══════════════════════════════════════════════════════════════════
// BUILD / REBUILD SVG
// ══════════════════════════════════════════════════════════════════
function _ec4BuildGridLegacy() {
  const wrap = document.getElementById('ec4-grid-wrap');
  if (!wrap) return;

  const total  = interactiveCanvasState.totalPanels;
  const wrapW  = Math.max(wrap.clientWidth || 0, 400);
  const TARGET = 52;
  let   cols   = Math.max(6, Math.min(20, total, Math.round(wrapW / TARGET)));
  const CELL   = Math.floor(wrapW / cols);
  const PAD    = 4;
  const rows   = Math.ceil(total / cols);

  interactiveCanvasState.cols = cols;
  interactiveCanvasState.CELL = CELL;

  const svgW = cols * CELL;
  const svgH = rows * CELL;

  // Build lookup: panelId → state
  const pState  = new Array(total).fill('free');  // free|prog|done-1|done-2|ts|tl|op|ep
  const pStrIdx = new Array(total).fill(-1);

  interactiveCanvasState.completedStrings.forEach((str, si) => {
    const st = _stateForStatus(str.status, str.ratio);
    str.panels.forEach(pid => { pState[pid] = st; pStrIdx[pid] = si; });
  });
  interactiveCanvasState.currentString.forEach(p => { pState[p.panelId] = 'prog'; });

  // In-progress health
  const csLen = interactiveCanvasState.currentString.length;
  const ratio  = interactiveCanvasState.activeRatio;
  const h      = csLen > 0 ? _checkHealth(csLen, ratio) : null;
  const progC  = h ? _SC[h.status] : _SC['idle'];

  let parts = [];

  // bg dots
  parts.push(`<defs><pattern id="ec4bg" x="0" y="0" width="${CELL}" height="${CELL}" patternUnits="userSpaceOnUse">
    <circle cx="1.5" cy="1.5" r="1.2" fill="rgba(148,163,184,.3)"/>
  </pattern></defs>
  <rect width="${svgW}" height="${svgH}" fill="url(#ec4bg)"/>`);

  // --- Inside _ec4BuildGrid ---

// 1. Render Completed Strings Connections
interactiveCanvasState.completedStrings.forEach((str, si) => {
  const col = palette[si % palette.length];
  if (str.panels.length < 2) return;

  if (str.ratio === 2) {
    // 2:1 Ratio -> Draw Curved Arcs between pairs
    for (let p = 0; p + 1 < str.panels.length; p += 2) {
      const p1 = panelCentre(str.panels[p]);
      const p2 = panelCentre(str.panels[p + 1]);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 - 15; // Arc height
      
      parts.push(`<path d="M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}" 
        fill="none" stroke="${col}" stroke-width="2.5" opacity="0.6" stroke-linecap="round"/>`);
    }
    
    // Connect the pairs to each other with a faint line
    const pathPts = str.panels.map(pid => {
      const ctr = panelCentre(pid);
      return `${ctr.x.toFixed(1)},${ctr.y.toFixed(1)}`;
    }).join(' ');
    parts.push(`<polyline points="${pathPts}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="2 2" opacity="0.2"/>`);

  } else {
    // 1:1 Ratio -> Draw Dotted Connectors
    const pts = str.panels.map(pid => {
      const ctr = panelCentre(pid);
      return `${ctr.x.toFixed(1)},${ctr.y.toFixed(1)}`;
    }).join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="3 4" stroke-linecap="round" opacity="0.7"/>`);
  }
});

// 2. Render In-Progress String (Current)
if (csLen >= 2) {
  const pc = h ? _SC[h.status] : _SC['idle'];
  const ratio = interactiveCanvasState.activeRatio;

  if (ratio === 2) {
    // Preview curves for in-progress 2:1
    for (let p = 0; p + 1 < interactiveCanvasState.currentString.length; p += 2) {
      const p1 = panelCentre(interactiveCanvasState.currentString[p].panelId);
      const p2 = panelCentre(interactiveCanvasState.currentString[p + 1].panelId);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 - 15;
      parts.push(`<path d="M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}" 
        fill="none" stroke="${pc.stroke}" stroke-width="2.5" opacity="0.8"/>`);
    }
  } else {
    // Preview dots for in-progress 1:1
    const pts = interactiveCanvasState.currentString.map(p => {
      const ctr = panelCentre(p.panelId);
      return `${ctr.x.toFixed(1)},${ctr.y.toFixed(1)}`;
    }).join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="${pc.stroke}" stroke-width="2" stroke-dasharray="3 4" opacity="0.8"/>`);
  }
}

  // Panels
  for (let id = 0; id < total; id++) {
    const c = id % cols, r = Math.floor(id / cols);
    const x = c*CELL+PAD, y = r*CELL+PAD;
    const w = CELL-2*PAD, hh = CELL-2*PAD;
    const cx = x+w/2, cy = y+hh/2;
    const si = pStrIdx[id];

    let fill, stroke, sw = 1.5, lbl = '·', lblC = '#94a3b8';

    const st = pState[id];
    if (st === 'prog') {
      fill = progC.fill; stroke = progC.stroke; sw = 2.5;
      const pi = interactiveCanvasState.currentString.findIndex(p => p.panelId === id);
      lbl = `P${pi+1}`; lblC = progC.stroke;
    } else if (st === 'free') {
      fill = '#f1f5f9'; stroke = '#cbd5e1'; sw = 1;
    } else {
      // completed
      const strColor = si >= 0 ? _PAL[si % _PAL.length] : '#3b82f6';
      const str = interactiveCanvasState.completedStrings[si];
      const sc = _SC[str?.status || 'ok'];
      fill   = `${strColor}1e`;
      stroke = strColor; sw = 2;
      lbl    = `S${si+1}`; lblC = strColor;
      // overlay tint for too-short/long
      if (str?.status === 'too-short')  { fill = '#fefce8'; stroke = '#ca8a04'; }
      if (str?.status === 'too-long')   { fill = '#fef2f2'; stroke = '#dc2626'; }
      if (str?.status === 'over-power') { fill = '#fef2f2'; stroke = '#dc2626'; }
      if (str?.status === 'odd-pair')   { fill = '#fff7ed'; stroke = '#ea580c'; }
    }

    // Solar cell dividers
    const divOp = st === 'free' ? '.15' : '.22';
    const divs  = `
      <line x1="${x+w*.33}" y1="${y+2}" x2="${x+w*.33}" y2="${y+hh-2}" stroke="${stroke}" stroke-width=".5" opacity="${divOp}" pointer-events="none"/>
      <line x1="${x+w*.67}" y1="${y+2}" x2="${x+w*.67}" y2="${y+hh-2}" stroke="${stroke}" stroke-width=".5" opacity="${divOp}" pointer-events="none"/>
      <line x1="${x+2}" y1="${y+hh/2}" x2="${x+w-2}" y2="${y+hh/2}" stroke="${stroke}" stroke-width=".5" opacity="${divOp}" pointer-events="none"/>
    `;

    parts.push(`<g data-id="${id}" style="cursor:crosshair;pointer-events:auto;">
      <rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="4"
        fill="${fill}" stroke="${stroke}" stroke-width="${sw}"
        style="pointer-events:none;"/>
      ${divs}
      <text x="${cx}" y="${cy+4}" text-anchor="middle"
        style="font-size:${lbl.length>2?'7.5':'9'}px;fill:${lblC};font-weight:700;pointer-events:none;user-select:none;">${lbl}</text>
      <rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="4"
        fill="transparent" stroke="none" style="pointer-events:all;"/>
    </g>`);
  }

  wrap.innerHTML = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}"
    style="display:block;min-width:${svgW}px;" xmlns="http://www.w3.org/2000/svg">
    ${parts.join('')}
  </svg>`;
}

// Portrait panel renderer override.
// This second declaration intentionally overrides the earlier _ec4BuildGrid.
function _ec4BuildGrid() {
  const wrap = document.getElementById('ec4-grid-wrap');
  if (!wrap) return;

  const total = interactiveCanvasState.totalPanels;
  const wrapW = wrap.clientWidth || 800;
  
  // 1. DYNAMIC GRID SCALING
  const TARGET_PANEL_W = 38;
  const cols = Math.max(8, Math.min(22, Math.floor(wrapW / (TARGET_PANEL_W + 6))));
  const PANEL_W = Math.floor((wrapW - 20) / cols) - 6;
  const PANEL_H = Math.round(PANEL_W * 1.65);
  const GAP = 5;
  const CELL_W = PANEL_W + GAP;
  const CELL_H = PANEL_H + GAP;
  const rows = Math.ceil(total / cols);

  interactiveCanvasState.cols = cols;
  interactiveCanvasState.CELL = CELL_W;
  interactiveCanvasState.CELL_H = CELL_H;

  const svgW = wrapW;
  const svgH = rows * CELL_H + 40; // Extra space for labels

  // 2. DATA PREP
  const pStrIdx = new Array(total).fill(-1);
  interactiveCanvasState.completedStrings.forEach((str, si) => {
    str.panels.forEach(pid => pStrIdx[pid] = si);
  });

  const cs = interactiveCanvasState.currentString.map(p => p.panelId);
  const ratio = interactiveCanvasState.activeRatio;
  const slices = interactiveCanvasState.inverterSlices || [];
  
  let parts = [];

  // Helper for coordinates
  const getPos = (id) => ({
    x: (id % cols) * CELL_W + 10,
    y: Math.floor(id / cols) * CELL_H + 10
  });

  // 3. RENDER INVERTER SECTION SEPARATORS AND LABELS
  slices.forEach((slice, idx) => {
    const startRow = Math.floor(slice.start / cols);
    const endRow = Math.floor(slice.end / cols);
    const startY = startRow * CELL_H + 5;
    const endY = (endRow + 1) * CELL_H + 5;
    
    // Vertical separator line between inverter sections
    if (idx > 0) {
      const prevSlice = slices[idx - 1];
      if (Math.floor(prevSlice.end / cols) === startRow) {
        // Same row - draw vertical line
        const lineX = Math.floor(slice.start % cols) * CELL_W + 5;
        parts.push(`<line x1="${lineX}" y1="${startY}" x2="${lineX}" y2="${endY}" stroke="${slice.color}" stroke-width="3" opacity="0.3" stroke-dasharray="5 5"/>`);
      }
    }
    
    // Inverter label header
    const labelY = startY - 15;
    parts.push(`<text x="15" y="${labelY}" font-size="11" font-weight="900" fill="${slice.color}" opacity="0.8">
      INV ${slice.idx + 1}: ${slice.count}p
    </text>`);
  });

  // 4. RENDER CONNECTIONS FIRST (Underneath panels)
  [...interactiveCanvasState.completedStrings, { panels: cs, isProg: true, ratio }].forEach((str, si) => {
    if (!str.panels || str.panels.length < 2) return;
    const isProg = str.isProg;
    const color = isProg ? '#3b82f6' : _PAL[si % _PAL.length];
    
    if (str.ratio === 2) {
      // Bridging Logic for 2:1
      for (let i = 0; i < str.panels.length; i += 2) {
        if (!str.panels[i+1]) break;
        const p1 = getPos(str.panels[i]);
        const p2 = getPos(str.panels[i+1]);
        const midX = (p1.x + p2.x + PANEL_W) / 2;
        const midY = (p1.y + p2.y + PANEL_H) / 2 - 15;
        
        parts.push(`<path d="M ${p1.x + PANEL_W/2} ${p1.y + PANEL_H/2} Q ${midX} ${midY} ${p2.x + PANEL_W/2} ${p2.y + PANEL_H/2}" 
          fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.8" class="opt-bridge-2to1"/>`);
      }
    } else {
      // 1:1 Serial path
      const pts = str.panels.map(id => {
        const p = getPos(id);
        return `${p.x + PANEL_W/2},${p.y + PANEL_H/2}`;
      }).join(' ');
      parts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4 3" opacity="0.6"/>`);
    }
  });

  // 5. RENDER INDIVIDUAL PANELS
  const csLen = interactiveCanvasState.currentString.length;
  const currentOwner = csLen > 0 ? _ownerForPanel(cs[0]) : null;
  const health = csLen > 0 ? _checkHealth(csLen, ratio, currentOwner?.id) : null;
  const statusColor = health ? _SC[health.status] : null;

  for (let id = 0; id < total; id++) {
    const { x, y } = getPos(id);
    const si = pStrIdx[id];
    const isProg = cs.includes(id);
    const owner = _ownerForPanel(id);

    let fill = '#1e293b', stroke = '#475569', sw = 1;
    let label = '';
    let borderColor = owner?.color || '#475569';

    if (isProg) {
      // Use status-based colors for panels in the current string
      if (statusColor) {
        fill = statusColor.fill;
        stroke = statusColor.stroke;
      } else {
        fill = '#3b82f633'; 
        stroke = '#3b82f6';
      }
      sw = 2;
      label = cs.indexOf(id) + 1;
    } else if (si !== -1) {
      const color = _PAL[si % _PAL.length];
      fill = color + '22'; stroke = color; sw = 2;
      label = `S${si+1}`;
    }

    // Advanced Panel SVG with inverter color indicator
    parts.push(`
      <g data-id="${id}" onclick="handlePanelLink('', ${Math.floor(id/cols)}, ${id%cols})" style="cursor:pointer">
        <rect x="${x}" y="${y}" width="${PANEL_W}" height="${PANEL_H}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" class="ec4-panel-rect"/>
        <!-- Inverter owner color bar -->
        <rect x="${x}" y="${y}" width="3" height="${PANEL_H}" rx="3" fill="${borderColor}" opacity="0.9"/>
        <!-- Corner dot showing inverter assignment -->
        <circle cx="${x + PANEL_W - 6}" cy="${y + 6}" r="3" fill="${borderColor}"/>
        <!-- Grid dividers -->
        <line x1="${x+2}" y1="${y + PANEL_H*0.3}" x2="${x+PANEL_W-2}" y2="${y + PANEL_H*0.3}" class="panel-grid-line"/>
        <line x1="${x+2}" y1="${y + PANEL_H*0.6}" x2="${x+PANEL_W-2}" y2="${y + PANEL_H*0.6}" class="panel-grid-line"/>
        <!-- Panel number label -->
        <text x="${x + PANEL_W/2}" y="${y + PANEL_H/2 + 5}" text-anchor="middle" fill="${stroke}" font-size="10" font-weight="900" style="pointer-events:none">${label}</text>
      </g>
    `);
  }

  wrap.innerHTML = `
    <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0f172a"/>
      ${parts.join('')}
    </svg>`;
}

function _stateForStatus(status, ratio) {
  if (!status || status === 'ok') return `done-${ratio}`;
  return status;
}

// ══════════════════════════════════════════════════════════════════
// RATIO BUTTONS
// ══════════════════════════════════════════════════════════════════
function _ec4UpdateRatio() {
  const r  = interactiveCanvasState.activeRatio;
  const b1 = document.getElementById('ec4_r1');
  const b2 = document.getElementById('ec4_r2');
  if (b1) b1.className = `ec4-rb ${r===1 ? 'ec4-rb-1on' : 'ec4-rb-off'}`;
  if (b2) b2.className = `ec4-rb ${r===2 ? 'ec4-rb-2on' : 'ec4-rb-off'}`;

  const currentOwner = interactiveCanvasState.currentString.length > 0
    ? _ownerForPanel(interactiveCanvasState.currentString[0].panelId)
    : null;
  const lim = _getLimits(r, currentOwner?.id);

  const badge = document.getElementById('ec4-lim-badge');
  const powEl = document.getElementById('ec4-lim-pow');

  if (badge) {
    const col = r === 2
      ? 'background:#fff7ed;color:#7c2d12;border-color:#ea580c;'
      : 'background:#fefce8;color:#713f12;border-color:#ca8a04;';
    badge.style.cssText = col;

    // Show full continuous range — panels = optimizers × ratio
    const minPanels  = lim.min * r;
    const maxPanels  = lim.max * r;
    const powerNote  = lim.max < lim.catalogMax
      ? ` (power-limited from ${lim.catalogMax * r}p)`
      : '';

    badge.textContent =
      `${r}:1  ·  Optimizers ${lim.min}–${lim.max}  ·  Panels ${minPanels}–${maxPanels}${powerNote}  ·  Any value in range valid`;
  }

  if (powEl) powEl.textContent = `${(lim.maxPow / 1000).toFixed(2)} kW`;
}

// ══════════════════════════════════════════════════════════════════
// HEALTH BAR
// ══════════════════════════════════════════════════════════════════
function _ec4UpdateHealthBar() {
  const csLen = interactiveCanvasState.currentString.length;
  const ratio = interactiveCanvasState.activeRatio;
  const msg   = document.getElementById('ec4-hb-msg');
  const right = document.getElementById('ec4-hb-right');
  const bar   = document.getElementById('ec4-healthbar');
  const fin   = document.getElementById('ec4_fin');
  if (!bar || !msg) return;

  if (csLen === 0) {
    bar.style.background = '#1e293b'; bar.style.color = '#94a3b8';
    msg.textContent = 'Click panels to start building a string';
    if (right) right.textContent = '';
    if (fin) fin.disabled = true;
    return;
  }

  const currentOwner = _ownerForPanel(interactiveCanvasState.currentString[0]?.panelId);
  const h  = _checkHealth(csLen, ratio, currentOwner?.id);
  const sc = _SC[h.status];
  bar.style.background = sc.bar; bar.style.color = sc.barTxt;
  msg.textContent = `${sc.icon}  ${h.msg}`;

  const lim = h.lim;
  if (right) {
    right.textContent = `Optimizers: ${h.optFloor} / ${lim.min}–${lim.max}  |  Power: ${(h.power/1000).toFixed(2)} kW / ${(lim.maxPow/1000).toFixed(1)} kW`;
  }
  if (fin) fin.disabled = !h.canFinish;
}

// ══════════════════════════════════════════════════════════════════
// METRICS + SUMMARY + BOM
// ══════════════════════════════════════════════════════════════════
function _ec4Refresh() {
  const total = interactiveCanvasState.totalPanels;
  const done  = interactiveCanvasState.completedStrings.reduce((s,st)=>s+st.panelCount,0);
  const prog  = interactiveCanvasState.currentString.length;
  const rem   = total - done - prog;
  const nStrs = interactiveCanvasState.completedStrings.length;
  const ratio = interactiveCanvasState.activeRatio;
  _renderInverterSliceLegend();

  _e4('ec4m-done',  done,  done===total?'#16a34a':'#3b82f6');
  _e4('ec4m-rem',   rem,   rem===0?'#16a34a':rem<0?'#dc2626':'#64748b');
  _e4('ec4m-prog',  prog,  prog>0?'#f59e0b':'#94a3b8');
  _e4('ec4m-strs',  nStrs, '#8b5cf6');

  const curEl = document.getElementById('ec4m-cur');
  if (curEl) {
    if (prog === 0) { curEl.textContent='–'; curEl.style.color='#94a3b8'; }
    else {
      const oc = ratio===2 ? Math.ceil(prog/2) : prog;
      curEl.textContent = `${prog}p · ${oc}opt [${ratio}:1]`;
      curEl.style.color = ratio===2 ? '#ea580c' : '#ca8a04';
    }
  }

  // Pills
  const sum = document.getElementById('ec4-summary');
  if (sum && nStrs > 0) {
    const s1   = getStage1Snapshot();
    const watt = s1.panelWattage || 580;
    const pills = interactiveCanvasState.completedStrings.map((str,idx) => {
      const col    = _PAL[idx % _PAL.length];
      const optQty = str.optimizerQty || (str.ratio===2 ? Math.ceil(str.panelCount/2) : str.panelCount);
      const kw     = (str.panelCount*watt/1000).toFixed(2);
      const sc     = _SC[str.status || 'ok'];
      const bg     = str.status && str.status!=='ok' ? sc.fill : `${col}18`;
      const bc     = str.status && str.status!=='ok' ? sc.stroke : col;
      const tc     = str.status && str.status!=='ok' ? sc.stroke : col;
      const icon   = sc.icon;
      const invTag = str.assignedInverterIdx ? ` INV${str.assignedInverterIdx} ·` : '';
      return `<span class="ec4-spill" style="background:${bg};color:${tc};border-color:${bc};"
        title="Click to delete this string" onclick="_ec4DeleteString(${idx})">
        ${icon} S${idx+1}${invTag} [${str.ratio}:1] · ${str.panelCount}p · ${optQty}opt · ${kw}kW ✕
      </span>`;
    }).join('');
    const remC = rem===0?'#16a34a':rem<0?'#dc2626':'#64748b';
    sum.innerHTML = pills +
      `<span class="ec4-rem" style="color:${remC};">` +
      (rem===0?'✓ All assigned':rem>0?`${rem} panels remaining`:`${Math.abs(rem)} over`)+`</span>`;
  } else if (sum && nStrs===0 && prog===0) {
    sum.innerHTML = '<span style="color:#94a3b8;">No strings yet — pick a ratio and click panels.</span>';
  }

  _ec4UpdateRemainingHint(rem, prog);

  // Live BOM
  _ec4UpdateBom();
}

function _ec4UpdateRemainingHint(rem, prog) {
  const hint = document.getElementById('ec4-remaining-hint');
  if (!hint) return;
  if (rem <= 0 || prog > 0) { hint.style.display = 'none'; return; }

  const lim1 = _getLimits(1);
  const lim2 = _getLimits(2);
  const msgEl = document.getElementById('ec4-rem-hint-msg');
  hint.style.display = 'flex';

  // Policy override: allow 2:1 validity starting at 27 panels.
  const min2Panels = 27;

  let guidance = `${rem} panel${rem > 1 ? 's' : ''} unassigned.`;

  if (rem >= min2Panels) {
    guidance += ` Enough for another 2:1 string (need min ${min2Panels} panels). Switch ratio to 2:1.`;
  } else if (rem >= lim1.min) {
    guidance += ` Switch to 1:1 — ${rem} panels is within 1:1 limits (min ${lim1.min}, max ${lim1.max}).`;
  } else {
    guidance += ` Only ${rem} panels left — below 1:1 minimum (${lim1.min}). Use "Auto-assign as 1:1 string" to force-finish.`;
  }

  if (msgEl) msgEl.textContent = guidance;
}

window._ec4AutoCleanup1to1 = function(split) {
  const total = interactiveCanvasState.totalPanels;
  const done  = interactiveCanvasState.completedStrings.reduce((s, st) => s + st.panelCount, 0);
  const rem   = total - done;
  if (rem <= 0) return;

  const lim1 = _getLimits(1);
  const assignedIds = new Set(interactiveCanvasState.completedStrings.flatMap(s => s.panels));
  const freePanels = [];
  for (let i = 0; i < total; i++) { 
    if (!assignedIds.has(i)) freePanels.push(i);
  }

  if (!split) {
    const count = freePanels.length;
    const h = _checkHealth(count, 1);
    interactiveCanvasState.completedStrings.push({
      panels: freePanels,
      panelCount: count,
      optimizerQty: count,
      ratio: 1,
      status: h.status,
    });
  } else {
    let idx = 0;
    while (idx < freePanels.length) {
      const chunkSize = Math.min(lim1.max, freePanels.length - idx);
      const chunk = freePanels.slice(idx, idx + chunkSize);
      const h = _checkHealth(chunkSize, 1);
      interactiveCanvasState.completedStrings.push({
        panels: chunk,
        panelCount: chunkSize,
        optimizerQty: chunkSize,
        ratio: 1,
        status: h.status,
      });
      idx += chunkSize;
    }
  }

  _ec4BuildGrid();
  _ec4UpdateHealthBar();
  _ec4Refresh();
};

function _ec4UpdateBom() {
  const strs   = interactiveCanvasState.completedStrings;
  const bomDiv = document.getElementById('ec4-bom');
  const bomGrid= document.getElementById('ec4-bom-grid');
  if (!bomDiv || !bomGrid) return;
  if (strs.length === 0) { bomDiv.style.display='none'; return; }
  bomDiv.style.display = 'block';

  const optimizer = getSelectedOptimizer();
  const twoName   = getOptimizerNameForRatio(2);
  const oneName   = getOptimizerNameForRatio(1);

  let qty2=0, qty1=0;
  strs.forEach(s => {
    if (s.ratio===2) qty2 += s.optimizerQty;
    else             qty1 += s.optimizerQty;
  });

  let cards = '';
  if (qty2>0) cards += `<div class="ec4-bom-card"><span class="ec4-bom-qty">${qty2}</span><span class="ec4-bom-name">${twoName}</span></div>`;
  if (qty1>0) cards += `<div class="ec4-bom-card" style="border-color:#ca8a04;background:#fefce8;"><span class="ec4-bom-qty" style="color:#713f12;">${qty1}</span><span class="ec4-bom-name" style="color:#713f12;">${oneName}</span></div>`;
  const totalOpt = qty1+qty2;
  cards += `<div class="ec4-bom-card" style="border-color:#8b5cf6;background:#f5f3ff;"><span class="ec4-bom-qty" style="color:#6d28d9;">${totalOpt}</span><span class="ec4-bom-name" style="color:#6d28d9;">Total Optimizers</span></div>`;
  bomGrid.innerHTML = cards;
}

function _e4(id, val, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val;
  if (color) el.style.color = color;
}

// ══════════════════════════════════════════════════════════════════
// DELETE A COMPLETED STRING (click pill ✕)
// ══════════════════════════════════════════════════════════════════
window._ec4DeleteString = function(idx) {
  interactiveCanvasState.completedStrings.splice(idx, 1);
  _ec4BuildGrid();
  _ec4UpdateHealthBar();
  _ec4Refresh();
};

// ══════════════════════════════════════════════════════════════════
// SET RATIO
// ══════════════════════════════════════════════════════════════════
function setCanvasRatio(ratio) {
  if (interactiveCanvasState.activeRatio === ratio) return;
  interactiveCanvasState.currentString = [];   // discard in-progress only
  interactiveCanvasState.activeRatio = ratio;  // completed strings are preserved
  _ec4UpdateRatio();
  _ec4BuildGrid();
  _ec4UpdateHealthBar();
  _ec4Refresh();
}

// ══════════════════════════════════════════════════════════════════
// PANEL CLICK  (old signature kept)
// ══════════════════════════════════════════════════════════════════
function handlePanelLink(_pidStr, row, col) {
  const cols    = interactiveCanvasState.cols;
  if (!cols || cols === 0) return;  // Guard: grid not initialized
  const panelId = row * cols + col;
  const total   = interactiveCanvasState.totalPanels;
  if (panelId >= total || panelId < 0) return;

  // Block already-completed panels
  const isDone = interactiveCanvasState.completedStrings.some(s => s.panels.includes(panelId));
  if (isDone) return;

  // Click in-progress panel ? remove it and everything after
  const inIdx = interactiveCanvasState.currentString.findIndex(p => p.panelId === panelId);
  if (inIdx != -1) {
    interactiveCanvasState.currentString = interactiveCanvasState.currentString.slice(0, inIdx);
    _ec4BuildGrid(); _ec4UpdateHealthBar(); _ec4Refresh();
    return;
  }

  if (!_sameOwnerAsCurrent(panelId)) {
    alert("This panel belongs to a different inverter block. Finish current string first.");
    return;
  }

  interactiveCanvasState.currentString.push({ panelId });
  _ec4BuildGrid();
  _ec4UpdateHealthBar();
  _ec4Refresh();
}


// ══════════════════════════════════════════════════════════════════
// UNDO
// ══════════════════════════════════════════════════════════════════
function undoLastPanel() {
  if (interactiveCanvasState.currentString.length === 0) return;
  interactiveCanvasState.currentString.pop();
  _ec4BuildGrid(); _ec4UpdateHealthBar(); _ec4Refresh();
}

// ══════════════════════════════════════════════════════════════════
// FINISH STRING
// ══════════════════════════════════════════════════════════════════
function finishCurrentString() {
  const cs    = interactiveCanvasState.currentString;
  const ratio = interactiveCanvasState.activeRatio;
  const count = cs.length;

  if (count === 0) return;

  const owner = _ownerForPanel(cs[0]?.panelId);
  const h = _checkHealth(count, ratio, owner?.id);

  if (!h.canFinish) {
    alert(`Cannot finish string:\n${h.msg}`);
    return;
  }

  // Store full metadata including ratio, optimizerQty, and electrical values
  const s1       = getStage1Snapshot();
  const watt     = s1.panelWattage || 580;
  const vmpBase  = s1.panelVmp    || 41.5;
  const vocCold  = calculateVocCold(s1);
  const optQty   = h.optFloor;

  interactiveCanvasState.completedStrings.push({
    panels:       cs.map(p => p.panelId),
    panelCount:   count,
    optimizerQty: optQty,
    ratio,
    status:       'ok',
    stringPower:  count * watt,
    vmpAt25:      vmpBase * optQty,
    vocAtCold:    vocCold * optQty,
    assignedInverterId: owner?.id,
    assignedInverterName: owner?.name,
    assignedInverterIdx: owner?.idx,
  });

  interactiveCanvasState.currentString = [];

  _ec4BuildGrid();
  _ec4UpdateHealthBar();
  _ec4Refresh();
}

window._ec4AutoCleanup1to1 = function (split) {
  const total = interactiveCanvasState.totalPanels;
  const done  = interactiveCanvasState.completedStrings.reduce((s, st) => s + st.panelCount, 0);
  const rem   = total - done;
  if (rem <= 0) return;

  const lim1 = _getLimits(1);

  if (!lim1 || lim1.min <= 0) {
    alert('Select an inverter and optimizer before auto-assigning remaining panels.');
    return;
  }

  const assignedIds = new Set(
    interactiveCanvasState.completedStrings.flatMap(s => s.panels)
  );
  const groupedFree = new Map();
  for (let i = 0; i < total; i++) {
    if (assignedIds.has(i)) continue;
    const owner = _ownerForPanel(i);
    const key = owner?.id ?? "default";
    if (!groupedFree.has(key)) groupedFree.set(key, { owner, panels: [] });
    groupedFree.get(key).panels.push(i);
  }

  groupedFree.forEach(({ owner, panels }) => {
    if (!panels.length) return;
    if (!split) {
      const count = panels.length;
      const h = _checkHealth(count, 1, owner?.id);
      interactiveCanvasState.completedStrings.push({
        panels,
        panelCount: count,
        optimizerQty: count,
        ratio: 1,
        status: h.status,
        assignedInverterId: owner?.id,
        assignedInverterName: owner?.name,
        assignedInverterIdx: owner?.idx,
      });
      return;
    } else if (owner) {
      frameStroke = owner.color;
      frameFill = owner.color + '22';
      labelTxt = `I${owner.idx}`;
      labelCol = owner.color;
    }

    let idx = 0;
    while (idx < panels.length) {
      const chunkSize = Math.min(lim1.max, panels.length - idx);
      if (chunkSize <= 0) break;
      const chunk = panels.slice(idx, idx + chunkSize);
      const h = _checkHealth(chunkSize, 1, owner?.id);
      interactiveCanvasState.completedStrings.push({
        panels: chunk,
        panelCount: chunkSize,
        optimizerQty: chunkSize,
        ratio: 1,
        status: h.status,
        assignedInverterId: owner?.id,
        assignedInverterName: owner?.name,
        assignedInverterIdx: owner?.idx,
      });
      idx += chunkSize;
    }
  });

  _ec4BuildGrid();
  _ec4UpdateHealthBar();
  _ec4Refresh();
};

// ══════════════════════════════════════════════════════════════════
function clearAllStrings() {
  interactiveCanvasState.completedStrings = [];
  interactiveCanvasState.currentString    = [];
  _ec4BuildGrid(); _ec4UpdateHealthBar(); _ec4Refresh();
}

function canForceManualConfirm(totalAssigned, targetPanels) {
  return totalAssigned === targetPanels;
}

// ══════════════════════════════════════════════════════════════════
// APPLY TO DESIGN
// ══════════════════════════════════════════════════════════════════
function applyDrawnStrings() {
  const s1             = getStage1Snapshot();
  const optimizer      = getSelectedOptimizer();
  const invertersToUse = resolveManualInverters();
  const strs           = interactiveCanvasState.completedStrings;

  if (strs.length === 0) {
    alert('No strings to apply.');
    return;
  }
  if (!invertersToUse || invertersToUse.length === 0) {
    alert('No inverter selected to apply design.');
    return;
  }

  const invalid = strs.filter(s => s.status && s.status !== 'ok');
  if (invalid.length > 0) {
    const msgs = invalid
      .map(s => `S${interactiveCanvasState.completedStrings.indexOf(s) + 1}: ${s.status}`)
      .join('\n');
    if (!confirm(`${invalid.length} string(s) have issues:\n${msgs}\n\nApply anyway?`)) return;
  }

  const totalAssigned = strs.reduce((s, st) => s + st.panelCount, 0);
  const target        = interactiveCanvasState.totalPanels;
  if (totalAssigned !== target) {
    if (!confirm(`Panel mismatch: ${totalAssigned} assigned vs ${target} required. Apply anyway?`)) return;
  }

  const vmpBase    = s1.panelVmp     || 41.5;
  const panelImp   = s1.panelImp     || 13.5;
  const panelWatt  = s1.panelWattage || 580;
  const vocColdMod = calculateVocCold(s1);

  const primaryInv = invertersToUse[0];

  const warnings = [];
  const trackers = [];
  let   tId      = 1;

  strs.forEach((str) => {
    const ratio    = str.ratio;
    const count    = str.panelCount;
    const optQty   = str.optimizerQty;    // already validated in finishCurrentString
    const firstPanel = str.panels?.[0];
    const owner = _ownerForPanel(firstPanel);
    const assignedInv =
      invertersToUse.find(u => u.id?.toString() === (str.assignedInverterId || owner?.id || "").toString()) ||
      invertersToUse.find(u => u.id?.toString() === (owner?.id || "").toString()) ||
      primaryInv;
    const invSpecs = assignedInv?.inverter?.specifications || {};
    const is1Phase = assignedInv?.inverter?.subcategory === '1-Phase' || invSpecs.subcategory === '1-Phase';
    const targetVolt = is1Phase ? 350 : 750;
    const imaxStr = invSpecs.imax_string || 15;
    const strPower = count * panelWatt;
    const vocAtCold = vocColdMod * optQty;
    const vmpAt25   = vmpBase    * optQty;

    // Electrical warnings (non-blocking)
    if (panelImp > imaxStr) {
      warnings.push(`S${tId}: panel Imp ${panelImp}A exceeds inverter imax_string ${imaxStr}A`);
    }
    const maxStrPower = imaxStr * targetVolt;
    if (strPower > maxStrPower) {
      warnings.push(`S${tId}: string power ${(strPower/1000).toFixed(2)}kW exceeds limit ${(maxStrPower/1000).toFixed(2)}kW`);
    }

    trackers.push({
      id:                   tId++,
      formation:            `1*${optQty}`,
      stringQty:            1,
      panelsPerString:      count,
      optimizerQty:         optQty,
      type:                 `${ratio}:1`,
      vmpAt25,
      vocAtCold,
      current:              panelImp,
      stringPower:          strPower,
      assignedInverterId:   assignedInv.id,
      assignedInverterName: assignedInv.inverter.name,
      isManual:             true,
    });
  });

  const rawBom = trackers.map(t => ({
    name: t.type === '2:1' ? getOptimizerNameForRatio(2) : getOptimizerNameForRatio(1),
    qty:  t.optimizerQty,
  }));
  const bom          = consolidateBom(rawBom);
  const totalDcPower = trackers.reduce((s, t) => s + t.stringPower, 0);

  const customOption = {
    id:          'opt_canvas_v4',
    title:       'Manual Canvas Design',
    config:      `${trackers.length} String(s) | ${totalAssigned}/${target} Panels | ${[...new Set(strs.map(s => s.ratio + ':1'))].join('+')}`,
    trackers,
    bom,
    totalDcPower,
    stringPower: trackers.length > 0 ? totalDcPower / trackers.length / 1000 : 0,
    valid:       canForceManualConfirm(totalAssigned, target),
    warning:     warnings.length > 0 ? warnings.join(' | ') : null,
    manualOverrideConfirmed: canForceManualConfirm(totalAssigned, target),
  };

  // ── Write manual trackers onto the inverter unit ──────────────────
  // Clear all previous manual overrides first
  multiInverterDesign.forEach(u => {
    u.manualOverride  = false;
    u.manualTrackers  = [];
  });

  // Apply per-inverter unit based on assigned panel block
  invertersToUse.forEach(u => {
    const unitTrackers = trackers.filter(t => t.assignedInverterId === u.id);
    const unit = multiInverterDesign.find(x => x.id === u.id);
    if (unit) {
      unit.manualOverride = unitTrackers.length > 0;
      unit.manualTrackers = unitTrackers;
    }
  });

  // ── Build unit reports for render functions ───────────────────────
  const unitReports = invertersToUse.map(u => {
    const specs      = u.inverter.specifications || {};
    const unitT      = trackers.filter(t => t.assignedInverterId === u.id);
    const unitPanels = unitT.reduce((s, t) => s + t.panelsPerString, 0);
    return {
      unit:             u,
      specs,
      unitDcKwp:        (unitPanels * panelWatt) / 1000,
      unitAcKw:         getAcKw(specs) * u.qty,
      panelCount:       unitPanels,
      trackers:         unitT,
      isManualOverride: true,
    };
  });

  // ── Single source of truth: update ALL report surfaces ───────────
  applyDesignOption(customOption, primaryInv.inverter, primaryInv.qty, s1);

  renderSolarEdgeCombinedReport(unitReports, s1, customOption, optimizer);

  renderSolarEdgeMetrics(customOption, primaryInv.inverter, primaryInv.qty, s1, unitReports);

  renderDetailedSystemReport(invertersToUse.map(u => ({
    modelName: u.inverter.name,
    qty:       u.qty,
    trackers:  trackers.filter(t => t.assignedInverterId === u.id),
  })));

  renderVisualStringDiagram(trackers);

  if (s1.monthlyTable?.length > 0) renderMiniChart(s1.monthlyTable);

  // ── Confirm to user ───────────────────────────────────────────────
  const summary  = strs.map((s, i) => `S${i+1}[${s.ratio}:1·${s.panelCount}p·${s.optimizerQty}opt]`).join(' + ');
  const warnNote = warnings.length > 0 ? `\n\n⚠ Warnings:\n${warnings.join('\n')}` : '';
  alert(`✓ Design applied!\n${trackers.length} strings · ${totalAssigned} panels\n\n${summary}${warnNote}`);
}
// ══════════════════════════════════════════════════════════════════
// STUBS (keep old callers alive)
// ══════════════════════════════════════════════════════════════════
function updateLiveMetrics()  {}
function updateSvgPath()      {}
function checkSolarEdgeHealth(){ return true; }
function updatePathColor()    {}
function _updateCompletedStringsSummary(s1) { _ec4Refresh(); }

// ══════════════════════════════════════════════════════════════════
// DYNAMIC PANEL COUNT REFRESH
// ══════════════════════════════════════════════════════════════════
// Call this when panel count changes from top navbar to refresh canvas
function refreshInteractiveCanvasIfEnabled() {
  // Only refresh if manual mode is enabled AND system type is optimizer
  if (!manualModeEnabled || currentSystemType !== "optimizer") return;
  
  const s1 = getStage1Snapshot();
  const container = document.getElementById('diagram_container');
  if (!container || !s1.panelCount) return;
  
  const nextTotal = s1.panelCount || 0;
  const ownership = _buildPanelToInverterMap(nextTotal);
  const oldSig = JSON.stringify((interactiveCanvasState.inverterSlices || []).map(s => `${s.id}:${s.count}`));
  const newSig = JSON.stringify((ownership.slices || []).map(s => `${s.id}:${s.count}`));

  // Skip only if both total and allocation are unchanged
  const oldTotal = interactiveCanvasState.totalPanels || 0;
  if (nextTotal === oldTotal && oldSig === newSig) return;
  
  // Clear completed strings and start fresh (or preserve if user prefers)
  // For now, reset to begin fresh with new panel count
  interactiveCanvasState.totalPanels      = nextTotal;
  interactiveCanvasState.currentString    = [];
  interactiveCanvasState.completedStrings = [];
  interactiveCanvasState.panelToInverter  = ownership.map;
  interactiveCanvasState.inverterSlices   = ownership.slices;
  
  // Rebuild the grid with new panel count
  _ec4BuildGrid();
  _ec4UpdateRatio();
  _renderInverterSliceLegend();
  _ec4Refresh();
}

// ══════════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════════
window.generateInteractiveGrid         = generateInteractiveGrid;
window.setCanvasRatio                  = setCanvasRatio;
window.handlePanelLink                 = handlePanelLink;
window.finishCurrentString             = finishCurrentString;
window.undoLastPanel                   = undoLastPanel;
window.clearAllStrings                 = clearAllStrings;
window.applyDrawnStrings               = applyDrawnStrings;
window.injectCanvasCss                 = injectCanvasCss;
window.updateLiveMetrics               = updateLiveMetrics;
window.checkSolarEdgeHealth            = checkSolarEdgeHealth;
window._updateCompletedStringsSummary  = _updateCompletedStringsSummary;
window.refreshInteractiveCanvasIfEnabled = refreshInteractiveCanvasIfEnabled;
window.interactiveCanvasState          = interactiveCanvasState;

console.log('[Stage2 Canvas v4.0 — Mixed Optimizer] loaded ✓');


function getOptimizerLimits(invSpecs, ratio) {
  const is1Phase = invSpecs.subcategory === "1-Phase";
  const invClass = invSpecs.string_class || (is1Phase ? "1-Phase" : "SE12.5K-20K");
  const optimizer = resolveOptimizerForRatio(ratio) || getSelectedOptimizer();
  const optSpec = optimizer?.specifications || {};
  if (ratio === 1) return { min: 1, max: 16 };
  const limits =
    ratio === 2
      ? optSpec.string_limits?.[invClass] || { min: 14, max: 30 }
      : optSpec.string_limits_1to1?.[invClass] || optSpec.string_limits?.[invClass] || { min: 8, max: 25 };
  return { min: limits.min || 1, max: limits.max || 60 };
}
function renderManualVisualDiagram() {
  const container = document.getElementById("diagram_container");
  const section = document.getElementById("visual_string_diagram");
  if (!container) return;
  if (section) section.classList.remove("hidden");

  const s1 = getStage1Snapshot();
  const isOpt = currentSystemType === "optimizer";
  const invertersToUse = resolveManualInverters();
  const optimizer = getSelectedOptimizer();

  if (!manualLayoutState || !manualLayoutState.strings) {
    initManualLayoutFromTrackers(getTrackersForManualSeed());
  }

  const strings = manualLayoutState?.strings || [];
  const targetPanels = s1.panelCount || 0;
  let totalPanels = 0;
  let errorCount = 0;
  let warnCount = 0;
  let validCount = 0;

  const stringMeta = strings.map((str, idx) => {
    const assignedInv =
      invertersToUse.find(u => u.id.toString() === str.assignedInverterId?.toString()) || invertersToUse[0];
    const invSpecs = assignedInv?.inverter?.specifications || {};

    if (isOpt) {
      const ratio = str.ratio || 2;
      const limits = getOptimizerLimits(invSpecs, ratio);
      const opts = Math.max(limits.min, Math.min(limits.max, parseInt(str.optimizerQty || limits.min)));
      str.optimizerQty = opts;
      const panels = opts * ratio;
      str.panelsPerString = panels;
      totalPanels += panels;
      const result = validateManualOptimizerEntry(opts, ratio, invSpecs, optimizer, s1);
      const hasErrors = result.errors.length > 0;
      const hasWarns = result.warnings.length > 0;
      if (hasErrors) errorCount++;
      else if (hasWarns) warnCount++;
      else validCount++;
      return { idx, assignedInv, invSpecs, ratio, limits, opts, panels, result, hasErrors, hasWarns };
    }

    const result = validateManualStringEntry(1, str.panelsPerString || 1, invSpecs, s1);
    const pps = Math.max(result.minLen, Math.min(result.maxLen, parseInt(str.panelsPerString || result.minLen)));
    str.panelsPerString = pps;
    totalPanels += pps;
    const hasErrors = result.errors.length > 0;
    const hasWarns = result.warnings.length > 0;
    if (hasErrors) errorCount++;
    else if (hasWarns) warnCount++;
    else validCount++;
    return { idx, assignedInv, invSpecs, pps, result, hasErrors, hasWarns };
  });

  const remaining = targetPanels - totalPanels;
  const summaryColor = remaining === 0 && errorCount === 0 ? "#16a34a" : errorCount > 0 ? "#dc2626" : "#f59e0b";
  const summaryBg = remaining === 0 && errorCount === 0 ? "#f0fdf4" : errorCount > 0 ? "#fef2f2" : "#fffbeb";
  const summaryBorder = remaining === 0 && errorCount === 0 ? "#86efac" : errorCount > 0 ? "#fca5a5" : "#fde68a";

  let html = `
    <div style="background:#fff; border:2px solid ${summaryBorder}; border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:12px; background:${summaryBg}; border-radius:8px; border-left:4px solid ${summaryColor};">
        <div>
          <div style="font-weight:900; color:${summaryColor}; font-size:0.95rem;">Manual String Editor</div>
          <div style="font-size:0.8rem; color:#475569; margin-top:4px;">
            <strong>Total: ${totalPanels}</strong> / <strong>Target: ${targetPanels}</strong>
            ${remaining !== 0 ? ` | <span style="color:${summaryColor}; font-weight:700;">${remaining > 0 ? "⚠ " + remaining + " panels missing" : "✕ " + Math.abs(remaining) + " panels extra"}</span>` : " | <span style='color:#16a34a; font-weight:700;'>✓ Perfect match</span>"}
            ${errorCount + warnCount + validCount > 0 ? ` | <span style="color:#64748b;"><span style='color:#dc2626;'>${errorCount}E</span> <span style='color:#f59e0b;'>${warnCount}W</span> <span style='color:#16a34a;'>${validCount}V</span></span>` : ""}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btn_apply_manual_design" style="padding:8px 14px; border-radius:6px; border:1px solid #16a34a; background:#ecfdf5; color:#166534; font-weight:800; font-size:0.75rem; cursor:pointer;"><i class="fas fa-check"></i> Apply & Confirm Stage 2</button>
          <button id="btn_add_manual_string" style="padding:8px 14px; border-radius:6px; border:1px solid #3b82f6; background:#eff6ff; color:#1e40af; font-weight:700; font-size:0.75rem; cursor:pointer;"><i class="fas fa-plus"></i> Add String</button>
          <button id="btn_remove_manual_string" style="padding:8px 14px; border-radius:6px; border:1px solid #dc2626; background:#fef2f2; color:#991b1b; font-weight:700; font-size:0.75rem; cursor:pointer;"><i class="fas fa-trash"></i> Remove Last</button>
        </div>
      </div>
  `;

  stringMeta.forEach((m, i) => {
    const str = strings[i];
    const label = m.assignedInv?.inverter?.name
      ? `${m.assignedInv.inverter.name.split(" ")[0]} | S${i + 1}`
      : `S${i + 1}`;
    const invSelect =
      invertersToUse.length > 1
        ? `
      <select class="manual-string-inv" data-uid="${str.uid}" style="padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.75rem;">
        ${buildInvOptions(str.assignedInverterId)}
      </select>
    `
        : "";

    const statusColor = m.hasErrors ? "#dc2626" : m.hasWarns ? "#f59e0b" : "#16a34a";
    const statusBg = m.hasErrors ? "#fef2f2" : m.hasWarns ? "#fffbeb" : "#f0fdf4";
    const statusBorder = m.hasErrors ? "#fca5a5" : m.hasWarns ? "#fde68a" : "#86efac";
    const statusIcon = m.hasErrors ? "✕" : m.hasWarns ? "⚠" : "✓";

    if (isOpt) {
      const panels = m.panels;
      const ratio = m.ratio || 2;
      const min = m.limits.min;
      const max = m.limits.max;
      html += `
        <div style="display:flex; flex-direction:column; gap:10px; padding:14px; background:${statusBg}; border:1.5px solid ${statusBorder}; border-radius:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; color:#1e40af; font-size:0.85rem;">${label}</span>
              <span style="background:${statusBg}; color:${statusColor}; padding:2px 8px; border-radius:4px; font-weight:800; font-size:0.75rem; border:1px solid ${statusBorder};">${statusIcon}</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              ${invSelect}
              <select class="manual-string-ratio" data-uid="${str.uid}" style="padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.75rem; font-weight:700;">
                <option value="2" ${ratio === 2 ? "selected" : ""}>2:1</option>
                <option value="1" ${ratio === 1 ? "selected" : ""}>1:1</option>
              </select>
              <button class="manual-string-remove" data-uid="${str.uid}" style="padding:4px 8px; border-radius:6px; border:1px solid #fecaca; background:#fef2f2; color:#991b1b; font-weight:700; font-size:0.7rem;"><i class="fas fa-times"></i></button>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <input type="range" id="slider_${str.uid}_opt" class="manual-string-length" data-uid="${str.uid}" data-mode="opt" min="${min}" max="${max}" value="${m.opts}" style="flex:1; height:6px; cursor:pointer;">
            <input type="number" id="input_${str.uid}_opt" class="manual-string-length" data-uid="${str.uid}" data-mode="opt" min="${min}" max="${max}" value="${m.opts}" style="width:60px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-weight:700;">
            <span style="font-size:0.8rem; color:#475569; white-space:nowrap; font-weight:700; min-width:60px;">${panels} panels</span>
          </div>
          <div style="display:flex; gap:3px; flex-wrap:wrap; align-items:center;">
            ${Array(Math.min(panels, 25))
              .fill(0)
              .map(() => `<div style="width:12px; height:16px; background:#3b82f6; border-radius:1px;"></div>`)
              .join("")}
            ${panels > 25 ? `<span style="margin-left:4px; color:#6b7280; font-size:0.75rem;">+${panels - 25}</span>` : ""}
          </div>
          ${m.result.errors.length > 0 ? `<div style="font-size:0.75rem; color:#991b1b; background:#fee2e2; padding:6px 8px; border-radius:4px; border-left:2px solid #dc2626;">❌ ${m.result.errors.join(" • ")}</div>` : ""}
          ${m.result.warnings.length > 0 ? `<div style="font-size:0.75rem; color:#78350f; background:#fef3c7; padding:6px 8px; border-radius:4px; border-left:2px solid #f59e0b;">⚠ ${m.result.warnings.join(" • ")}</div>` : ""}
        </div>
      `;
      return;
    }

    const pps = m.pps;
    const min = m.result.minLen;
    const max = m.result.maxLen;
    html += `
      <div style="display:flex; flex-direction:column; gap:10px; padding:14px; background:${statusBg}; border:1.5px solid ${statusBorder}; border-radius:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; color:#1e40af; font-size:0.85rem;">${label}</span>
            <span style="background:${statusBg}; color:${statusColor}; padding:2px 8px; border-radius:4px; font-weight:800; font-size:0.75rem; border:1px solid ${statusBorder};">${statusIcon}</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${invSelect}
            <button class="manual-string-remove" data-uid="${str.uid}" style="padding:4px 8px; border-radius:6px; border:1px solid #fecaca; background:#fef2f2; color:#991b1b; font-weight:700; font-size:0.7rem;"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <input type="range" id="slider_${str.uid}_str" class="manual-string-length" data-uid="${str.uid}" data-mode="str" min="${min}" max="${max}" value="${pps}" style="flex:1; height:6px; cursor:pointer;">
          <input type="number" id="input_${str.uid}_str" class="manual-string-length" data-uid="${str.uid}" data-mode="str" min="${min}" max="${max}" value="${pps}" style="width:60px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-weight:700;">
          <span style="font-size:0.8rem; color:#475569; white-space:nowrap; font-weight:700; min-width:60px;">${pps} panels</span>
        </div>
        <div style="display:flex; gap:3px; flex-wrap:wrap; align-items:center;">
          ${Array(Math.min(pps, 25))
            .fill(0)
            .map(() => `<div style="width:12px; height:16px; background:#3b82f6; border-radius:1px;"></div>`)
            .join("")}
          ${pps > 25 ? `<span style="margin-left:4px; color:#6b7280; font-size:0.75rem;">+${pps - 25}</span>` : ""}
        </div>
        ${m.result.errors.length > 0 ? `<div style="font-size:0.75rem; color:#991b1b; background:#fee2e2; padding:6px 8px; border-radius:4px; border-left:2px solid #dc2626;">❌ ${m.result.errors.join(" • ")}</div>` : ""}
        ${m.result.warnings.length > 0 ? `<div style="font-size:0.75rem; color:#78350f; background:#fef3c7; padding:6px 8px; border-radius:4px; border-left:2px solid #f59e0b;">⚠ ${m.result.warnings.join(" • ")}</div>` : ""}
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;

  const addBtn = document.getElementById("btn_add_manual_string");
  if (addBtn) {
    addBtn.onclick = () => {
      const s1Local = getStage1Snapshot();
      const invDefault = invertersToUse[0];
      const invSpecs = invDefault?.inverter?.specifications || {};
      if (currentSystemType === "optimizer") {
        const ratio = 2;
        const limits = getOptimizerLimits(invSpecs, ratio);
        manualLayoutState.strings.push({
          uid: manualLayoutSeq++,
          assignedInverterId: invDefault?.id || "default",
          assignedInverterName: invDefault?.inverter?.name || "",
          optimizerQty: limits.min,
          ratio,
          panelsPerString: limits.min * ratio,
        });
      } else {
        const result = validateManualStringEntry(1, 10, invSpecs, s1Local);
        manualLayoutState.strings.push({
          uid: manualLayoutSeq++,
          assignedInverterId: invDefault?.id || "default",
          assignedInverterName: invDefault?.inverter?.name || "",
          panelsPerString: result.minLen,
        });
      }
      rebalanceManualLayout(manualLayoutState.strings[manualLayoutState.strings.length - 1]?.uid);
      applyManualLayoutToDesign();
    };
  }

  const removeBtn = document.getElementById("btn_remove_manual_string");
  if (removeBtn) {
    removeBtn.onclick = () => {
      manualLayoutState.strings.pop();
      rebalanceManualLayout(null);
      applyManualLayoutToDesign();
    };
  }

  document.querySelectorAll(".manual-string-remove").forEach(btn => {
    btn.onclick = () => {
      const uid = parseInt(btn.getAttribute("data-uid"));
      manualLayoutState.strings = manualLayoutState.strings.filter(s => s.uid !== uid);
      rebalanceManualLayout(uid);
      applyManualLayoutToDesign();
    };
  });

  document.querySelectorAll(".manual-string-length").forEach(input => {
    input.addEventListener("input", () => {
      const uid = parseInt(input.getAttribute("data-uid"));
      const mode = input.getAttribute("data-mode");
      const val = Math.max(parseInt(input.value) || 0, 0);
      const target = manualLayoutState.strings.find(s => s.uid === uid);
      if (!target) return;

      // Sync slider and number input by ID
      const sliderId = `slider_${uid}_${mode === "opt" ? "opt" : "str"}`;
      const inputId = `input_${uid}_${mode === "opt" ? "opt" : "str"}`;
      const slider = document.getElementById(sliderId);
      const numInput = document.getElementById(inputId);

      if (slider) slider.value = val;
      if (numInput) numInput.value = val;

      // Update state based on mode
      if (mode === "opt") {
        target.optimizerQty = val;
      } else {
        target.panelsPerString = val;
      }

      rebalanceManualLayout(uid);
      applyManualLayoutToDesign();
    });
  });

  document.querySelectorAll(".manual-string-ratio").forEach(sel => {
    sel.onchange = () => {
      const uid = parseInt(sel.getAttribute("data-uid"));
      const target = manualLayoutState.strings.find(s => s.uid === uid);
      if (!target) return;
      target.ratio = parseInt(sel.value) || 2;
      rebalanceManualLayout(uid);
      applyManualLayoutToDesign();
    };
  });

  document.querySelectorAll(".manual-string-inv").forEach(sel => {
    sel.onchange = () => {
      const uid = parseInt(sel.getAttribute("data-uid"));
      const target = manualLayoutState.strings.find(s => s.uid === uid);
      if (!target) return;
      target.assignedInverterId = sel.value;
      const inv = invertersToUse.find(u => u.id.toString() === sel.value.toString());
      target.assignedInverterName = inv?.inverter?.name || "";
      rebalanceManualLayout(uid);
      applyManualLayoutToDesign();
    };
  });

  const applyBtn = document.getElementById("btn_apply_manual_design");
  if (applyBtn) {
    applyBtn.onclick = () => {
      applyManualLayoutToDesign(true);
      const nextBtn = document.getElementById("btn-next-stage3");
      if (nextBtn && nextBtn.disabled) {
        alert("Design not valid yet. Please fix errors or match panel count.");
      }
    };
  }
}

function applyManualLayoutToDesign(forceManualConfirm = false) {
  const s1 = getStage1Snapshot();
  const invertersToUse = resolveManualInverters();
  if (invertersToUse.length === 0) return;

  const optimizer = getSelectedOptimizer();
  const isOpt = currentSystemType === "optimizer";
  if (isOpt && !optimizer) return;

  let trackers = [];
  let bom = [];
  let totalDc = 0;
  let totalPanels = 0;

  (manualLayoutState?.strings || []).forEach((str, idx) => {
    const assignedInv =
      invertersToUse.find(u => u.id.toString() === str.assignedInverterId?.toString()) || invertersToUse[0];
    const vmpBase = s1.panelVmp || 41.5;
    const vocColdBase = calculateVocCold(s1);

    if (isOpt) {
      const ratio = str.ratio || 2;
      const limits = getOptimizerLimits(assignedInv?.inverter?.specifications || {}, ratio);
      const opts = Math.max(limits.min, Math.min(limits.max, parseInt(str.optimizerQty || limits.min)));
      str.optimizerQty = opts;
      const panels = opts * ratio;
      str.panelsPerString = panels;
      const strPower = panels * (s1.panelWattage || 580);
      trackers.push({
        id: idx + 1,
        formation: `1*${opts}`,
        stringQty: 1,
        panelsPerString: panels,
        optimizerQty: opts,
        type: `${ratio}:1`,
        vmpAt25: vmpBase * opts,
        vocAtCold: vocColdBase * opts,
        mismatchPct: 0,
        stringPower: strPower,
        assignedInverterId: assignedInv.id,
        assignedInverterName: assignedInv.inverter.name,
        isManual: true,
      });
      bom.push({ name: ratio === 2 ? getOptimizerNameForRatio(2) : getOptimizerNameForRatio(1), qty: opts });
      totalPanels += panels;
      totalDc += strPower;
      return;
    }

    const pps = Math.max(1, parseInt(str.panelsPerString || 1));
    const panels = pps;
    const strPower = panels * (s1.panelWattage || 580);
    trackers.push({
      id: idx + 1,
      formation: `1*${pps}`,
      stringQty: 1,
      panelsPerString: pps,
      vmpAt25: vmpBase * pps,
      vocAtCold: vocColdBase * pps,
      current: s1.panelImp || 13.5,
      stringPower: strPower,
      assignedInverterId: assignedInv.id,
      assignedInverterName: assignedInv.inverter.name,
      isManual: true,
    });
    totalPanels += panels;
    totalDc += strPower;
  });

  const finalBom = consolidateBom(bom);
  const customOption = {
    id: isOpt ? "opt_manual_visual" : "str_manual_visual",
    title: "Manual Visual Design",
    desc: "Drag-based custom layout",
    config: `${trackers.length} Manual String(s) | ${totalPanels} Panels`,
    trackers,
    bom: finalBom,
    totalDcPower: totalDc,
    stringPower: trackers.length > 0 ? totalDc / trackers.length / 1000 : 0,
    valid: true,
    warning: null,
    manualOverrideConfirmed: false,
  };

  const panelTarget = s1.panelCount || 0;
  const panelMatch = canForceManualConfirm(totalPanels, panelTarget);

  const errors = isOpt
    ? verifyManualOptimizerDesign(customOption, invertersToUse[0].inverter.specifications, s1)
    : verifyManualStringDesign(customOption, invertersToUse[0].inverter.specifications, s1);

  if (errors.length > 0 && !(forceManualConfirm && panelMatch)) {
    customOption.valid = false;
    customOption.warning = errors.join(" | ");
  }
  if (forceManualConfirm && panelMatch) {
    customOption.valid = true;
    customOption.manualOverrideConfirmed = true;
    if (errors.length > 0) {
      customOption.warning = `Manual override applied: ${errors.join(" | ")}`;
    }
  }

  multiInverterDesign.forEach(u => {
    u.manualOverride = false;
    u.manualTrackers = [];
  });
  trackers.forEach(t => {
    const unit = multiInverterDesign.find(u => u.id === t.assignedInverterId);
    if (unit) {
      unit.manualOverride = true;
      if (!unit.manualTrackers) unit.manualTrackers = [];
      unit.manualTrackers.push(t);
    }
  });

  applyDesignOption(customOption, invertersToUse[0].inverter, invertersToUse[0].qty, s1);
  renderDetailedSystemReport(
    invertersToUse.map(unit => ({
      modelName: unit.inverter.name,
      qty: unit.qty,
      trackers: trackers.filter(t => t.assignedInverterId === unit.id),
    })),
  );
  if (!isOpt) {
    const unitReports = invertersToUse.map(unit => {
      const specs = unit.inverter.specifications || {};
      const unitTrackers = trackers.filter(t => t.assignedInverterId === unit.id);
      const unitPanels = unitTrackers.reduce((s, t) => s + (t.panelsPerString || 0) * (t.stringQty || 1), 0);
      const unitDcKwp = (unitPanels * (s1.panelWattage || 0)) / 1000;
      const unitAcKw = getAcKw(specs) * (unit.qty || 1);
      return {
        unit,
        specs,
        unitDcKwp,
        unitAcKw,
        panelCount: unitPanels,
        trackers: unitTrackers,
        isManualOverride: true,
      };
    });
    renderGoodWeSystemReport(unitReports, s1, customOption);
  }
} // ============================================================
function renderVisualStringDiagram(trackers) {
  const container = document.getElementById("diagram_container");
  const section   = document.getElementById("visual_string_diagram");
  if (!container) return;

  if (manualModeEnabled) {
    if (currentSystemType === "optimizer") {
      // Unhide the section so canvas is visible, but don't overwrite canvas content
      if (section) section.classList.remove("hidden");
      return;
    }
    renderManualVisualDiagram();
    return;
  }

  if (section) section.classList.remove("hidden");

  let html = `<div style="background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:24px; display:flex; flex-direction:column; gap:16px;">`;
  trackers.forEach(t => {
    const strings = t.stringQty || (t.formation ? Number(t.formation.split("*")[0]) || 1 : 1);
    const panels  = t.panelsPerString || (t.formation ? Number(t.formation.split("*")[1]) || 0 : 0);
    for (let s = 1; s <= strings; s++) {
      const label = t.assignedInverterName
        ? `${t.assignedInverterName.split(" ")[0]}|MPPT${t.id}-S${s}`
        : `MPPT${t.id}-S${s}`;
      const badge = t.type
        ? `<span style="font-size:0.7rem; color:#ea580c; background:#fff7ed; padding:2px 6px; border-radius:4px; border:1px solid #fdba74;">${t.type}</span>`
        : "";
      html += `
        <div style="display:flex; align-items:center; gap:16px; padding:12px 16px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px;">
          <div style="min-width:180px; font-weight:600; color:#3b82f6; font-size:0.8rem;">${label} ${badge}</div>
          <div style="display:flex; gap:4px; flex:1; flex-wrap:wrap;">
            ${Array(Math.min(panels, 20))
              .fill(0)
              .map(() => `<div style="width:16px; height:24px; background:#3b82f6; border-radius:2px;"></div>`)
              .join("")}
            ${panels > 20 ? `<span style="margin-left:4px; color:#6b7280; font-size:0.8rem; align-self:center;">+${panels - 20}</span>` : ""}
            <span style="margin-left:8px; color:#6b7280; font-size:0.875rem; align-self:center;">${panels} mod.</span>
          </div>
          <div style="padding:6px 12px; background:#eff6ff; border:1px solid #3b82f6; border-radius:4px; font-size:0.75rem; color:#3b82f6; font-weight:500;">DC OUT</div>
        </div>`;
    }
  });
  html += `</div>`;
  container.innerHTML = html;
}

// ============================================================
// APPLY DESIGN OPTION + GLOBAL EXPORT
// ============================================================
function applyDesignOption(option, inverter, invCount, s1) {
  if (!window.projectData) window.projectData = {};
  const isManualConfirmed = !!option.manualOverrideConfirmed;
  const canProceedToStage3 = !!option.valid || isManualConfirmed;

  const invAcKw = getAcKw(inverter.specifications || {});
  const totalAcKw = invAcKw * invCount;
  const totalDcKwp = (s1.panelWattage * s1.panelCount) / 1000 || 0;
  const dcAcRatio = totalAcKw > 0 ? (totalDcKwp / totalAcKw).toFixed(2) : "-";

  // Global state for downstream stages
  window.projectData.strings = {
    systemType: currentSystemType,
    inverterModel: inverter.name,
    inverterCount: invCount,
    selectedConfig: option.config,
    trackers: option.trackers || [],
    isValid: option.valid,
    canProceedToStage3,
    manualOverrideConfirmed: isManualConfirmed,
    totalDcKwp,
    acCapacity: totalAcKw,
    totalAcKw,
    dcAcRatio,
    bom: option.bom || [],
    multiInverterDesign: multiInverterDesign.length > 0 ? [...multiInverterDesign] : null,
  };

  window.stage2Result = {
    systemType: currentSystemType,
    inverterModel: inverter.name,
    inverterCount: invCount,
    inverterAcKw: invAcKw,
    acCapacity: totalAcKw,
    totalAcKw,
    totalDcKwp,
    dcAcRatio,
    trackers: option.trackers || [],
    bom: option.bom || [],
    isValid: option.valid,
    canProceedToStage3,
    manualOverrideConfirmed: isManualConfirmed,
    panelCount: s1.panelCount,
    panelWattage: s1.panelWattage,
    multiInverterDesign: multiInverterDesign.length > 0 ? [...multiInverterDesign] : null,
    timestamp: Date.now(),
  };
  window.projectData.stage2 = window.stage2Result;

  updateElement("rpt_project_name", s1.projectName || "New Solar Project");
  updateElement("rpt_location", s1.address || s1.location || "Default Location");
  updateElement("rpt_temp_info", s1.tempMin !== undefined ? `${s1.tempMin}C / ${s1.tempMax}C` : "Not calculated");
  updateElement("rpt_pv_array", option.config || "-");

  if (s1.monthlyTable?.length > 0) renderMiniChart(s1.monthlyTable);
  if (option.trackers) renderVisualStringDiagram(option.trackers);

  const schemeContainer = document.getElementById("string_config_detail");
  if (schemeContainer && option.trackers) {
    schemeContainer.innerHTML = `
      <div class="inverter-report-block fade-in" style="background:#f8fafc; padding:15px; border-radius:12px; border:1px solid var(--brd); margin-bottom:20px;">
        <div style="font-weight:800; margin-bottom:12px; font-size:0.95rem; border-bottom:1px solid #e2e8f0; padding-bottom:8px; display:flex; justify-content:space-between;">
          <span><i class="fas fa-server" style="color:var(--p); margin-right:8px;"></i>${inverter.name}</span>
          <span style="background:#e0f2fe; color:#0369a1; padding:2px 10px; border-radius:20px; font-size:0.75rem;">Qty: ${invCount}</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px;">
          ${option.trackers
            .map(
              t => `
            <div style="font-size:0.8rem; color:#475569; background:white; padding:8px; border-radius:6px; border:1px solid #f1f5f9;">
              <strong style="color:#1e40af;">${t.type ? "S" + t.id : "MPPT" + t.id}#</strong>
              <span style="font-weight:700; color:#2563eb; margin-left:4px;">${t.formation}</span>
              ${t.type ? `<span style="font-size:0.65rem; color:#ea580c; margin-left:4px;">[${t.type}]</span>` : ""}
            </div>`,
            )
            .join("")}
        </div>
      </div>`;
  }

  const paramTbody = document.getElementById("rpt_param_tbody");
  if (paramTbody && option.trackers) {
    const rows = [
      { label: "Vmpp at 25C [V]", key: "vmpAt25" },
      { label: "Voc at Cold [V]", key: "vocAtCold" },
      { label: "Min. Vmpp [V]", value: getMinMpptV(inverter.specifications) },
      { label: "Max. DC Voltage [V]", value: getMaxDcV(inverter.specifications) },
    ];
    paramTbody.innerHTML = rows
      .map(
        row => `
      <tr>
        <td style="font-weight:600; color:var(--txt-2); background:#f8fafc; border-right:1px solid var(--brd); font-size:0.75rem;">${row.label}</td>
        ${option.trackers
          .map(t => {
            const val = row.key ? (t[row.key] || 0).toFixed(1) : row.value;
            const maxV = getMaxDcV(inverter.specifications);
            const warn =
              row.key === "vocAtCold" && parseFloat(val) > maxV
                ? "background:#fee2e2; color:#b91c1c; font-weight:800; border:2px solid #ef4444;"
                : "";
            return `<td style="text-align:center; color:var(--txt); font-weight:600; font-size:0.8rem; ${warn}">${val}</td>`;
          })
          .join("")}
      </tr>`,
      )
      .join("");
    document.getElementById("string_parameter_section")?.classList.remove("hidden");
  }

  updateElement("rpt_peak_dc", `${totalDcKwp.toFixed(2)} kWp`);
  updateElement("rpt_nominal_ac", `${totalAcKw.toFixed(2)} kW`);
  updateElement(
    "rpt_annual_gen",
    s1.totalAnnualEnergy ? `${Math.round(s1.totalAnnualEnergy).toLocaleString()} kWh` : "-",
  );
  updateElement("rpt_dc_ac", dcAcRatio);
  updateElement("sld_panel_count", s1.panelCount || "-");
  updateElement("sld_inv_name", inverter.name || "-");
  updateElement("sld_inv_qty", invCount ? `${invCount}` : "-");
  updateElement("string_config_summary", option.config || "Awaiting calculation...");
  updateElement("rpt_inv_model", inverter.name);
  updateElement("rpt_inv_qty", invCount);
  updateElement("rpt_inv_pv_qty", s1.panelCount);

  const statusEl = document.getElementById("design_status");
  const banner = document.getElementById("validation_banner");
  if (statusEl) {
    statusEl.innerHTML = canProceedToStage3
      ? (isManualConfirmed
        ? '<i class="fas fa-check-circle"></i> Manual Override Applied'
        : '<i class="fas fa-check-circle"></i> System Fits')
      : '<i class="fas fa-times-circle"></i> Limits Exceeded';
    statusEl.style.color = canProceedToStage3 ? "#16a34a" : "#ef4444";
    if (banner) banner.className = `info-box validation-box ${canProceedToStage3 ? "status-valid" : "status-error"}`;
  }

  const nextBtn = document.getElementById("btn-next-stage3");
  if (nextBtn) nextBtn.disabled = !canProceedToStage3;
  if (typeof setStageCompletion === "function") {
    setStageCompletion(2, !!canProceedToStage3);
  }
}

// ============================================================
// HANDLE OPTION CLICK
// ============================================================
window.handleOptionClick = function (id) {
  const options = window.currentDesignOptions;
  const ctx = window.currentInverterContext;
  if (!options || !ctx) return;
  const selected = options.find(o => o.id === id);
  if (!selected || !selected.valid) return;

  document.querySelectorAll(".design-card").forEach(el => {
    el.style.borderColor = "#e5e7eb";
    el.style.transform = "scale(1)";
    el.style.boxShadow = "none";
  });
  const card = document.getElementById(`card_${id}`);
  if (card) {
    card.style.borderColor = "#2563eb";
    card.style.transform = "scale(1.02)";
    card.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.1)";
  }

  applyDesignOption(selected, ctx.inverter, ctx.invCount, ctx.s1);

  if (manualModeEnabled && selected.trackers?.length > 0) {
    initManualLayoutFromTrackers(selected.trackers);
    renderVisualStringDiagram(selected.trackers);
  }
};

// ============================================================
// MANUAL OVERRIDE
// ============================================================

function resolveManualInverters() {
  const invSelect = document.getElementById("inverter_selector");
  const countInput = document.getElementById("inv_count");

  if (multiInverterDesign.length > 0) return multiInverterDesign;

  if (invSelect?.value) {
    try {
      const inverter = JSON.parse(invSelect.value);
      const qty = parseInt(countInput?.value) || 1;
      return [
        {
          id: "default",
          inverter,
          qty,
          assignedPanels: window.projectData?.stage1?.panelCount || 0,
          manualOverride: false,
          manualTrackers: [],
        },
      ];
    } catch {
      return [];
    }
  }

  return [];
}

function getSelectedOptimizer() {
  const optSelect = document.getElementById("optimizer_selector");
  if (!optSelect?.value) return null;
  return JSON.parse(optSelect.value);
}


function getOptimizerCatalog() {
  return window.optimizerCatalog || [];
}

function _ratioFromOptimizer(opt) {
  const ratioStr = opt?.specifications?.ratio?.toString() || "";
  const r = parseInt(ratioStr.charAt(0));
  return Number.isFinite(r) ? r : null;
}

function resolveOptimizerForRatio(ratio) {
  const catalog  = getOptimizerCatalog();
  const selected = getSelectedOptimizer();

  function parseOptRatio(opt) {
    const rawRatio = opt?.specifications?.ratio;
    if (rawRatio === undefined || rawRatio === null) return null;
    const str = rawRatio.toString();
    const n   = parseInt(str.charAt(0));
    return Number.isFinite(n) ? n : null;
  }

  if (ratio === 2) {
    if (selected && parseOptRatio(selected) === 2) return selected;

    const catalog2to1 = catalog.find(o => parseOptRatio(o) === 2);
    if (catalog2to1) return catalog2to1;

    return null;
  }

  if (selected && parseOptRatio(selected) === 1) return selected;

  const catalog1to1 = catalog.find(o => parseOptRatio(o) === 1);
  if (catalog1to1) return catalog1to1;

  return selected || null;
}

function getOptimizerNameForRatio(ratio) {
  const opt = resolveOptimizerForRatio(ratio);
  if (opt?.name) return opt.name;
  return ratio === 2 ? "S1200 Optimizer (2:1)" : "S650B Optimizer (1:1)";
}

function validateManualStringEntry(strings, panelsPerString, invSpecs, s1) {
  const errors = [];
  const warnings = [];
  const maxV = getMaxDcV(invSpecs);
  const minV = getMinMpptV(invSpecs);
  const invImax = invSpecs.imax || invSpecs.imax_string || 12.5;
  const panelImp = s1.panelImp || 13.5;

  const vocColdMod = calculateVocCold(s1);
  const vmpBase = s1.panelVmp || 41.5;
  const vmpHotMod = vmpBase * (1 + (parseFloat(s1.pmax_coeff || -0.33) / 100) * ((s1.tempMax || 45) - 25));
  const maxLen = Math.floor(maxV / vocColdMod);
  const minLen = Math.ceil(minV / vmpHotMod);
  const maxParallel = Math.floor(invImax / panelImp) || 1;

  const vocCold = vocColdMod * panelsPerString;
  const vmpHot = vmpHotMod * panelsPerString;
  const current = strings * panelImp;

  if (panelsPerString < minLen) errors.push(`Panels/string below min ${minLen}`);
  if (panelsPerString > maxLen) errors.push(`Panels/string exceeds max ${maxLen}`);
  if (vocCold > maxV) errors.push(`Voc exceeds ${maxV}V`);
  if (vmpHot < minV) errors.push(`Vmp below ${minV}V`);
  if (current > invImax) errors.push(`Current exceeds ${invImax}A`);
  if (strings > maxParallel) errors.push(`Parallel strings exceed ${maxParallel}`);

  return { ok: errors.length === 0, errors, warnings, vocCold, vmpHot, current, minLen, maxLen, maxParallel };
}

function validateManualOptimizerEntry(opts, ratio, invSpecs, optimizer, s1) {
  const errors = [];
  const warnings = [];

  if (!optimizer && !resolveOptimizerForRatio(ratio)) {
    errors.push("Select optimizer");
    return { ok: false, errors, warnings, stringPower: 0 };
  }

  const resolvedOpt = resolveOptimizerForRatio(ratio) || optimizer;
  const optSpec = resolvedOpt?.specifications || {};

  const panelPmax = s1?.panelWattage || 580;
  const panelImp = s1?.panelImp || 13.5;
  const vocColdMod = calculateVocCold(s1);
  const is1Phase = invSpecs.subcategory === "1-Phase";
  const targetVolt = is1Phase ? 350 : 750;
  const invImaxStr = invSpecs.imax_string || 15;
  const maxStrPower = invImaxStr * targetVolt;

  const invClass = invSpecs.string_class || (is1Phase ? "1-Phase" : "SE12.5K-20K");
  const optRatio = parseInt((optSpec.ratio || "1").toString().charAt(0)) || 1;

  const limits =
    ratio === 2
      ? optSpec.string_limits?.[invClass] || { min: 14, max: 30 }
      : { min: 1, max: 16 };

  const optPower = optSpec.power_rated || (ratio === 2 ? 1200 : 650);
  const optImaxIn = optSpec.imax_in || 15;
  const optVmaxIn = optSpec.vmax_in || (ratio === 2 ? 125 : 80);

  const stringPower = opts * ratio * panelPmax;

  if (ratio === 2 && optRatio !== 2) errors.push("Selected optimizer is not 2:1 capable");
  if (opts < limits.min) errors.push(`Optimizers below min ${limits.min}`);
  if (opts > limits.max) errors.push(`Optimizers exceed max ${limits.max}`);
  if (panelImp > optImaxIn) errors.push(`Panel Imp exceeds opt Imax ${optImaxIn}A`);
  if (panelPmax * ratio > optPower) errors.push(`Power exceeds opt rating ${optPower}W`);
  if (vocColdMod > optVmaxIn) errors.push(`Voc exceeds opt Vmax ${optVmaxIn}V`);
  if (stringPower > maxStrPower) errors.push(`String power exceeds ${maxStrPower.toFixed(0)}W`);

  return { ok: errors.length === 0, errors, warnings, stringPower };
}

function updateManualStringBuilder() {
  const container = document.getElementById("manual_string_builder");
  const stringCount = parseInt(document.getElementById("manual_string_count")?.value || 2);
  if (!container) return;

  const isOpt = currentSystemType === "optimizer";
  const invertersToUse = resolveManualInverters();
  const invOptions = buildInvOptions("default");

  let html =
    '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; margin-top:20px;">';
  for (let i = 1; i <= stringCount; i++) {
    html += `
      <div style="background:linear-gradient(145deg,#ffffff,#f1f5f9); padding:20px; border-radius:16px; border:1px solid #e2e8f0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:15px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:32px; height:32px; background:#3b82f6; border-radius:8px; display:flex; align-items:center; justify-content:center; color:white;"><i class="fas fa-bolt" style="font-size:0.9rem;"></i></div>
            <span style="font-weight:800; color:#1e293b; font-size:1rem;">${isOpt ? "String" : "MPPT"} ${i}</span>
          </div>
          <div id="manual_str${i}_status" style="font-size:0.65rem; font-weight:700; color:#10b981; background:#f0fdf4; padding:2px 8px; border-radius:20px; border:1px solid #dcfce7;">STANDBY</div>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:700; display:block; margin-bottom:6px;">Assign to Inverter Unit</label>
          <select id="manual_str${i}_inv_id" class="manual-string-input" data-string="${i}" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:10px; background:white; font-size:0.85rem; font-weight:600; color:#334155;">${invOptions}</select>
        </div>
        ${
          isOpt
            ? `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            <label style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:700; display:block; margin-bottom:6px;">Optimizers</label>
            <input type="number" id="manual_str${i}_opts" min="1" max="60" value="14" class="manual-string-input" data-string="${i}" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:10px; font-weight:700; color:#0f172a;" />
          </div>
          <div>
            <label style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:700; display:block; margin-bottom:6px;">Ratio</label>
            <select id="manual_str${i}_ratio" class="manual-string-input" data-string="${i}" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:10px; background:white; font-weight:700; color:#0f172a;">
              <option value="2">2:1 Ratio</option>
              <option value="1">1:1 Ratio</option>
            </select>
          </div>
        </div>
        `
            : `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            <label style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:700; display:block; margin-bottom:6px;">Parallel Strings</label>
            <input type="number" id="manual_str${i}_qty" min="1" max="10" value="1" class="manual-string-input" data-string="${i}" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:10px; font-weight:700; color:#0f172a;" />
          </div>
          <div>
            <label style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:700; display:block; margin-bottom:6px;">Panels / String</label>
            <input type="number" id="manual_str${i}_panels" min="2" max="60" value="12" class="manual-string-input" data-string="${i}" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:10px; font-weight:700; color:#0f172a;" />
          </div>
        </div>
        `
        }
        <div id="manual_str${i}_preview_box" style="padding:10px; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1;">
          <span id="manual_str${i}_preview" style="font-size:0.85rem; font-weight:700; color:#334155;">-</span>
        </div>
      </div>`;
  }
  html += "</div>";
  container.innerHTML = html;
  document.querySelectorAll(".manual-string-input").forEach(input => {
    input.addEventListener("input", updateManualPreview);
    input.addEventListener("change", updateManualPreview);
  });
  updateManualPreview();
}

function updateManualPreview() {
  const stringCount = parseInt(document.getElementById("manual_string_count")?.value || 2);
  const s1 = getStage1Snapshot();
  const invertersToUse = resolveManualInverters();
  const optimizer = getSelectedOptimizer();
  const isOpt = currentSystemType === "optimizer";

  let totalPanels = 0;
  let errorCount = 0;
  let warnCount = 0;

  for (let i = 1; i <= stringCount; i++) {
    const statusEl = document.getElementById(`manual_str${i}_status`);
    const prevBox = document.getElementById(`manual_str${i}_preview_box`);
    const prev = document.getElementById(`manual_str${i}_preview`);
    const selInvId = document.getElementById(`manual_str${i}_inv_id`)?.value;
    const assignedInv = invertersToUse.find(u => u.id.toString() === selInvId) || invertersToUse[0];
    const invSpecs = assignedInv?.inverter?.specifications || {};

    if (!assignedInv) {
      if (prev) prev.innerText = "Select inverter";
      if (statusEl) statusEl.style.color = "#991b1b";
      if (prevBox) prevBox.style.borderColor = "#fca5a5";
      errorCount++;
      continue;
    }

    if (isOpt) {
      const ratio = parseInt(document.getElementById(`manual_str${i}_ratio`)?.value || 2);
      const limits = getOptimizerLimits(invSpecs, ratio);
      const optInput = document.getElementById(`manual_str${i}_opts`);
      if (optInput) { optInput.min = limits.min; optInput.max = limits.max; }
      const opts = parseInt(optInput?.value || 14);
      const panels = opts * ratio;
      totalPanels += panels;

      const result = validateManualOptimizerEntry(opts, ratio, invSpecs, optimizer, s1);
      if (prev) {
        prev.innerHTML = `<strong>Panels: ${panels}</strong> <span style="color:#94a3b8;">(${opts} opts x ${ratio}:1)</span> | <span style="color:#64748b;">${result.stringPower.toFixed(1)}W</span>`;
      }

      if (result.errors.length > 0) {
        errorCount += result.errors.length;
        if (statusEl) statusEl.style.color = "#991b1b";
        if (prevBox) prevBox.style.borderColor = "#fca5a5";
      } else if (result.warnings.length > 0) {
        warnCount += result.warnings.length;
        if (statusEl) statusEl.style.color = "#78350f";
        if (prevBox) prevBox.style.borderColor = "#fde68a";
      } else {
        if (statusEl) statusEl.style.color = "#166534";
        if (prevBox) prevBox.style.borderColor = "#86efac";
      }
    } else {
      const strings = parseInt(document.getElementById(`manual_str${i}_qty`)?.value || 1);
      const pps = parseInt(document.getElementById(`manual_str${i}_panels`)?.value || 12);
      const panels = strings * pps;
      totalPanels += panels;

      const result = validateManualStringEntry(strings, pps, invSpecs, s1);
      if (prev) {
        prev.innerHTML = `<strong>${strings}x${pps}</strong> (${panels} panels) | <span style="color:#64748b;">Voc ${result.vocCold.toFixed(0)}V</span> | <span style="color:#64748b;">I ${result.current.toFixed(1)}A</span>`;
      }

      if (result.errors.length > 0) {
        errorCount += result.errors.length;
        if (statusEl) statusEl.style.color = "#991b1b";
        if (prevBox) prevBox.style.borderColor = "#fca5a5";
      } else if (result.warnings.length > 0) {
        warnCount += result.warnings.length;
        if (statusEl) statusEl.style.color = "#78350f";
        if (prevBox) prevBox.style.borderColor = "#fde68a";
      } else {
        if (statusEl) statusEl.style.color = "#166534";
        if (prevBox) prevBox.style.borderColor = "#86efac";
      }
    }
  }

  const valDiv = document.getElementById("manual_validation_result");
  const target = s1.panelCount || 0;
  const match = totalPanels === target;
  const statusColor = match && errorCount === 0 ? "#166534" : errorCount > 0 ? "#991b1b" : "#78350f";
  const bg = match && errorCount === 0 ? "#f0fdf4" : errorCount > 0 ? "#fef2f2" : "#fffbeb";
  const brd = match && errorCount === 0 ? "#22c55e" : errorCount > 0 ? "#ef4444" : "#f59e0b";

  if (valDiv) {
    valDiv.innerHTML = `
      <div style="padding:12px; background:${bg}; border-radius:6px; border-left:4px solid ${brd};">
        <div style="font-weight:700; color:${statusColor}; margin-bottom:4px;">${match ? "✓ Configuration Valid" : "Panel Count Mismatch"}</div>
        <div style="font-size:0.85rem; color:#475569;">Total: <strong>${totalPanels}</strong> / Target: <strong>${target}</strong>
          ${!match ? `<br><span style=\"color:#dc2626;\">${totalPanels > target ? "Reduce" : "Increase"} by ${Math.abs(totalPanels - target)} panels</span>` : ""}
          ${errorCount + warnCount > 0 ? `<br><span style=\"color:#64748b;\">${errorCount} error(s), ${warnCount} warning(s)</span>` : ""}
        </div>
      </div>`;
  }
}

function applyManualOverride() {
  const stringCount = parseInt(document.getElementById("manual_string_count")?.value || 2);
  const s1 = getStage1Snapshot();
  const invSelect = document.getElementById("inverter_selector");
  const optSelect = document.getElementById("optimizer_selector");

  if (!invSelect?.value) return alert("Please select inverter first.");
  if (currentSystemType === "optimizer" && !optSelect?.value) return alert("Please select optimizer first.");

  const invertersToUse = resolveManualInverters();
  if (invertersToUse.length === 0) return alert("Please select inverter first.");

  const optimizer = getSelectedOptimizer();
  let trackers = [],
    bom = [],
    totalDc = 0,
    totalPanels = 0;

  for (let i = 1; i <= stringCount; i++) {
    const selInvId = document.getElementById(`manual_str${i}_inv_id`)?.value;
    const assignedInv = invertersToUse.find(u => u.id.toString() === selInvId) || invertersToUse[0];

    if (currentSystemType === "optimizer") {
      const ratio = parseInt(document.getElementById(`manual_str${i}_ratio`)?.value || 2);
      const invSpecs = assignedInv?.inverter?.specifications || {};
      const limits = getOptimizerLimits(invSpecs, ratio);
      const rawOpts = parseInt(document.getElementById(`manual_str${i}_opts`)?.value || 14);
      const opts = Math.max(limits.min, Math.min(limits.max, rawOpts));
      const panels = opts * ratio;
      const strPower = panels * (s1.panelWattage || 580);
      const vocCold = calculateVocCold(s1);
      const vmpBase = s1.panelVmp || 41.5;
      trackers.push({
        id: i,
        formation: `1*${opts}`,
        stringQty: 1,
        panelsPerString: panels,
        optimizerQty: opts,
        type: `${ratio}:1`,
        vmpAt25: vmpBase * opts,
        vocAtCold: vocCold * opts,
        mismatchPct: 0,
        stringPower: strPower,
        assignedInverterId: assignedInv.id,
        assignedInverterName: assignedInv.inverter.name,
        isManual: true,
      });
      bom.push({ name: ratio === 2 ? getOptimizerNameForRatio(2) : getOptimizerNameForRatio(1), qty: opts });
      totalPanels += panels;
      totalDc += strPower;
    } else {
      const strings = parseInt(document.getElementById(`manual_str${i}_qty`)?.value || 1);
      const pps = parseInt(document.getElementById(`manual_str${i}_panels`)?.value || 12);
      const panels = strings * pps;
      const vmpBase = s1.panelVmp || 41.5;
      const vocCold = calculateVocCold(s1) * pps;
      const vmpAt25 = vmpBase * pps;
      const current = (s1.panelImp || 13.5) * strings;
      const strPower = panels * (s1.panelWattage || 580);
      trackers.push({
        id: i,
        formation: `${strings}*${pps}`,
        stringQty: strings,
        panelsPerString: pps,
        vmpAt25,
        vocAtCold,
        current,
        stringPower: strPower,
        assignedInverterId: assignedInv.id,
        assignedInverterName: assignedInv.inverter.name,
        isManual: true,
      });
      totalPanels += panels;
      totalDc += strPower;
    }
  }

  const finalBom = consolidateBom(bom);
  const customOption = {
    id: currentSystemType === "optimizer" ? "opt_manual_override" : "str_manual_override",
    title: "Manual Override Design",
    desc: "User-configured custom layout",
    config: `${stringCount} Custom ${currentSystemType === "optimizer" ? "String" : "MPPT"}(s) | ${totalPanels} Panels`,
    trackers,
    bom: finalBom,
    totalDcPower: totalDc,
    stringPower: stringCount > 0 ? totalDc / stringCount / 1000 : 0,
    valid: true,
    warning: null,
    manualOverrideConfirmed: false,
  };

  const panelTarget = s1.panelCount || 0;
  const panelMatch = canForceManualConfirm(totalPanels, panelTarget);

  const errors =
    currentSystemType === "optimizer"
      ? verifyManualOptimizerDesign(customOption, invertersToUse[0].inverter.specifications, s1)
      : verifyManualStringDesign(customOption, invertersToUse[0].inverter.specifications, s1);

  if (errors.length > 0) {
    if (panelMatch && confirm(`Design has warnings/issues:\n\n${errors.join("\n")}\n\nApply as manual override anyway?`)) {
      customOption.valid = true;
      customOption.manualOverrideConfirmed = true;
      customOption.warning = `Manual override applied: ${errors.join(" | ")}`;
    } else {
      customOption.valid = false;
      customOption.warning = errors.join(" | ");
      alert("Design has issues:\n\n" + errors.join("\n"));
      return;
    }
  }

  trackers.forEach(t => {
    const unit = multiInverterDesign.find(u => u.id === t.assignedInverterId);
    if (unit) {
      unit.manualOverride = true;
      if (!unit.manualTrackers) unit.manualTrackers = [];
      unit.manualTrackers.push(t);
    }
  });

  applyDesignOption(customOption, invertersToUse[0].inverter, invertersToUse[0].qty, s1);
  renderDetailedSystemReport(
    invertersToUse.map(unit => ({
      modelName: unit.inverter.name,
      qty: unit.qty,
      trackers: trackers.filter(t => t.assignedInverterId === unit.id),
    })),
  );
  renderVisualStringDiagram(customOption.trackers);
  alert("Custom design applied successfully!");
}

function calculateVocCold(s1) {
  const vocBase = parseFloat(s1?.panelVoc || 49.5);
  const vocCoeff = Math.abs(parseFloat(s1?.voc_coeff || -0.26) / 100);
  const tMin = parseFloat(s1?.tempMin || 10);
  return vocBase * (1 + vocCoeff * (25 - tMin));
}

function verifyManualDesign(design, invSpecs, s1) {
  const errors = [];
  const inverters =
    multiInverterDesign.length > 0
      ? multiInverterDesign
      : [{ id: "default", inverter: { specifications: invSpecs }, qty: 1 }];
  const totalMaxDc = inverters.reduce((s, u) => s + getMaxDcPow(u.inverter.specifications) * (u.qty || 1), 0);
  if (design.totalDcPower > totalMaxDc)
    errors.push(
      `Total DC (${(design.totalDcPower / 1000).toFixed(1)}kW) exceeds combined capacity (${(totalMaxDc / 1000).toFixed(1)}kW)`,
    );

  inverters.forEach((unit, idx) => {
    const specs = unit.inverter.specifications || invSpecs;
    const unitMaxDc = getMaxDcPow(specs) * unit.qty;
    const unitTrackers = design.trackers.filter(t => t.assignedInverterId === unit.id);
    const unitPower = unitTrackers.reduce((s, t) => s + t.stringPower, 0);
    if (unitPower > unitMaxDc)
      errors.push(`Unit ${idx + 1} power (${(unitPower / 1000).toFixed(2)}kW) exceeds ${unitMaxDc / 1000}kW limit!`);
    const maxStrPower = (specs.subcategory === "1-Phase" ? 5.7 : 11.25) * 1000;
    const vMax = getMaxDcV(specs);
    const vMin = specs.subcategory === "1-Phase" ? 350 : 750;
    unitTrackers.forEach(t => {
      if (t.stringPower > maxStrPower) errors.push(`String ${t.id}: Power exceeds ${maxStrPower / 1000}kW limit!`);
      if (t.vocAtCold > vMax) errors.push(`String ${t.id}: Voc (${t.vocAtCold.toFixed(0)}V) exceeds ${vMax}V!`);
      if (t.vmpAt25 < vMin * 0.85) errors.push(`String ${t.id}: Voltage too low for ${vMin}V operation`);
    });
  });

  const assigned = design.trackers.reduce((s, t) => s + t.panelsPerString, 0);
  const target = s1.panelCount || 0;
  if (assigned !== target) errors.push(`Panel Mismatch: ${assigned} assigned vs ${target} required`);
  return errors;
}

function resetToAutoDesign() {
  multiInverterDesign.forEach(u => {
    u.manualOverride = false;
    u.manualTrackers = [];
  });
  const manualSection = document.getElementById("manual_override_section");
  if (manualSection) manualSection.classList.add("hidden");
  hasAutoSelected = false;
}

// ============================================================
// REBALANCE MANUAL LAYOUT - REDISTRIBUTE PANELS
// ============================================================
function rebalanceManualLayout(modifiedUid) {
  if (!manualLayoutState || !manualLayoutState.strings) return;

  const s1 = getStage1Snapshot();
  const targetPanels = s1.panelCount || 0;
  const isOpt = currentSystemType === "optimizer";
  const invertersToUse = resolveManualInverters();
  const optimizer = getSelectedOptimizer();

  let totalPanels = 0;
  const strings = manualLayoutState.strings;

  // Calculate current total panels
  strings.forEach(str => {
    if (isOpt) {
      const ratio = str.ratio || 2;
      const opts = Math.max(1, parseInt(str.optimizerQty || 1));
      str.panelsPerString = opts * ratio;
      totalPanels += str.panelsPerString;
    } else {
      const pps = Math.max(1, parseInt(str.panelsPerString || 1));
      totalPanels += pps;
    }
  });

  const remaining = targetPanels - totalPanels;

  if (remaining === 0) {
    renderManualVisualDiagram();
    return; // Perfect fit
  }

  // Prefer keeping the user's edited string value and rebalance others.
  const otherStrings =
    modifiedUid !== null && modifiedUid !== undefined ? strings.filter(s => s.uid !== modifiedUid) : strings.slice();

  // If there are no other strings to rebalance against, allow mismatch.
  if (otherStrings.length === 0) {
    window.manualLayoutState = manualLayoutState;
    renderManualVisualDiagram();
    return;
  }

  if (remaining > 0) {
    // Need to add panels: distribute to other strings (not the modified one)
    let toAdd = remaining;
    for (let i = otherStrings.length - 1; i >= 0 && toAdd > 0; i--) {
      const str = otherStrings[i];
      if (isOpt) {
        const ratio = str.ratio || 2;
        const availableLimits = getOptimizerLimits(
          invertersToUse.find(u => u.id === str.assignedInverterId)?.inverter?.specifications || {},
          ratio,
        );
        const maxOpts = availableLimits.max;
        const canAdd = Math.max(0, (maxOpts - (str.optimizerQty || availableLimits.min)) * ratio);
        const addPanels = Math.min(toAdd, canAdd);
        if (addPanels > 0) {
          const newOpts = Math.min(maxOpts, (str.optimizerQty || availableLimits.min) + Math.ceil(addPanels / ratio));
          const actualAdd = (newOpts - (str.optimizerQty || availableLimits.min)) * ratio;
          str.optimizerQty = newOpts;
          str.panelsPerString = newOpts * ratio;
          toAdd -= actualAdd;
        }
      } else {
        const validationResult = validateManualStringEntry(
          1,
          str.panelsPerString + toAdd,
          invertersToUse.find(u => u.id === str.assignedInverterId)?.inverter?.specifications || {},
          s1,
        );
        const maxLen = validationResult.maxLen;
        const canAdd = Math.max(0, maxLen - str.panelsPerString);
        const addPanels = Math.min(toAdd, canAdd);
        if (addPanels > 0) {
          str.panelsPerString = Math.min(maxLen, str.panelsPerString + addPanels);
          toAdd -= addPanels;
        }
      }
    }
  } else if (remaining < 0) {
    // Too many panels: remove from other strings (not the modified one)
    let toRemove = Math.abs(remaining);
    for (let i = otherStrings.length - 1; i >= 0 && toRemove > 0; i--) {
      const str = otherStrings[i];
      if (isOpt) {
        const ratio = str.ratio || 2;
        const availableLimits = getOptimizerLimits(
          invertersToUse.find(u => u.id === str.assignedInverterId)?.inverter?.specifications || {},
          ratio,
        );
        const minOpts = availableLimits.min;
        const canRemove = Math.max(0, ((str.optimizerQty || minOpts) - minOpts) * ratio);
        const removePanels = Math.min(toRemove, canRemove);
        if (removePanels > 0) {
          const newOpts = Math.max(minOpts, (str.optimizerQty || minOpts) - Math.ceil(removePanels / ratio));
          const actualRemove = ((str.optimizerQty || minOpts) - newOpts) * ratio;
          str.optimizerQty = newOpts;
          str.panelsPerString = newOpts * ratio;
          toRemove -= actualRemove;
        }
      } else {
        const validationResult = validateManualStringEntry(
          1,
          1,
          invertersToUse.find(u => u.id === str.assignedInverterId)?.inverter?.specifications || {},
          s1,
        );
        const minPanels = validationResult.minLen;
        const canRemove = Math.max(0, str.panelsPerString - minPanels);
        const removePanels = Math.min(toRemove, canRemove);
        if (removePanels > 0) {
          str.panelsPerString = Math.max(minPanels, str.panelsPerString - removePanels);
          toRemove -= removePanels;
        }
      }
    }
  }

  window.manualLayoutState = manualLayoutState;
  renderManualVisualDiagram();
}

// ============================================================
// BUILD INVERTER OPTIONS
// ============================================================
function buildInvOptions(selectedId) {
  const invertersToUse = resolveManualInverters();
  return invertersToUse
    .map((item, idx) => {
      const isSelected = item.id.toString() === (selectedId || "default").toString() ? "selected" : "";
      return `<option value="${item.id}" ${isSelected}>Unit ${idx + 1}: ${item.inverter.name}</option>`;
    })
    .join("");
}

// ============================================================
// VERIFY MANUAL STRING DESIGN
// ============================================================
function verifyManualStringDesign(design, invSpecs, s1) {
  const errors = [];
  const maxV = getMaxDcV(invSpecs);
  const minV = getMinMpptV(invSpecs);

  design.trackers.forEach(t => {
    if (t.vocAtCold > maxV) {
      errors.push(`[MPPT${t.id}] Voc Cold (${t.vocAtCold.toFixed(0)}V) exceeds max ${maxV}V`);
    }
    if (t.vmpAt25 < minV) {
      errors.push(`[MPPT${t.id}] Vmp (${t.vmpAt25.toFixed(0)}V) below min ${minV}V`);
    }
    if (t.current > (invSpecs.imax || invSpecs.imax_string || 12.5)) {
      errors.push(`[MPPT${t.id}] Current (${t.current.toFixed(1)}A) exceeds limit`);
    }
  });

  const totalPanels = design.trackers.reduce((s, t) => s + t.panelsPerString * (t.stringQty || 1), 0);
  if (totalPanels !== (s1.panelCount || 0)) {
    errors.push(`Panel count mismatch: ${totalPanels} vs target ${s1.panelCount}`);
  }

  return errors;
}

// ============================================================
// VERIFY MANUAL OPTIMIZER DESIGN
// ============================================================
function verifyManualOptimizerDesign(design, invSpecs, s1) {
  const errors = [];
  const is1Phase = invSpecs.subcategory === "1-Phase";
  const targetVolt = is1Phase ? 350 : 750;
  const maxStrPower = (is1Phase ? 5.7 : 11.25) * 1000;

  design.trackers.forEach(t => {
    const strPower = t.stringPower || t.panelsPerString * (s1.panelWattage || 580);
    if (strPower > maxStrPower) {
      errors.push(
        `[S${t.id}] Power (${(strPower / 1000).toFixed(2)}kW) exceeds ${(maxStrPower / 1000).toFixed(2)}kW limit`,
      );
    }
    if (t.vocAtCold > targetVolt * 1.1) {
      errors.push(`[S${t.id}] Voltage too high for ${targetVolt}V bus`);
    }
    if (t.vocAtCold < targetVolt * 0.7) {
      errors.push(`[S${t.id}] Voltage too low for ${targetVolt}V bus`);
    }
  });

  const totalPanels = design.trackers.reduce((s, t) => s + t.panelsPerString, 0);
  if (totalPanels !== (s1.panelCount || 0)) {
    errors.push(`Panel count mismatch: ${totalPanels} vs target ${s1.panelCount}`);
  }

  return errors;
}

// ============================================================
// UTILITIES
// ============================================================
function consolidateBom(rawBom) {
  if (!rawBom) return [];
  return rawBom.reduce((acc, item) => {
    const existing = acc.find(i => i.name === item.name);
    if (existing) {
      existing.qty += item.qty;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, []);
}

function updateElement(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

// ============================================================
// EXPOSE GLOBALS
// ============================================================
window.calculateStage2 = calculateStage2;
window.refreshStage2UI = refreshStage2UI;
window.setSystemType = setSystemType;
window.updateManualStringBuilder = updateManualStringBuilder;
window.updateManualPreview = updateManualPreview;
window.applyManualOverride = applyManualOverride;
window.resetToAutoDesign = resetToAutoDesign;
window.setManualMode = setManualMode;



