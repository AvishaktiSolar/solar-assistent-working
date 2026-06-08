// ==================================================================
//  calc.js - App Controller & Physics Engine
//  Version: Final Production (Fixed 1.3 Summary & Safe Saves)
// ==================================================================

// --- 1. GLOBAL DATA STORAGE ---
window.fetchedSolarData = null;
window.finalReportData = {};
window.projectData = window.projectData || {};
window.selectedPanelSpecs = {};
window.calculatedPanelCount = 0;

// === DEBOUNCE SYSTEM FOR LIVE HEADER ===
window.headerUpdateTimer = null;
window.headerUpdateScheduled = false;
window.isProjectLoading = false;

function scheduleHeaderUpdate() {
  if (window.headerUpdateTimer) {
    clearTimeout(window.headerUpdateTimer);
  }
  window.headerUpdateScheduled = true;
  window.headerUpdateTimer = setTimeout(() => {
    window.headerUpdateScheduled = false;
    updateLiveHeader();
  }, 150);
}

// ==================================================================
//  2. PANEL SELECTION LOGIC (Stage 1.3)
// ==================================================================

async function loadPanelDropdown() {
  const select = document.getElementById("panel_selector");
  if (!select) return;

  try {
    const res = await fetch("/procurement/api/get_panels");
    if (!res.ok) throw new Error("Failed to load panels");

    const panels = await res.json();
    select.innerHTML = '<option value="">-- Select Panel Model --</option>';

    if (panels.length === 0) {
      select.innerHTML += "<option disabled>No panels in stock</option>";
      return;
    }

    panels.forEach(p => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify(p);
      opt.innerText = `${p.name} (Stock: ${p.stock})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Panel Load Error:", err);
    select.innerHTML = '<option value="">Error Loading Panels</option>';
  }
}

function selectPanelModel() {
  const select = document.getElementById("panel_selector");
  if (!select.value) return;

  const p = JSON.parse(select.value);
  const specs = p.specifications || {};

  window.selectedPanelSpecs = {
    voc: parseFloat(specs.voc) || 49.5,
    vmp: parseFloat(specs.vmp) || 41.5,
    isc: parseFloat(specs.isc) || 14.0,
    imp: parseFloat(specs.imp) || 13.5,
    tempCoeffVoc: parseFloat(specs.voc_coeff) || -0.25,
    tempCoeffVmp: parseFloat(specs.pmax_coeff) || -0.35,
    wattage: parseFloat(specs.pmax || specs.wattage) || 550,
  };

  const wInput = document.getElementById("panel_wattage");
  if (wInput) wInput.value = window.selectedPanelSpecs.wattage;

  const nInput = document.getElementById("panel_noct");
  if (nInput) nInput.value = parseFloat(specs.noct) || 45;

  let coeff = parseFloat(specs.pmax_coeff || -0.35);
  if (Math.abs(coeff) < 0.01) coeff = coeff * 100;
  const cInput = document.getElementById("temp_coefficient");
  if (cInput) cInput.value = Math.abs(coeff);

  const costPerPanel = parseFloat(p.rate) || 0;
  const capexInput = document.getElementById("capex_per_kw");
  if (window.selectedPanelSpecs.wattage > 0 && costPerPanel > 0) {
    const ratePerKW = (costPerPanel / window.selectedPanelSpecs.wattage) * 1000;
    if (capexInput) capexInput.value = ratePerKW.toFixed(2);
  } else {
    if (capexInput) capexInput.value = 0;
  }

  // UPDATE HEADER & STEP 1.3 SUMMARY
  updateLiveHeader();
}

document.addEventListener("DOMContentLoaded", loadPanelDropdown);

// ==================================================================
//  3. SOLAR DATA FETCHING (Stage 1.1)
// ==================================================================

async function getSolarData(lat, lon, tilt) {
  const response = await fetch("/get_data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude: lat, longitude: lon, tilt: tilt }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `Server error: ${response.status}`);
  }
  return response.json();
}

async function fetchSolarDataOnly() {
  const lat = parseFloat(document.getElementById("latitude").value);
  const lon = parseFloat(document.getElementById("longitude").value);
  const tilt = parseFloat(document.getElementById("tilt_angle").value);
  const btn = document.getElementById("fetch-solar-btn");
  const msgContainer = document.getElementById("solar-data-preview");

  if (!lat || !lon) {
    alert("Enter latitude and longitude.");
    return;
  }

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching...';
  btn.disabled = true;
  btn.className = "btn btn-primary btn-block btn-sm";
  msgContainer.style.display = "none";

  try {
    const data = await getSolarData(lat, lon, tilt);
    if (data.error) throw new Error(data.error);

    window.fetchedSolarData = data;

    // UPDATE UI
    updateLiveHeader();

    btn.className = "btn btn-success btn-block btn-sm";
    btn.innerHTML = '<i class="fas fa-check-double"></i> Data Fetched (Click to Update)';
    btn.disabled = false;

    markStepAsComplete(1);

    msgContainer.style.display = "block";
    msgContainer.innerHTML = `
      <div class="alert alert-success" style="margin-top: 15px; padding: 10px; border-radius: 6px; border-left: 5px solid #16a34a;">
        <i class="fas fa-satellite-dish"></i> 
        <strong>Connection Successful!</strong><br>
        Solar irradiance data loaded for coordinates: ${lat.toFixed(3)}, ${lon.toFixed(3)} | Tilt: ${tilt}°
        <br><small style="color:#15803d;">💡 <strong>Tip:</strong> You can change inputs and click the button again to update.</small>
      </div>
    `;
    if (typeof window.scheduleStage1Save === "function") window.scheduleStage1Save();
  } catch (err) {
    alert(`Error: ${err.message}`);
    msgContainer.innerHTML = `<div class="alert alert-danger" style="margin-top:10px;">Error: ${err.message}</div>`;
    msgContainer.style.display = "block";
    btn.innerHTML = '<i class="fas fa-satellite-dish"></i> Fetch Solar Data';
    btn.className = "btn btn-primary btn-block btn-sm";
    btn.disabled = false;
  }
}
window.fetchAndPreviewSolarData = fetchSolarDataOnly;

// ==================================================================
//  4. LIVE HEADER & INPUT HANDLERS (With 1.3 Fix)
// ==================================================================

function handleHeaderPanelChange(val) {
  const count = parseInt(val);
  if (!isNaN(count) && count >= 0) {
    window.calculatedPanelCount = count;
    updateLiveHeader();
    if (typeof calculateShadowTable === "function") calculateShadowTable();
    const input = document.getElementById("header-panel-input");
    if (input) {
      input.style.borderColor = "#4ade80";
      setTimeout(() => (input.style.borderColor = "rgba(255,255,255,0.3)"), 500);
    }
  }
}
window.handleHeaderPanelChange = handleHeaderPanelChange;


// ==================================================================
//  FIXED LIVE HEADER (Prevents Overwrite Glitch During Typing)
// ==================================================================

function updateLiveHeader() {
  function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  // 1. Get Demand
  const annualDemand = getAnnualUnitsFromBills();

  // Update Top Bar
  safeSetText("header-target-energy", annualDemand > 0 ? annualDemand.toLocaleString() + " kWh" : "0 kWh");
  safeSetText("total_annual_units", annualDemand.toLocaleString() + " kWh");

  if (window.bills && window.bills.length > 0) {
    const totalCost = window.bills.reduce((s, b) => s + (parseFloat(b.bill_amount) || 0), 0);
    const avgRate = annualDemand > 0 ? totalCost / annualDemand : 0;

    safeSetText("total_annual_cost", "₹" + totalCost.toLocaleString());
    safeSetText("avg_unit_cost", "₹" + avgRate.toFixed(2));
  }

  // 2. Solar Calculations
  if (window.fetchedSolarData) {
    const calcData = calculateSolarPhysics(annualDemand, window.fetchedSolarData);

    // Update Top Bar Specs
    safeSetText("header-system-size", calcData.systemSizeKwp.toFixed(2) + " kWp");
    safeSetText("header-annual-energy", calcData.totalAnnualEnergy.toFixed(2) + " kWh");

    // Update Savings Badge
    const savingsEl = document.getElementById("header-achieved-savings");
    if (savingsEl) {
      const achieved = annualDemand > 0 ? (calcData.totalAnnualEnergy / annualDemand) * 100 : 0;
      savingsEl.innerText = achieved.toFixed(2) + "%";

      if (achieved >= 100) savingsEl.style.color = "#4ade80";
      else if (achieved > 80) savingsEl.style.color = "#fbbf24";
      else savingsEl.style.color = "#f87171";
    }

    // --- ANTI-GLITCH PROTECTION BLOCK ---
    const headerPanelInput = document.getElementById("header-panel-input");
    
    // Safety check: If the user is currently focused or typing in the nav input, 
    // DO NOT let the background script alter its value or recalculate older targets.
    if (headerPanelInput && document.activeElement === headerPanelInput) {
      return; 
    }

    // Sync Panel Input only when idle
    if (headerPanelInput) {
      headerPanelInput.value = calcData.panelsNeeded;
    }
  }
}

// Keep polling safe - respect project loading flag
setInterval(() => {
  const headerPanelInput = document.getElementById("header-panel-input");
  // Only auto-update if user isn't typing AND project isn't loading AND bills exist
  if (!window.isProjectLoading && 
      document.activeElement !== headerPanelInput && 
      window.bills && window.bills.length > 0 &&
      !window.headerUpdateScheduled) {
    updateLiveHeader();
  }
}, 2000);
// ==================================================================
//  5. GENERATION MODAL
// ==================================================================

function showGenerationModal() {
  const sidebarBtn = document.getElementById("sidebar-gen-btn");

  if (!window.fetchedSolarData) {
    alert("Fetch solar data in Stage 1.1 first.");
    switchStage(1);
    return;
  }
  if (sidebarBtn) sidebarBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Computing...';

  updateLiveHeader();

  let modal = document.getElementById("gen-analysis-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "gen-analysis-modal";
    modal.className = "modal-overlay";
    modal.style.zIndex = "9999";
    document.body.appendChild(modal);
  }

  try {
    const calcData = calculateSolarPhysics(getAnnualUnitsFromBills(), window.fetchedSolarData);
    const annualDemand = getAnnualUnitsFromBills();
    const annualGeneration = calcData.totalAnnualEnergy;
    const achievedPercent = annualDemand > 0 ? (annualGeneration / annualDemand) * 100 : 0;

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let rowsHTML = "";

    calcData.monthlyTable.forEach((row, i) => {
      const plantLoadPercent = row.plf * 100;
      rowsHTML += `<tr>
          <td><strong>${months[i]}</strong></td>
          <td>${row.days}</td>
          <td>${row.ghi.toFixed(2)}</td>
          <td>${row.dayTime.toFixed(2)}</td>
          <td>${row.cellTemp.toFixed(2)}</td>
          <td>${row.tempDF.toFixed(3)}</td>
          <td>${row.shadowLossPercent.toFixed(2)}%</td>
          <td>${row.shadowDF.toFixed(3)}</td>
          <td>${row.otherDF.toFixed(3)}</td>
          <td><strong>${row.totalDF.toFixed(3)}</strong></td>
          <td style="background:#f0fdf4; font-weight:bold; color:#166534;">${row.energyYield.toFixed(0)}</td>
          <td>${row.dailySpecificYield.toFixed(2)}</td>
          <td>${row.totalDF.toFixed(2)}</td>
          <td style="color:#2563eb;">${plantLoadPercent.toFixed(1)}%</td>
        </tr>`;
    });

    modal.innerHTML = `
      <div class="modal-container" style="max-width: 1400px; width: 95%; max-height: 90vh; display:flex; flex-direction:column;">
        <div class="modal-header">
          <h3><i class="fas fa-bolt"></i> Generation & Savings Analysis</h3>
          <button class="btn-close" onclick="document.getElementById('gen-analysis-modal').style.display='none'">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="overflow-y: auto; padding: 20px;">
           <div class="mini-row" style="margin-bottom: 20px; display:flex; gap:15px;">
              <div style="background:#eff6ff; padding:15px; border-radius:8px; flex:1; text-align:center;">
                 <small style="color:#64748b;">System Size</small><br>
                 <strong style="font-size:1.2rem; color:#1e40af;">${calcData.systemSizeKwp.toFixed(2)} kWp</strong>
              </div>
              <div style="background:#f0fdf4; padding:15px; border-radius:8px; flex:1; text-align:center;">
                 <small style="color:#64748b;">Annual Generation (Yield)</small><br>
                 <strong style="font-size:1.2rem; color:#166534;">${annualGeneration.toFixed(0)} kWh</strong>
              </div>
              <div style="background:#fff7ed; padding:15px; border-radius:8px; flex:1; text-align:center; border:2px solid #fdba74;">
                 <small style="color:#9a3412;">Achieved Savings</small><br>
                 <strong style="font-size:1.4rem; color:#ea580c;">${achievedPercent.toFixed(1)}%</strong>
              </div>
           </div>
           <div class="table-responsive">
              <table class="table table-sm text-center table-bordered" style="font-size: 0.85rem;">
                <thead class="thead-light">
                  <tr><th>Month</th><th>Days</th><th>Avg Daily Solar</th><th>Day Time</th><th>Cell</th><th>Temperature</th><th>Shadow Loss</th><th>Shadow Derating</th><th>Fixed Derating</th><th>Total Derating</th><th>Energy Yield</th><th>Specific Yield</th><th>Estimated</th><th>Plant Load</th></tr>
                </thead>
                <tbody>${rowsHTML}</tbody>
              </table>
           </div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" onclick="document.getElementById('gen-analysis-modal').style.display='none'">Close</button></div>
      </div>`;

    modal.style.display = "flex";

    if (sidebarBtn) {
      sidebarBtn.classList.remove("btn-outline-primary");
      sidebarBtn.classList.add("btn-success");
      sidebarBtn.style.backgroundColor = "#22c55e";
      sidebarBtn.style.borderColor = "#22c55e";
      sidebarBtn.style.color = "white";
      sidebarBtn.innerHTML = '<i class="fas fa-check-circle"></i> Gen. Analysis';
    }

    markStepAsComplete(4);
  } catch (err) {
    alert("Error: " + err.message);
    if (sidebarBtn) sidebarBtn.innerHTML = '<i class="fas fa-bolt"></i> Gen. Analysis';
  }
}

// ==================================================================
//  6. PHYSICS ENGINE
// ==================================================================

function getAnnualUnitsFromBills() {
  if (!window.bills || window.bills.length === 0) return 0;
  return window.bills.reduce((sum, bill) => sum + (parseFloat(bill.total_annual_consumption) || 0), 0);
}

function simulateEnergyYield(
  panelCount,
  wattage,
  noct,
  coeffDecimal, // Should be passed as a positive decimal (e.g., 0.0031)
  monthlyShadowLosses, // Array of % values
  orientationLoss,     // Kept for compatibility
  otherFactor,         // Still a multiplier (e.g., 0.85)
  solarData,
) {
  const systemSizeKwp = (panelCount * wattage) / 1000;
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let totalAnnualEnergy = 0;
  const monthlyTable = [];

  for (let i = 0; i < 12; i++) {
    const monthData = solarData.monthly_data[i];
    const ghi = monthData.solar;
    const tAmb = monthData.temp_avg;
    const dayTime = tAmb;

    // Prefer API tcell input; fallback to derived estimate.
    const fallbackCellTemp = tAmb + ((noct - 20) / 0.8) * ghi;
    const tCell = Number.isFinite(monthData.tcell) ? monthData.tcell : fallbackCellTemp;

    // Formula: Temp Derating = 1 - (Coeff * (T_cell - 25))
    const tempDerating = 1 - (Math.abs(coeffDecimal) * (tCell - 25));

    // Use Stage 3 total site loss if available, else monthly shadow.
    const stageSiteLoss = Number.isFinite(window.totalSiteLossPercent) ? window.totalSiteLossPercent : null;
    const currentMonthShadowPercent = stageSiteLoss !== null ? stageSiteLoss : (monthlyShadowLosses[i] || 0);
    const shadowDF = 1 - (currentMonthShadowPercent / 100);

    // Total DF = Temp DF � Derating1(Shadow) � Derating2(System)
    const totalDerating = tempDerating * shadowDF * otherFactor;

    // Monthly Yield = GHI * Days * Capacity * Total DF
    const yieldMonth = ghi * days[i] * systemSizeKwp * totalDerating;
    totalAnnualEnergy += yieldMonth;

    monthlyTable.push({
      month: monthData.month,
      days: days[i],
      ghi: ghi,
      ambientTemp: tAmb,
      dayTime: dayTime,
      cellTemp: tCell,
      tempDF: tempDerating,
      shadowLossPercent: currentMonthShadowPercent,
      shadowDF: shadowDF,
      otherDF: otherFactor,
      totalDF: totalDerating,
      energyYield: yieldMonth,
      specificYield: systemSizeKwp > 0 ? yieldMonth / systemSizeKwp : 0,
      dailySpecificYield: systemSizeKwp > 0 ? (yieldMonth / systemSizeKwp) / days[i] : 0,
      plf: systemSizeKwp > 0 ? yieldMonth / (systemSizeKwp * 24 * days[i]) : 0,
    });
  }
  return { totalAnnualEnergy, systemSizeKwp, monthlyTable };
}

function findOptimalPanelCount(
  targetSavingsPercent,
  totalAnnualUnits,
  wattage,
  noct,
  coeffDecimal,
  monthlyShadowLosses,
  orientationLoss,     // Now passed as % (e.g., 2.5)
  otherFactor,
  solarData
) {
  if (totalAnnualUnits <= 0 || !solarData) return 0;

  const targetEnergy = totalAnnualUnits * (targetSavingsPercent / 100);
  
  // Use a 1-panel simulation to find the "Yield per Panel" accurately
  const singlePanelSim = simulateEnergyYield(
    1,
    wattage,
    noct,
    coeffDecimal,
    monthlyShadowLosses,
    orientationLoss,     // Pass as raw %
    otherFactor,
    solarData
  );
  const yieldPerPanel = singlePanelSim.totalAnnualEnergy;

  // Direct calculation: Total Target / Yield per single panel
  return yieldPerPanel > 0 ? Math.ceil(targetEnergy / yieldPerPanel) : 0;
}

function calculateSolarPhysics(totalAnnualUnits, solarData) {
  const getVal = (id, defaultVal) => {
    const el = document.getElementById(id);
    return el && el.value ? parseFloat(el.value) : defaultVal;
  };

  // 1. Get real-time values from the UI
  const wattage = getVal("panel_wattage", window.selectedPanelSpecs?.wattage || 580);
  const noct = getVal("panel_noct", window.selectedPanelSpecs?.noct || 45);
  
  // 2. Dynamic Coefficient Conversion
  // If user enters 0.31, we convert to 0.0031 for the formula
  let rawCoeff = getVal("temp_coefficient", 0.31);
  let coeffDecimal = rawCoeff > 0.1 ? rawCoeff / 100 : rawCoeff;

  // 3. Loss Factor inter-relation
  const otherLossPercent = getVal("other_losses", 14.15);
  const otherFactor = 1 - (otherLossPercent / 100);

  // Get the raw percentage for orientation loss
  const orientationLossPercent = (typeof getAverageOrientationLoss === "function")
    ? getAverageOrientationLoss()
    : getVal("orientation_loss", 0);

  // 4. Panel Count Selection Logic
  // Prioritize Manual Input -> then Saved Data -> then Optimization
  let panelsNeeded = window.calculatedPanelCount || 
                    (window.projectData?.stage1?.panelCount) || 
                    0;

  const savingsTarget = getVal("savings_target", 100);
  if (panelsNeeded === 0 && totalAnnualUnits > 0) {
    panelsNeeded = findOptimalPanelCount(
      savingsTarget,
      totalAnnualUnits,
      wattage,
      noct,
      coeffDecimal,
      getMonthlyShadowArray(),
      orientationLossPercent, // Pass as raw %
      otherFactor,
      solarData
    );
  }

  let monthlyShadowLosses =
    typeof getMonthlyShadowArray === "function" ? getMonthlyShadowArray() : new Array(12).fill(0);

  // 5. Final Execution with new additive loss logic
  const simulation = simulateEnergyYield(
    panelsNeeded,
    wattage,
    noct,
    coeffDecimal,
    monthlyShadowLosses,
    orientationLossPercent, // Pass as raw %
    otherFactor,
    solarData,
  );

  // 6. Structure Results for Storage
  const results = {
    inputs: {
      savingsTargetPercent: savingsTarget,
      panelWattage: wattage,
      panelNoct: noct,
      tempCoefficient: Math.abs(rawCoeff),
      orientationLoss: orientationLossPercent,
      otherLosses: otherLossPercent,
      monthlyShadowLosses: monthlyShadowLosses,
    },
    system: {
      panelCount: panelsNeeded,
      systemSizeKwp: simulation.systemSizeKwp,
      totalAnnualEnergy: simulation.totalAnnualEnergy,
      specificYield: simulation.systemSizeKwp > 0 ? simulation.totalAnnualEnergy / simulation.systemSizeKwp : 0,
      plf: simulation.systemSizeKwp > 0 ? simulation.totalAnnualEnergy / (simulation.systemSizeKwp * 24 * 365) : 0,
    },
    monthlyTable: simulation.monthlyTable,
  };

  // 7. CRITICAL BRIDGE: Push Electrical Specs to Stage 1 Object for Inverter Sizing
  // Stage 2 requires these variables to validate strings and optimizers.
  window.projectData = window.projectData || {};
  window.projectData.stage1_results = results;
  
  window.projectData.stage1 = {
    ...window.projectData.stage1,
    // Yield Data
    panelWattage: wattage,
    systemSizeKwp: simulation.systemSizeKwp,
    panelCount: panelsNeeded,
    totalAnnualEnergy: simulation.totalAnnualEnergy,
    monthlyTable: simulation.monthlyTable,
    
    // Electrical Specs (Added for Stage 2 Support)
    panelVoc: window.selectedPanelSpecs?.voc || 49.5,
    panelVmp: window.selectedPanelSpecs?.vmp || 41.5,
    panelImp: window.selectedPanelSpecs?.imp || 13.5,
    voc_coeff: window.selectedPanelSpecs?.tempCoeffVoc || -0.26,
    pmax_coeff: coeffDecimal * 100, // Normalized for percentage use
    
    // Environment Data (Needed for Max Voltage checks)
    tempMin: getVal("temp_min", 10), 
    tempMax: getVal("temp_max", 45)
  };

  return { 
    ...simulation, 
    panelCount: panelsNeeded,
    panelsNeeded, 
    achievedSavings: totalAnnualUnits > 0 ? (simulation.totalAnnualEnergy / totalAnnualUnits) * 100 : 0 
  };
}

// ==================================================================
//  7. DATA AGGREGATION & REPORTING (Required for Save)
// ==================================================================

function getStage1Data() {
  if (!window.fetchedSolarData) throw new Error("Please fetch Solar Data first.");

  const totalAnnualUnits = getAnnualUnitsFromBills();

  const techData = calculateSolarPhysics(totalAnnualUnits, window.fetchedSolarData);

  const getStr = (id, def) => {
    const el = document.getElementById(id);
    return el ? el.value : def;
  };
  const getNum = (id, def) => {
    const el = document.getElementById(id);
    return el && el.value ? parseFloat(el.value) : def;
  };

  const physicsResults = window.projectData.stage1_results || {};

  const globalData = {
    site: {
      name: getStr("site_name", ""),
      designer: getStr("designer_name", ""),
      type: getStr("project_type", "Residential"),
      structure: getStr("structure_type", "RCC"),
      terrace: getStr("terrace_type", "Flat"),
      location: {
        lat: getNum("latitude", 0),
        lon: getNum("longitude", 0),
        floors: getNum("num_floors", 1),
      },
    },
    consumption: {
      totalAnnualUnits: totalAnnualUnits,
      bills: window.bills || [],
    },
    design: physicsResults.system || {},
    parameters: physicsResults.inputs || {},
    performance: {
      monthlyTable: physicsResults.monthlyTable || [],
    },
  };

  window.projectData = { ...window.projectData, ...globalData };
  window.finalReportData = globalData;

  return globalData;
}

function previewStage1Report() {
  try {
    const data = getStage1Data();
    window.finalReportData = data;
    if (typeof renderFinalReport !== "function") {
      console.warn("finance.js missing render function. Check imports.");
      return;
    }
    renderFinalReport(data);
    const inputPage = document.getElementById("initial-input-page");
    const reportPage = document.getElementById("solar-panel-page");
    if (inputPage && reportPage) {
      inputPage.classList.remove("active");
      reportPage.classList.add("active");
    }
  } catch (err) {
    alert(err.message);
  }
}

// Shadow Utils
// Stage 3 shadow losses: calculateShadowTable()/getMonthlyShadowArray()
// feed monthlyShadowLosses used by calculateSolarPhysics().
function getShadowScenarioBodies() {
  const bodies = document.querySelectorAll(".shadow-table-body");
  if (bodies && bodies.length > 0) return bodies;
  const legacy = document.getElementById("shadow_table_body");
  return legacy ? [legacy] : [];
}

function updateShadowScenarioLabels() {
  const scenarios = document.querySelectorAll(".shadow-scenario");
  scenarios.forEach((scenario, idx) => {
    scenario.dataset.scenario = String(idx + 1);
    const title = scenario.querySelector(".shadow-scenario-title");
    if (title) title.innerText = `System ${idx + 1}`;
    const removeBtn = scenario.querySelector(".shadow-scenario-remove");
    if (removeBtn) removeBtn.style.display = scenarios.length > 1 ? "inline-flex" : "none";
  });
  updateScenarioPanelInputMode();
}

function getEffectiveTotalPanelCount() {
  let totalPanelCount = window.calculatedPanelCount || 0;
  if (totalPanelCount === 0 && window.projectData && window.projectData.stage1) {
    totalPanelCount = window.projectData.stage1.panelCount || 0;
  }
  if (totalPanelCount <= 0) totalPanelCount = 20;
  return totalPanelCount;
}

function distributePanelCountAcrossScenarios(totalPanelCount, forceRebalance = false) {
  const scenarios = Array.from(document.querySelectorAll(".shadow-scenario"));
  const scenarioCount = scenarios.length;
  if (scenarioCount === 0) return;

  if (scenarioCount === 1) {
    const onlyInput = scenarios[0].querySelector(".system-panel-input");
    if (onlyInput) onlyInput.value = String(totalPanelCount);
    return;
  }

  let currentSum = 0;
  const inputs = scenarios.map((s) => s.querySelector(".system-panel-input")).filter(Boolean);
  inputs.forEach((input) => {
    currentSum += Math.max(0, parseInt(input.value, 10) || 0);
  });

  if (!forceRebalance && currentSum > 0) return;

  const base = Math.floor(totalPanelCount / scenarioCount);
  let rem = totalPanelCount - base * scenarioCount;
  inputs.forEach((input) => {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem--;
    input.value = String(base + extra);
  });
}

function updateScenarioPanelInputMode(forceRebalance = false) {
  const scenarios = Array.from(document.querySelectorAll(".shadow-scenario"));
  const totalPanelCount = getEffectiveTotalPanelCount();
  distributePanelCountAcrossScenarios(totalPanelCount, forceRebalance);

  scenarios.forEach((scenario) => {
    const input = scenario.querySelector(".system-panel-input");
    if (!input) return;
    const singleMode = scenarios.length === 1;
    input.readOnly = singleMode;
    input.style.opacity = singleMode ? "0.85" : "1";
    input.style.pointerEvents = singleMode ? "none" : "auto";
  });
}

function toggleShadowScenario(btn) {
  const scenario = btn && btn.closest ? btn.closest(".shadow-scenario") : null;
  if (!scenario) return;
  const collapsed = scenario.classList.toggle("is-collapsed");
  if (collapsed) {
    btn.innerHTML = '<i class="fas fa-chevron-down"></i> Expand';
  } else {
    btn.innerHTML = '<i class="fas fa-chevron-up"></i> Collapse';
  }
}

function updateTiltAngleReference() {
  const tiltEl = document.getElementById("tilt_angle");
  const tiltRefEl = document.getElementById("stage3_tilt_reference");
  if (tiltEl && tiltRefEl) {
    const tiltValue = parseFloat(tiltEl.value) || 0;
    tiltRefEl.innerText = tiltValue.toFixed(1) + "°";
  }
}

// Orientation loss calculation (now uses analytical formula instead of lookup table)

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getStageTiltAngle() {
  const tiltEl = document.getElementById("tilt_angle");
  const tilt = tiltEl && tiltEl.value ? parseFloat(tiltEl.value) : 0;
  return clampNumber(Math.abs(tilt || 0), 0, 90);
}

function getOrientationOutputPercent(tiltDeg, azimuthDeg) {
  // Get latitude from input
  const latEl = document.getElementById("latitude");
  const latitude = latEl && latEl.value ? parseFloat(latEl.value) : 0;
  
  const tilt = clampNumber(tiltDeg, 0, 90);
  let az = azimuthDeg;
  if (!Number.isFinite(az)) az = 180;
  az = ((az % 360) + 360) % 360;
  
  // Calculate optimum tilt
  const optimumTilt = Math.abs(latitude);
  
  // Calculate tilt error
  const tiltError = Math.abs(tilt - optimumTilt);
  
  // Calculate azimuth error (180° = South)
  let azimuthError = Math.abs(az - 180);
  if (azimuthError > 180) {
    azimuthError = 360 - azimuthError;
  }
  
  // Convert latitude to radians for cos calculation
  const latRad = latitude * (Math.PI / 180);
  
  // Calculate combined angular error
  const angularError = Math.sqrt(
    Math.pow(tiltError, 2) + 
    Math.pow(azimuthError * Math.cos(latRad), 2)
  );
  
  // Calculate orientation loss
  let lossPercent = 0;
  if (tiltError <= 2 && azimuthError <= 5) {
    lossPercent = 0;
  } else {
    lossPercent = Math.min(0.02 * Math.pow(angularError, 2), 100);
  }
  
  // Efficiency = 100 - Loss
  const efficiency = 100 - lossPercent;
  return efficiency;
}

function getAverageOrientationLoss() {
  const scenarios = document.querySelectorAll(".shadow-scenario");
  if (!scenarios || scenarios.length === 0) return 2;
  const tilt = getStageTiltAngle();
  let sum = 0;
  let count = 0;

  scenarios.forEach((scenario) => {
    const azEl = scenario.querySelector(".azimuth-input");
    const az = azEl && azEl.value ? parseFloat(azEl.value) : 180;
    const output = getOrientationOutputPercent(tilt, az);
    const loss = clampNumber(100 - output, 0, 100);

    const outEl = scenario.querySelector(".orientation-loss-output strong");
    if (outEl) outEl.innerText = loss.toFixed(2) + "%";

    sum += loss;
    count++;
  });

  return count > 0 ? sum / count : 2;
}

function getScenarioOrientationLoss(scenario) {
  if (!scenario) return 2;
  const tilt = getStageTiltAngle();
  const azEl = scenario.querySelector(".azimuth-input");
  const az = azEl && azEl.value ? parseFloat(azEl.value) : 180;
  const output = getOrientationOutputPercent(tilt, az);
  return clampNumber(100 - output, 0, 100);
}

function addShadowScenario() {
  const container = document.getElementById("shadow_scenarios");
  const template = document.getElementById("shadow_scenario_template");
  if (!container || !template || !template.content) return;
  const clone = template.content.cloneNode(true);
  container.appendChild(clone);
  updateShadowScenarioLabels();
  updateScenarioPanelInputMode(true);
  calculateShadowTable();
  attachShadowInputValidation();
}

function removeShadowScenario(btn) {
  const scenario = btn && btn.closest ? btn.closest(".shadow-scenario") : null;
  const container = document.getElementById("shadow_scenarios");
  if (!scenario || !container) return;
  const scenarios = container.querySelectorAll(".shadow-scenario");
  if (scenarios.length <= 1) return;
  scenario.remove();
  updateShadowScenarioLabels();
  updateScenarioPanelInputMode(true);
  calculateShadowTable();
}

window.addShadowScenario = addShadowScenario;
window.removeShadowScenario = removeShadowScenario;
window.toggleShadowScenario = toggleShadowScenario;
// Stage 3 shadow losses: calculateShadowTable()/getMonthlyShadowArray()\r\n// feed monthlyShadowLosses used by calculateSolarPhysics().
function calculateShadowTable() {
  const bodies = getShadowScenarioBodies();
  if (!bodies || bodies.length === 0) return;

  const totalPanelCount = getEffectiveTotalPanelCount();
  updateScenarioPanelInputMode();
  const singleSystemMode = bodies.length === 1;

  const combinedMonthlySums = new Array(12).fill(0);
  let weightedPanelsInUse = 0;
  const systemTotalSiteLosses = [];

  bodies.forEach(body => {
    const scenario = body.closest(".shadow-scenario");
    const panelInput = scenario ? scenario.querySelector(".system-panel-input") : null;
    const scenarioPanelsRaw = panelInput ? parseInt(panelInput.value, 10) || 0 : totalPanelCount;
    const scenarioPanels = Math.max(0, scenarioPanelsRaw);
    const panelDenominator = singleSystemMode ? totalPanelCount : scenarioPanels;

    const rows = body.querySelectorAll("tr");
    let totalAnnualSum = 0;

    rows.forEach((row, idx) => {
      const inputs = row.querySelectorAll(".shadow-cell");
      let rowSumPercent = 0;
      let count = 0;

      inputs.forEach(input => {
        // Logic: User enters "Number of Shaded Panels" (e.g., 5 panels shaded)
        const shadedPanels = parseFloat(input.value) || 0;

        // Single system: divide by total panels.
        // Multi-system: divide by assigned panels for that system only.
        const hourlyLossDecimal = panelDenominator > 0 ? (shadedPanels / panelDenominator) : 0;
        rowSumPercent += hourlyLossDecimal;
        count++;
      });

      // Average loss for this month (Average of hourly losses)
      const avgDecimal = count > 0 ? rowSumPercent / count : 0;
      const displayPercent = avgDecimal * 100; // Store as number, not string

      // UI Update
      const avgCell = row.querySelector(".row-avg");
      if (avgCell) avgCell.innerText = displayPercent.toFixed(2) + "%";

      // Store data for the physics engine (as numeric percentage)
      row.dataset.monthlyAvg = displayPercent;
      totalAnnualSum += displayPercent;
      if (idx < combinedMonthlySums.length) {
        combinedMonthlySums[idx] += displayPercent * scenarioPanels;
      }
    });

    weightedPanelsInUse += scenarioPanels;

    // Annual Average Display (per System)
    const annualAvg = (totalAnnualSum / 12).toFixed(2);
    const totalDisplay = scenario
      ? scenario.querySelector(".annual-shadow-avg")
      : document.getElementById("annual_shadow_avg");
    if (totalDisplay) totalDisplay.innerText = annualAvg + "%";

    const headerAvg = scenario ? scenario.querySelector(".system-avg-shadow strong") : null;
    if (headerAvg) headerAvg.innerText = annualAvg + "%";

    const scenarioShadowLoss = parseFloat(annualAvg) || 0;
    const scenarioOrientationLoss = getScenarioOrientationLoss(scenario);
    const scenarioShadowDF = 1 - (scenarioShadowLoss / 100);
    const scenarioOrientationDF = 1 - (scenarioOrientationLoss / 100);
    const scenarioFixedDF = 1 - (7 / 100);
    const scenarioSiteDF = scenarioShadowDF * scenarioOrientationDF * scenarioFixedDF;
    const scenarioTotalSiteLoss = (1 - scenarioSiteDF) * 100;
    systemTotalSiteLosses.push(scenarioTotalSiteLoss);

    if (scenario) {
      const shadowText = scenario.querySelector(".system-shadow-loss-text");
      const orientationText = scenario.querySelector(".system-orientation-loss-text");
      const fixedText = scenario.querySelector(".system-fixed-loss-text");
      const totalText = scenario.querySelector(".system-total-loss-text");
      if (shadowText) shadowText.innerText = `Shadow ${scenarioShadowLoss.toFixed(2)}%`;
      if (orientationText) orientationText.innerText = `Orientation ${scenarioOrientationLoss.toFixed(2)}%`;
      if (fixedText) fixedText.innerText = "Fixed 7.00%";
      if (totalText) totalText.innerText = `Total ${scenarioTotalSiteLoss.toFixed(2)}%`;
    }
  });

  const denominatorPanels = weightedPanelsInUse > 0 ? weightedPanelsInUse : totalPanelCount;
  const combinedMonthly = combinedMonthlySums.map(v => (denominatorPanels > 0 ? v / denominatorPanels : 0));
  window.shadowMonthlyAverage = combinedMonthly;

  const combinedAnnualAvg = combinedMonthly.reduce((sum, v) => sum + v, 0) / 12;
  const combinedDisplay = document.getElementById("combined_shadow_avg");
  if (combinedDisplay) combinedDisplay.innerText = combinedAnnualAvg.toFixed(2) + "%";
  
  const orientationAvg = getAverageOrientationLoss();
  const orientationDisplay = document.getElementById("combined_orientation_avg");
  if (orientationDisplay) orientationDisplay.innerText = orientationAvg.toFixed(2) + "%";
  
  // NEW: Calculate Total Site Loss using Multiplicative Derating Factors
  // Site DF = (1 - Shadow%) × (1 - Orientation%) × (1 - 7%)
  const totalSiteLossPercent = systemTotalSiteLosses.length > 0
    ? (systemTotalSiteLosses.reduce((sum, v) => sum + v, 0) / systemTotalSiteLosses.length)
    : ((1 - ((1 - (combinedAnnualAvg / 100)) * (1 - (orientationAvg / 100)) * (1 - (7 / 100)))) * 100);
  const siteDFTotal = 1 - (totalSiteLossPercent / 100);
  const totalSiteLossDisplay = document.getElementById("combined_total_site_loss");
  if (totalSiteLossDisplay) {
    totalSiteLossDisplay.innerText = totalSiteLossPercent.toFixed(2) + "%";
  }
  
  // Store for reference
  window.totalSiteLossPercent = totalSiteLossPercent;
  window.totalSiteDF = siteDFTotal;

  const panelBalanceDisplay = document.getElementById("shadow_panel_balance");
  if (panelBalanceDisplay) {
    panelBalanceDisplay.innerText = `${weightedPanelsInUse} / ${totalPanelCount}`;
    panelBalanceDisplay.style.color = weightedPanelsInUse === totalPanelCount ? "#15803d" : "#b45309";
  }
  const panelBalanceNote = document.getElementById("shadow_panel_balance_note");
  if (panelBalanceNote) {
    if (bodies.length === 1) {
      panelBalanceNote.innerText = "Single system uses full panel count";
    } else if (weightedPanelsInUse === totalPanelCount) {
      panelBalanceNote.innerText = "Allocation balanced across systems";
    } else {
      panelBalanceNote.innerText = "Adjust system panel inputs to match total panel count";
    }
  }
  
}

function getMonthlyShadowArray() {
  return Array.isArray(window.shadowMonthlyAverage) && window.shadowMonthlyAverage.length === 12
    ? window.shadowMonthlyAverage
    : new Array(12).fill(0);
}

// ===================================================================
// SHADOW INPUT VALIDATION (Stage 3 Constraint Based on Stage 2)
// ===================================================================
// Get Stage 2 system type: returns "optimizer" or "string"
function getStage2SystemType() {
  return window.currentSystemType || "string";
}

// Check if Stage 2 has been configured with an inverter
function isStage2ConfiguredWithInverter() {
  const inverterSelector = document.getElementById("inverter_selector");
  if (inverterSelector && inverterSelector.value) return true;
  return window.projectData?.stage2?.inverterModel ? true : false;
}

// Update the shadow input constraint badge based on Stage 2 settings
function updateShadowInputConstraintBadge() {
  const badge = document.getElementById("shadow-input-mode-badge");
  const badgeText = document.getElementById("shadow-input-mode-text");
  const constraintNote = document.getElementById("shadow-constraint-text");
  
  if (!badge || !badgeText) return;
  
  const systemType = getStage2SystemType();
  const isConfigured = isStage2ConfiguredWithInverter();
  
  if (!isConfigured) {
    // Stage 2 not configured yet
    badge.style.background = "#e0e7ff";
    badge.style.color = "#3730a3";
    badgeText.innerHTML = '<i class="fas fa-info-circle" style="margin-right: 6px;"></i><span>Input values: All integers (no decimals)</span>';
    if (constraintNote) {
      constraintNote.innerHTML = '<i class="fas fa-clock"></i> Configure Stage 2 Inverter to apply additional constraints';
    }
  } else if (systemType === "optimizer") {
    // SolarEdge with Optimizer: all integers (same as GoodWe)
    badge.style.background = "#dcfce7";
    badge.style.color = "#15803d";
    badgeText.innerHTML = '<i class="fas fa-microchip" style="margin-right: 6px;"></i><span>SolarEdge Optimizer: All integers allowed</span>';
    if (constraintNote) {
      constraintNote.innerHTML = '<i class="fas fa-check-circle"></i> SolarEdge Optimizer: Any whole number allowed (0, 1, 2, 3...)';
    }
  } else {
    // GoodWe String Inverter: All integers
    badge.style.background = "#fef3c7";
    badge.style.color = "#92400e";
    badgeText.innerHTML = '<i class="fas fa-wave-square" style="margin-right: 6px;"></i><span>GoodWe String: All integers allowed</span>';
    if (constraintNote) {
      constraintNote.innerHTML = '<i class="fas fa-check-circle"></i> GoodWe String Inverter: Any whole number allowed (0, 1, 2, 3...)';
    }
  }
}

// Validate and correct shadow cell input based on Stage 2 settings
function validateShadowCellInput(input) {
  if (!input || input.tagName !== "INPUT") return;
  
  let value = input.value;
  if (value === "" || value === null) return;
  
  // Parse as number and remove decimals
  let numValue = parseInt(value, 10);
  if (isNaN(numValue)) numValue = 0;
  if (numValue < 0) numValue = 0;

  const scenarios = document.querySelectorAll(".shadow-scenario");
  const singleSystemMode = !scenarios || scenarios.length <= 1;
  const totalPanelCount = getEffectiveTotalPanelCount();
  const scenario = input.closest(".shadow-scenario");
  const panelInput = scenario ? scenario.querySelector(".system-panel-input") : null;
  const assignedPanels = panelInput ? Math.max(0, parseInt(panelInput.value, 10) || 0) : totalPanelCount;
  
  const maxAllowed = singleSystemMode ? totalPanelCount : assignedPanels;
  
  // Set HTML max attribute dynamically
  input.max = String(maxAllowed);

  // Strictly clamp integer
  if (numValue > maxAllowed) numValue = maxAllowed;
  
  input.value = String(numValue);
}

// Setup input event listeners for all shadow cells
function attachShadowInputValidation() {
  const shadowCells = document.querySelectorAll(".shadow-cell");
  
  shadowCells.forEach(input => {
    if (input.dataset.shadowValidationBound === "1") return;
    input.dataset.shadowValidationBound = "1";

    // Apply color on initial load if cell has value
    if (input.value && parseInt(input.value) > 0) {
      input.style.backgroundColor = "#d1fae5";
      input.style.fontWeight = "600";
    }
    
    input.addEventListener("input", function(e) {
      validateShadowCellInput(this);
      // Change color based on whether cell has value
      if (this.value && parseInt(this.value) > 0) {
        this.style.backgroundColor = "#d1fae5";
        this.style.fontWeight = "600";
      } else {
        this.style.backgroundColor = "";
        this.style.fontWeight = "";
      }
      // Trigger shadow table recalculation
      if (typeof calculateShadowTable === "function") {
        setTimeout(() => calculateShadowTable(), 50);
      }
    });
    
    input.addEventListener("change", function(e) {
      validateShadowCellInput(this);
      // Change color based on whether cell has value
      if (this.value && parseInt(this.value) > 0) {
        this.style.backgroundColor = "#d1fae5";
        this.style.fontWeight = "600";
      } else {
        this.style.backgroundColor = "";
        this.style.fontWeight = "";
      }
      if (typeof calculateShadowTable === "function") {
        calculateShadowTable();
      }
    });
    
    input.addEventListener("blur", function(e) {
      validateShadowCellInput(this);
      // Change color based on whether cell has value
      if (this.value && parseInt(this.value) > 0) {
        this.style.backgroundColor = "#d1fae5";
        this.style.fontWeight = "600";
      } else {
        this.style.backgroundColor = "";
        this.style.fontWeight = "";
      }
      if (typeof calculateShadowTable === "function") {
        calculateShadowTable();
      }
    });
    
    // Prevent manual decimal entry
    input.addEventListener("keypress", function(e) {
      // Allow only digits and control keys
      if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Escape', 'Enter'].includes(e.key)) {
        e.preventDefault();
      }
    });
  });
}

// Initialize shadow validation when page loads
function initShadowValidation() {
  updateShadowInputConstraintBadge();
  attachShadowInputValidation();
}

// Export functions for external use
window.updateShadowInputConstraintBadge = updateShadowInputConstraintBadge;
window.getStage2SystemType = getStage2SystemType;
window.isStage2ConfiguredWithInverter = isStage2ConfiguredWithInverter;
window.validateShadowCellInput = validateShadowCellInput;
window.initShadowValidation = initShadowValidation;

// --- HELPER TO COLOR WIZARD STEPS GREEN ---
function markStepAsComplete(stepNumber) {
  const items = document.querySelectorAll(".wizard-steps li, .sidebar-nav .nav-item.sub-nav");
  if (items.length >= stepNumber) {
    const item = items[stepNumber - 1];
    if (item) {
      item.style.borderLeft = "4px solid #22c55e";
      item.style.backgroundColor = "#f0fdf4";
      const icon = item.querySelector("i");
      if (icon) icon.style.color = "#16a34a";
      if (!item.querySelector(".fa-check")) {
        const check = document.createElement("i");
        check.className = "fas fa-check";
        check.style.color = "#16a34a";
        check.style.marginLeft = "auto";
        check.style.fontSize = "0.8rem";
        item.appendChild(check);
      }
    }
  }
}

// Event Listeners
document.addEventListener("input", function (e) {
  if (e.target.classList.contains("shadow-cell") || 
      e.target.classList.contains("azimuth-input") || 
      e.target.classList.contains("system-panel-input")) {
    
    if (e.target.classList.contains("shadow-cell")) validateShadowCellInput(e.target);
    if (e.target.classList.contains("system-panel-input") && typeof attachShadowInputValidation === "function") {
      attachShadowInputValidation();
    }
    calculateShadowTable();
    if (window.fetchedSolarData) {
      calculateSolarPhysics(getAnnualUnitsFromBills(), window.fetchedSolarData);
    }
    updateLiveHeader();
    const modal = document.getElementById("gen-analysis-modal");
    if (modal && modal.style.display === "flex") showGenerationModal();
  }
});

// Handle Enter key navigation for shadow cells
document.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && e.target.classList.contains("shadow-cell")) {
    e.preventDefault();
    const row = e.target.closest("tr");
    const inputs = Array.from(row.querySelectorAll(".shadow-cell"));
    const currentIndex = inputs.indexOf(e.target);
    
    if (currentIndex < inputs.length - 1) {
      // Move to next cell in the same row
      inputs[currentIndex + 1].focus();
      inputs[currentIndex + 1].select();
    } else {
      // Move to first cell in next row
      const nextRow = row.nextElementSibling;
      if (nextRow) {
        const nextInputs = nextRow.querySelectorAll(".shadow-cell");
        if (nextInputs.length > 0) {
          nextInputs[0].focus();
          nextInputs[0].select();
        }
      }
    }
  }
});

document.addEventListener("DOMContentLoaded", function () {
  setupHeaderInputListener();
  updateShadowScenarioLabels();
  calculateShadowTable();
  updateLiveHeader();
  updateTiltAngleReference();
  
  // Initialize shadow input validation with Stage 2 constraints
  if (typeof initShadowValidation === "function") {
    initShadowValidation();
  }
  
  // Setup tilt angle reference update listener
  const tiltInput = document.getElementById("tilt_angle");
  if (tiltInput) {
    tiltInput.addEventListener("input", updateTiltAngleReference);
    tiltInput.addEventListener("change", updateTiltAngleReference);
  }
});

// =======================================================
// UPDATE IN calc.js - REAL-TIME HEADER SYNC
// =======================================================

function setupHeaderInputListener() {
  const headerInput = document.getElementById("header-panel-input");

  if (headerInput) {
    headerInput.removeAttribute("readonly");
    headerInput.style.cursor = "text";
    headerInput.style.backgroundColor = "rgba(255, 255, 255, 0.1)";

    // Use 'input' event for instant typing response
    headerInput.addEventListener("input", function (e) {
      const newCount = parseInt(e.target.value);

      if (newCount > 0) {
        // 1. Update Global Counter
        window.calculatedPanelCount = newCount;

        // 2. Force Recalculate Physics & Update Global Data Immediately
        // This replaces the need for "Save & Next"
        propagateLiveUpdates(newCount);

        // 3. Visual Feedback
        e.target.style.borderColor = "#4ade80";
      }
    });
  }
}

// NEW FUNCTION: Handles the "Brain" of the instant update
function propagateLiveUpdates(panelCount) {
  // A. Re-Run Physics Engine
  // Ensure we have consumption data
  const totalUnits = typeof getAnnualUnitsFromBills === "function" ? getAnnualUnitsFromBills() : 0;

  // Check if solar data exists
  if (!window.fetchedSolarData) return;

  // Run Calculation
  const techData = calculateSolarPhysics(totalUnits, window.fetchedSolarData);

  // B. Save to Global State IMMEDIATELY
  window.projectData = window.projectData || {};

  // Update Stage 1 Data
  window.projectData.stage1 = {
    ...window.projectData.stage1,
    ...techData,
    panelCount: panelCount,
    systemSizeKwp: techData.systemSizeKwp,
    totalAnnualEnergy: techData.totalAnnualEnergy,
  };

  // Update Shortcuts (for Stage 2, 3, etc.)
  window.projectData.design = window.projectData.design || {};
  window.projectData.design.panelCount = panelCount;
  window.projectData.design.systemSizeKwp = techData.systemSizeKwp;
  window.projectData.design.totalAnnualEnergy = techData.totalAnnualEnergy;

  // C. Update Top Bar Text
  if (typeof updateLiveHeader === "function") updateLiveHeader();

  // D. Refresh The Currently Visible Stage
  if (typeof refreshCurrentActiveStage === "function") {
    refreshCurrentActiveStage();
  }
}

    // const scenarios = document.querySelectorAll(".shadow-scenario");
    // const singleSystemMode = !scenarios || scenarios.length <= 1;
    // const totalPanelCount = getEffectiveTotalPanelCount();
    // const scenario = input.closest(".shadow-scenario");
    // const panelInput = scenario ? scenario.querySelector(".system-panel-input") : null;
    // const assignedPanels = panelInput ? Math.max(0, parseInt(panelInput.value, 10) || 0) : totalPanelCount;
    // input.max = String(singleSystemMode ? totalPanelCount : assignedPanels);

