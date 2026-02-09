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
    alert("Please enter Latitude and Longitude.");
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
//  UPDATED LIVE HEADER + STEP 1.3 SUMMARY FIX (In calc.js)
// ==================================================================

function updateLiveHeader() {
  // Helper to safely set text without crashing
  function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  // 1. Get Demand
  const annualDemand = getAnnualUnitsFromBills();

  // Update Top Bar
  safeSetText("header-target-energy", annualDemand > 0 ? annualDemand.toLocaleString() + " kWh" : "0 kWh");

  // --- FIX FOR STEP 1.3 SUMMARY BOX ---
  // This explicitly pushes the calculated demand to the summary card
  safeSetText("total_annual_units", annualDemand.toLocaleString() + " kWh");

  // Calculate average cost if bills exist
  if (window.bills && window.bills.length > 0) {
    const totalCost = window.bills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    const avgRate = annualDemand > 0 ? totalCost / annualDemand : 0;

    safeSetText("total_annual_cost", "₹" + totalCost.toLocaleString());
    safeSetText("avg_unit_cost", "₹" + avgRate.toFixed(2));
  }
  // ------------------------------------

  // 2. Solar Calculations
  if (window.fetchedSolarData) {
    const calcData = calculateSolarPhysics(annualDemand, window.fetchedSolarData);

    // Update Top Bar Specs
    safeSetText("header-system-size", calcData.systemSizeKwp.toFixed(2) + " kWp");
    safeSetText("header-annual-energy", calcData.totalAnnualEnergy.toFixed(0) + " kWh");

    // Update Savings Badge
    const savingsEl = document.getElementById("header-achieved-savings");
    if (savingsEl) {
      const achieved = annualDemand > 0 ? (calcData.totalAnnualEnergy / annualDemand) * 100 : 0;
      savingsEl.innerText = achieved.toFixed(1) + "%";

      if (achieved >= 100) savingsEl.style.color = "#4ade80";
      else if (achieved > 80) savingsEl.style.color = "#fbbf24";
      else savingsEl.style.color = "#f87171";
    }

    // Sync Panel Input (if not active)
    const panelInput = document.getElementById("header-panel-input");
    if (panelInput && document.activeElement !== panelInput) {
      panelInput.value = calcData.panelCount;
    }
  }
}

// Polling
setInterval(() => {
  if (window.bills && window.bills.length > 0) updateLiveHeader();
}, 2000);

// ==================================================================
//  5. GENERATION MODAL
// ==================================================================

function showGenerationModal() {
  const sidebarBtn = document.getElementById("sidebar-gen-btn");

  if (!window.fetchedSolarData) {
    alert("Please go to Stage 1.1 and fetch solar data first.");
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
      const dailySpecYield = row.specificYield / row.days;
      const plfPercent = row.plf * 100;
      rowsHTML += `<tr>
          <td><strong>${months[i]}</strong></td>
          <td>${row.days}</td>
          <td>${row.ghi.toFixed(2)}</td>
          <td>${row.ambientTemp.toFixed(1)}</td>
          <td>${row.cellTemp.toFixed(0)}</td>
          <td>${row.tempDF.toFixed(3)}</td>
          <td>${row.shadowDF.toFixed(3)}</td>
          <td>${row.otherDF.toFixed(3)}</td>
          <td><strong>${row.totalDF.toFixed(3)}</strong></td>
          <td style="background:#f0fdf4; font-weight:bold; color:#166534;">${row.energyYield.toFixed(0)}</td>
          <td>${dailySpecYield.toFixed(2)}</td>
          <td style="color:#2563eb;">${plfPercent.toFixed(1)}%</td>
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
                  <tr><th>Month</th><th>Days</th><th>GHI</th><th>T_Amb</th><th>T_Cell</th><th>Temp DF</th><th>Shadow DF</th><th>Other DF</th><th>Total DF</th><th>Yield</th><th>Spec. Yield</th><th>PLF</th></tr>
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
  coeffDecimal,
  monthlyShadowLosses,
  orientationFactor,
  otherFactor,
  solarData
) {
  const systemSizeKwp = (panelCount * wattage) / 1000;
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let totalAnnualEnergy = 0;
  const monthlyTable = [];

  for (let i = 0; i < 12; i++) {
    const ghi = solarData.monthly_data[i].solar;
    const tAmb = solarData.monthly_data[i].temp_avg;
    const currentMonthShadowLoss = monthlyShadowLosses[i] || 0;
    const monthlyShadowFactor = 1 - currentMonthShadowLoss / 100;
    const tCell = tAmb + (noct - 20);
    const tempDerating = 1 + coeffDecimal * (tCell - 25);
    const totalDerating = tempDerating * monthlyShadowFactor * orientationFactor * otherFactor;

    const yieldMonth = ghi * days[i] * systemSizeKwp * totalDerating;
    totalAnnualEnergy += yieldMonth;

    monthlyTable.push({
      month: solarData.monthly_data[i].month,
      days: days[i],
      ghi: ghi,
      ambientTemp: tAmb,
      cellTemp: tCell,
      tempDF: tempDerating,
      shadowDF: monthlyShadowFactor,
      otherDF: otherFactor * orientationFactor,
      totalDF: totalDerating,
      energyYield: yieldMonth,
      specificYield: systemSizeKwp > 0 ? yieldMonth / systemSizeKwp : 0,
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
  orientationFactor,
  otherFactor,
  solarData
) {
  if (totalAnnualUnits <= 0) return 0;

  const targetEnergy = totalAnnualUnits * (targetSavingsPercent / 100);
  const avgGhi = solarData.monthly_data.reduce((a, b) => a + b.solar, 0) / 12;
  const estTempFactor = 0.91;
  const avgShadowLoss = monthlyShadowLosses.reduce((a, b) => a + b, 0) / 12;
  const avgShadowFactor = 1 - avgShadowLoss / 100;
  const totalEstDerating = estTempFactor * avgShadowFactor * orientationFactor * otherFactor;
  const estYieldPerKw = avgGhi * 365 * totalEstDerating;

  let estimatedPanels = Math.ceil((targetEnergy / estYieldPerKw) * (1000 / wattage));
  let low = 1,
    high = Math.max(estimatedPanels * 3, 100);
  let bestPanels = estimatedPanels;
  let bestDiff = Infinity;
  const tolerance = totalAnnualUnits * 0.005;
  let iterations = 0;

  while (low <= high && iterations < 50) {
    const mid = Math.floor((low + high) / 2);
    const simulation = simulateEnergyYield(
      mid,
      wattage,
      noct,
      coeffDecimal,
      monthlyShadowLosses,
      orientationFactor,
      otherFactor,
      solarData
    );
    const diff = simulation.totalAnnualEnergy - targetEnergy;
    const absDiff = Math.abs(diff);

    if (absDiff < Math.abs(bestDiff)) {
      bestDiff = diff;
      bestPanels = mid;
    }
    if (absDiff <= tolerance) break;

    if (simulation.totalAnnualEnergy < targetEnergy) low = mid + 1;
    else high = mid - 1;
    iterations++;
  }
  return bestPanels;
}

function calculateSolarPhysics(totalAnnualUnits, solarData) {
  const getVal = (id, defaultVal) => {
    const el = document.getElementById(id);
    return el && el.value ? parseFloat(el.value) : defaultVal;
  };

  const savingsTarget = getVal("savings_target", 100);
  const wattage = getVal("panel_wattage", 550);
  const noct = getVal("panel_noct", 45);

  let coeffInput = getVal("temp_coefficient", 0.33);
  let coeffDecimal = -(Math.abs(coeffInput) / 100);

  const otherLossInput = getVal("other_losses", 18.5);
  const otherFactor = 1 - otherLossInput / 100;

  const orientationLossInput = getVal("orientation_loss", 2);
  const orientationFactor = 1 - orientationLossInput / 100;

  let monthlyShadowLosses =
    typeof getMonthlyShadowArray === "function" ? getMonthlyShadowArray() : new Array(12).fill(0);

  let panelsNeeded = window.calculatedPanelCount;

  if (!panelsNeeded || panelsNeeded === 0) {
    if (totalAnnualUnits > 0 && solarData) {
      panelsNeeded = findOptimalPanelCount(
        savingsTarget,
        totalAnnualUnits,
        wattage,
        noct,
        coeffDecimal,
        monthlyShadowLosses,
        orientationFactor,
        otherFactor,
        solarData
      );
      //  window.calculatedPanelCount = panelsNeeded;
    } else {
      panelsNeeded = 0;
    }
  }

  const finalSimulation = simulateEnergyYield(
    panelsNeeded,
    wattage,
    noct,
    coeffDecimal,
    monthlyShadowLosses,
    orientationFactor,
    otherFactor,
    solarData
  );

  const results = {
    inputs: {
      savingsTargetPercent: savingsTarget,
      panelWattage: wattage,
      panelNoct: noct,
      tempCoefficient: Math.abs(coeffInput),
      orientationLoss: orientationLossInput,
      otherLosses: otherLossInput,
      monthlyShadowLosses: monthlyShadowLosses,
    },
    system: {
      panelCount: panelsNeeded,
      systemSizeKwp: finalSimulation.systemSizeKwp,
      totalAnnualEnergy: finalSimulation.totalAnnualEnergy,
      specificYield:
        finalSimulation.systemSizeKwp > 0 ? finalSimulation.totalAnnualEnergy / finalSimulation.systemSizeKwp : 0,
      plf:
        finalSimulation.systemSizeKwp > 0
          ? finalSimulation.totalAnnualEnergy / (finalSimulation.systemSizeKwp * 24 * 365)
          : 0,
    },
    monthlyTable: finalSimulation.monthlyTable,
  };

  window.projectData = window.projectData || {};
  window.projectData.stage1_results = results;

  return { ...results.inputs, ...results.system, monthlyTable: results.monthlyTable };
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
function calculateShadowTable() {
  const tableBody = document.getElementById("shadow_table_body");
  if (!tableBody) return;

  // 1. Get the System Size (Panel Count)
  // Priority: 1. Live Header Calc  2. Saved Project Data
  let totalPanelCount = window.calculatedPanelCount || 0;

  if (totalPanelCount === 0 && window.projectData && window.projectData.stage1) {
    totalPanelCount = window.projectData.stage1.panelCount || 0;
  }

  // CRITICAL FIX: Prevent Divide-by-Zero or "100% Loss" errors on initialization.
  // If the system size is unknown (0), we assume a standard size (e.g., 20 panels)
  // so the user can enter shadow data without seeing "Infinity%" or "NaN".
  if (totalPanelCount <= 0) {
    totalPanelCount = 20;
  }

  const rows = tableBody.querySelectorAll("tr");
  let totalAnnualSum = 0;

  rows.forEach(row => {
    const inputs = row.querySelectorAll(".shadow-cell");
    let rowSumPercent = 0;
    let count = 0;

    inputs.forEach(input => {
      // Logic: User enters "Number of Shaded Panels" (e.g., 5 panels shaded)
      const shadedPanels = parseFloat(input.value) || 0;

      // Calculate Loss Fraction: Shaded / Total (e.g., 5 / 60 = 0.083)
      const hourlyLossDecimal = shadedPanels / totalPanelCount;
      rowSumPercent += hourlyLossDecimal;
      count++;
    });

    // Average loss for this month (Average of hourly losses)
    const avgDecimal = count > 0 ? rowSumPercent / count : 0;
    const displayPercent = (avgDecimal * 100).toFixed(2);

    // UI Update
    const avgCell = row.querySelector(".row-avg");
    if (avgCell) avgCell.innerText = displayPercent + "%";

    // Store data for the physics engine
    row.dataset.monthlyAvg = displayPercent;
    totalAnnualSum += parseFloat(displayPercent);
  });

  // Annual Average Display
  const annualAvg = (totalAnnualSum / 12).toFixed(2);
  const totalDisplay = document.getElementById("annual_shadow_avg");
  if (totalDisplay) totalDisplay.innerText = annualAvg + "%";
}

function getMonthlyShadowArray() {
  const tableBody = document.getElementById("shadow_table_body");
  if (!tableBody) return new Array(12).fill(0);
  const rows = tableBody.querySelectorAll("tr");
  return Array.from(rows).map(row => parseFloat(row.dataset.monthlyAvg) || 0);
}

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
  if (e.target.classList.contains("shadow-cell")) {
    calculateShadowTable();
    updateLiveHeader();
  }
});

document.addEventListener("DOMContentLoaded", function () {
  setupHeaderInputListener();
  calculateShadowTable();
  updateLiveHeader();
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
