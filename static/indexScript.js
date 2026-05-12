// ==================================================================
//  IndexScript.JS - Main Application Controller & Navigation
// ==================================================================

// 1. GLOBAL STATE VARS
window.fetchedSolarData = null;
window.siteData = {};
window.bills = window.bills || [];
window.projectData = {};
window.finalReportData = {};

// ==================================================================
//  STAGE 1 SUB-PAGE NAVIGATION WITH VALIDATION
// ==================================================================

// Enhanced Stage 1 Sub-Page Navigation with Strict Validation
window.showS1Page = function (pageNum) {
  // Get current active page
  const currentPage = getCurrentS1Page();

  // STRICT VALIDATION: Can't skip pages - must go sequentially
  if (pageNum > currentPage + 1) {
    alert(
      "Please complete the current step first."
    );
    return;
  }

  // VALIDATION FOR PAGE 1 → PAGE 2
  if (currentPage === 1 && pageNum === 2) {
    if (!validatePage1()) {
      return; // Stop navigation if validation fails
    }
  }

  // VALIDATION FOR PAGE 2 → PAGE 3
  if (currentPage === 2 && pageNum === 3) {
    if (!validatePage2()) {
      return; // Stop navigation if validation fails
    }
  }
  // VALIDATION FOR PAGE 3 → PAGE 4
  if (currentPage === 3 && pageNum === 4) {
    if (!validatePage3()) {
      return; // Stop if panel not selected
    }
  }

  // Hide all Stage 1 pages
  const p1 = document.getElementById("s1-page-1");
  const p2 = document.getElementById("s1-page-2");
  const p3 = document.getElementById("s1-page-3");
  const p4 = document.getElementById("s1-page-4");

  if (p1) {
    p1.classList.remove("active-step");
    p1.style.setProperty("display", "none", "important");
  }
  if (p2) {
    p2.classList.remove("active-step");
    p2.style.setProperty("display", "none", "important");
  }
  if (p3) {
    p3.classList.remove("active-step");
    p3.style.setProperty("display", "none", "important");
  }
  if (p4) {
    p4.classList.remove("active-step");
    p4.style.setProperty("display", "none", "important");
  }

  // Show target page
  const target = document.getElementById("s1-page-" + pageNum);
  if (target) {
    target.classList.add("active-step");
    target.style.setProperty("display", "flex", "important");
    // Force calculation when entering Shadow Page (Step 4)
    // TARGET STEP 4 (SHADOW PAGE)
    if (pageNum === 4) {
      // 1. Force Shadow Table Pre-calculation (Existing logic)
      const wattage = document.getElementById("panel_wattage")?.value;
      if (wattage && window.fetchedSolarData) {
        try {
          getStage1Data();
          if (typeof calculateShadowTable === "function") {
            calculateShadowTable();
          }
        } catch (e) {
          console.log(e);
        }
      }

      // 2. NEW: Render the Final Generation Table immediately
      if (typeof renderGenerationTable === "function") {
        setTimeout(renderGenerationTable, 100);
      }
    }
    // Map resize fix for Page 1
    if (pageNum === 1 && window.map) {
      setTimeout(() => {
        window.map.updateSize();
      }, 200);
    }
  }

  // Update sidebar sub-nav highlighting
  updateStage1SubNav(pageNum);
};

// Get current active page number
function getCurrentS1Page() {
  if (document.getElementById("s1-page-4")?.classList.contains("active-step"))
    return 4;
  if (document.getElementById("s1-page-3")?.classList.contains("active-step"))
    return 3;
  if (document.getElementById("s1-page-2")?.classList.contains("active-step"))
    return 2;
  if (document.getElementById("s1-page-1")?.classList.contains("active-step"))
    return 1;
  return 1;
}

// ==================================================================
//  VALIDATION FUNCTIONS
// ==================================================================

// VALIDATION FOR PAGE 1: Site & Structure
function validatePage1() {
  const errors = [];

  // Required: Project Name
  const projectName = document.getElementById("site_name")?.value;
  if (!projectName || projectName.trim() === "") {
    errors.push("Project Name is required");
    highlightField("site_name");
  }

  // Required: Latitude & Longitude
  const latitude = document.getElementById("latitude")?.value;
  const longitude = document.getElementById("longitude")?.value;

  if (!latitude || latitude === "" || parseFloat(latitude) === 0) {
    errors.push("Latitude is required (click on map or enter manually)");
    highlightField("latitude");
  }

  if (!longitude || longitude === "" || parseFloat(longitude) === 0) {
    errors.push("Longitude is required (click on map or enter manually)");
    highlightField("longitude");
  }

  // Required: Solar Data must be fetched
  if (!window.fetchedSolarData) {
    errors.push("Please fetch Solar Data before proceeding");
    // Highlight the fetch button
    const fetchBtn = document.getElementById("fetch-solar-btn");
    if (fetchBtn) {
      fetchBtn.style.animation = "pulse 1s ease-in-out 3";
    }
  }

  // Show errors if any
  if (errors.length > 0) {
    alert("Please complete the following:\n\n• " + errors.join("\n• "));
    return false;
  }

  if (typeof markStepAsComplete === "function") {
    markStepAsComplete(1);
  }

  clearFieldHighlights();
  return true;
}

// VALIDATION FOR PAGE 2: Electricity Bills
function validatePage2() {
  const errors = [];

  // Check if at least one bill is added
  const billsContainer = document.getElementById("bills-container");
  const billCount = billsContainer?.children.length || 0;

  if (billCount === 0) {
    errors.push("Please add at least one electricity bill");

    // Highlight the add bill button
    const addBillBtn = document.querySelector('button[onclick="addNewBill()"]');
    if (addBillBtn) {
      addBillBtn.style.animation = "pulse 1s ease-in-out 3";
      addBillBtn.style.border = "2px solid #ef4444";
    }
  }

  // Validate each bill has required data
  if (billCount > 0) {
    let hasInvalidBills = false;

    // Check if bills have units (assuming bills are stored in window.bills array)
    if (window.bills && window.bills.length > 0) {
      window.bills.forEach((bill, index) => {
        if (!bill.units || bill.units <= 0) {
          hasInvalidBills = true;
        }
      });
    }
  }

  // Show errors if any
  if (errors.length > 0) {
    alert("Please complete the following:\n\n• " + errors.join("\n• "));
    return false;
  }

  // ✅ ADD THIS
  if (typeof markStepAsComplete === "function") {
    markStepAsComplete(2);
  }

  return true;
}

// VALIDATION FOR PAGE 3: Panel Selection (before Save & Next)
function validatePage3() {
  const errors = [];

  // Required: Panel Model Selection
  const panelSelector = document.getElementById("panel_selector")?.value;
  if (!panelSelector || panelSelector === "") {
    errors.push("Please select a Panel Model from inventory");
    highlightField("panel_selector");
  }

  // Required: Panel Wattage (should be auto-filled)
  const panelWattage = document.getElementById("panel_wattage")?.value;
  if (!panelWattage || parseFloat(panelWattage) <= 0) {
    errors.push("Panel Wattage is required");
    highlightField("panel_wattage");
  }

  // Required: Savings Target
  const savingsTarget = document.getElementById("savings_target")?.value;
  if (!savingsTarget || parseFloat(savingsTarget) <= 0) {
    errors.push("Savings Target % is required");
    highlightField("savings_target");
  }

  // Validate that calculations are done
  const totalAnnualUnits =
    document.getElementById("total_annual_units")?.textContent;
  if (!totalAnnualUnits || totalAnnualUnits === "0 kWh") {
    errors.push("Annual consumption data is missing. Please check your bills.");
  }

  // Show errors if any
  if (errors.length > 0) {
    alert("Please complete the following:\n\n• " + errors.join("\n• "));
    return false;
  }

  // ✅ ADD THIS
  if (typeof markStepAsComplete === "function") {
    markStepAsComplete(3);
  }

  clearFieldHighlights();
  return true;
}

// VALIDATION FOR PAGE 4: Shadow Analysis (before final save)
function validatePage4() {
  const errors = [];

  // Check if shadow table exists
  const shadowTableBody = document.getElementById("shadow_table_body");
  if (!shadowTableBody) {
    errors.push("Shadow analysis table not found");
    return false;
  }

  // Calculate shadow data to ensure it's ready
  if (typeof calculateShadowTable === "function") {
    calculateShadowTable();
  } else {
    errors.push("Shadow calculation function missing");
  }

  // Get shadow data array
  let shadowData = [];
  if (typeof getMonthlyShadowArray === "function") {
    shadowData = getMonthlyShadowArray();

    // Verify it's an array of 12 numbers
    if (shadowData.length !== 12) {
      errors.push("Shadow data incomplete (expected 12 months)");
    }
  } else {
    errors.push("Shadow data retrieval function missing");
  }

  // Validate that solar data is still available
  if (!window.fetchedSolarData) {
    errors.push(
      "Solar data missing. Please go back to Step 1.1 and fetch solar data."
    );
  }

  // Show errors if any
  if (errors.length > 0) {
    alert("Please complete the following:\n\n• " + errors.join("\n• "));
    return false;
  }

  // ✅ ADD THIS
  if (typeof markStepAsComplete === "function") {
    markStepAsComplete(4);
  }

  clearFieldHighlights();
  return true;
}

// Highlight field with error
function highlightField(fieldId) {
  const field = document.getElementById(fieldId);
  if (field) {
    field.style.borderColor = "#ef4444";
    field.style.boxShadow = "0 0 0 3px rgba(239, 68, 68, 0.2)";
    field.focus();

    // Remove highlight after 3 seconds
    setTimeout(() => {
      field.style.borderColor = "";
      field.style.boxShadow = "";
    }, 3000);
  }
}

// Clear all field highlights
function clearFieldHighlights() {
  const allInputs = document.querySelectorAll("input, select");
  allInputs.forEach((input) => {
    input.style.borderColor = "";
    input.style.boxShadow = "";
  });
}

// Update Stage 1 Sub-Navigation Active States
function updateStage1SubNav(pageNum) {
  const subNavButtons = document.querySelectorAll(".nav-item.sub-nav");

  subNavButtons.forEach((btn, index) => {
    btn.classList.remove("active");
    if (index + 1 === pageNum) {
      btn.classList.add("active");
    }
  });
}

// ==================================================================
//  MAIN STAGE NAVIGATION
// ==================================================================

// Main Stage Navigation - Enhanced
window.switchStage = function (stageNum) {
  // If trying to go to Stage 2 or beyond, validate Stage 1 completion
  if (stageNum > 1) {
    const currentStage = getCurrentActiveStage();
    if (currentStage === 1) {
      // Validate that Stage 1 is complete
      if (!validateStage1Complete()) {
        alert(
          "Complete Stage 1 before proceeding."
        );
        return;
      }
    }
  }

  // Hide all stages first
  document.querySelectorAll(".stage-view").forEach((stage) => {
    stage.classList.remove("active");
    stage.style.setProperty("display", "none", "important");
  });

  // Show target stage
  const targetStage = document.getElementById(`stage-${stageNum}`);
  if (targetStage) {
    targetStage.classList.add("active");
    targetStage.style.setProperty("display", "flex", "important");
  } else {
    return;
  }

  // Update main navigation tabs (not sub-nav)
  document
    .querySelectorAll(".nav-item:not(.sub-nav)")
    .forEach((btn) => btn.classList.remove("active"));

  const navButtons = document.querySelectorAll(".nav-item:not(.sub-nav)");
  if (navButtons[stageNum - 1]) {
    navButtons[stageNum - 1].classList.add("active");
  }

  // Show/Hide Stage 1 sub-navigation
  const subNavButtons = document.querySelectorAll(".nav-item.sub-nav");
  if (stageNum === 1) {
    subNavButtons.forEach((btn) => (btn.style.display = "flex"));
    // Default to page 1 when entering Stage 1
    showS1Page(1);
  } else {
    subNavButtons.forEach((btn) => {
      btn.style.display = "none";
      btn.classList.remove("active");
    });
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Switch stage sections
  document
    .querySelectorAll(".stage-view")
    .forEach((sec) => sec.classList.remove("active"));
  const stageSection = document.getElementById(`stage-${stageNum}`);
  if (stageSection) stageSection.classList.add("active");

  // Stage-specific logic hooks
  if (stageNum === 2 && typeof refreshStage2UI === "function") {
    setTimeout(() => refreshStage2UI(), 100);
  }
  if (stageNum === 3 && typeof refreshStage3UI === "function") {
    setTimeout(() => refreshStage3UI(), 100);
  }
  if (stageNum === 4 && typeof refreshStage4UI === "function") {
    setTimeout(() => refreshStage4UI(), 100);
  }
  if (stageNum === 5 && typeof refreshStage5UI === "function") {
    setTimeout(() => refreshStage5UI(), 100);
  }
};

// Get current active stage
function getCurrentActiveStage() {
  for (let i = 1; i <= 5; i++) {
    const stage = document.getElementById(`stage-${i}`);
    if (stage?.classList.contains("active")) {
      return i;
    }
  }
  return 1;
}

// Validate that entire Stage 1 is complete
function validateStage1Complete() {
  if (typeof setStageCompletion === "function") {
    setStageCompletion(1, false);
  }

  if (!validatePage1()) {
    return false;
  }

  if (!validatePage2()) {
    return false;
  }

  if (!validatePage3()) {
    return false;
  }

  if (!validatePage4()) {
    return false;
  }

  if (typeof setStageCompletion === "function") {
    setStageCompletion(1, true);
  }
  return true;
}

// ==================================================================
//  STAGE COMPLETION (MAIN NAV)
// ==================================================================

function setStageCompletion(stageNum, isComplete) {
  const items = document.querySelectorAll(".nav-item:not(.sub-nav):not(.special)");
  const item = items[stageNum - 1];
  if (!item) return;

  const complete = Boolean(isComplete);
  item.classList.toggle("completed", complete);

  const existingCheck = item.querySelector(".stage-complete-check");
  if (complete && !existingCheck) {
    const check = document.createElement("i");
    check.className = "fas fa-check stage-complete-check";
    item.appendChild(check);
  }
  if (!complete && existingCheck) {
    existingCheck.remove();
  }
}

window.setStageCompletion = setStageCompletion;
window.markStageAsComplete = function (stageNum) {
  setStageCompletion(stageNum, true);
};


// ==================================================================
//  RESET ALL STAGES
// ==================================================================

window.resetAllStages = function () {
  const ok = confirm("Reset all stages and clear all inputs?");
  if (!ok) return;

  // Hard reset to fresh state so all auto-suggestions recalc from new inputs
  window.location.reload();
  return;

  // Clear global data
  window.fetchedSolarData = null;
  window.siteData = {};
  window.bills = [];
  window.billCounter = 0;
  window.projectData = {};
  window.finalReportData = {};
  window.selectedPanelSpecs = {};
  window.calculatedPanelCount = 0;
  window.stage2Result = null;
  window.multiInverterDesign = [];
  window.currentSystemType = "string";
  window.hasAutoSelected = false;
  window.stage5Subsidy = 0;

  // Clear bill UI
  const billsContainer = document.getElementById("bills-container");
  if (billsContainer) billsContainer.innerHTML = "";
  const emptyState = document.getElementById("bills-empty-state");
  if (emptyState) emptyState.style.display = "block";

  // Reset all inputs/selects/textareas in stage container
  const fields = document.querySelectorAll(".stage-container input, .stage-container select, .stage-container textarea");
  fields.forEach((el) => {
    if (el.tagName === "SELECT") {
      const opts = Array.from(el.options || []);
      const def = opts.find(o => o.defaultSelected) || opts[0];
      if (def) el.value = def.value;
    } else if (el.type === "checkbox" || el.type === "radio") {
      el.checked = el.defaultChecked || false;
    } else {
      el.value = (typeof el.defaultValue !== "undefined") ? el.defaultValue : "";
    }
  });

  // Clear Stage 1 sub-nav completion styling
  document.querySelectorAll(".sidebar-nav .nav-item.sub-nav").forEach((btn) => {
    btn.style.borderLeft = "";
    btn.style.backgroundColor = "";
    const icon = btn.querySelector("i");
    if (icon) icon.style.color = "";
    btn.querySelectorAll(".fa-check").forEach((c) => c.remove());
  });

  // Clear wizard step completion styling (if present)
  document.querySelectorAll(".wizard-steps li").forEach((li) => {
    li.style.borderLeft = "";
    li.style.backgroundColor = "";
    const icon = li.querySelector("i");
    if (icon) icon.style.color = "";
    li.querySelectorAll(".fa-check").forEach((c) => c.remove());
  });

  // Clear main stage completion styling
  document.querySelectorAll(".sidebar-nav .nav-item.completed").forEach((btn) => {
    btn.classList.remove("completed");
    btn.querySelectorAll(".stage-complete-check").forEach((c) => c.remove());
  });

  // Reset Stage 2 next button
  const nextBtn = document.getElementById("btn-next-stage3");
  if (nextBtn) nextBtn.disabled = true;

  // Reset map marker and view (if available)
  try {
    if (typeof markerSource !== "undefined" && markerSource) {
      markerSource.clear();
    }
    if (typeof map !== "undefined" && map) {
      map.getView().animate({
        center: ol.proj.fromLonLat([78.9629, 22.5937]),
        zoom: 5,
        duration: 300
      });
    }
  } catch (e) { /* no-op */ }

  // Close overlays/modals if open
  document.getElementById("final-report-options-modal")?.classList.remove("active");
  if (document.getElementById("gen-analysis-modal")) {
    document.getElementById("gen-analysis-modal").style.display = "none";
  }
  document.getElementById("solar-panel-page")?.classList.remove("active");
  document.getElementById("initial-input-page")?.classList.add("active");

  // Reset header/nav inputs
  const headerPanel = document.getElementById("header-panel-input");
  if (headerPanel) headerPanel.value = 0;
  const headerSystem = document.getElementById("header-system-size");
  if (headerSystem) headerSystem.innerText = "0 kWp";
  const headerTarget = document.getElementById("header-target-energy");
  if (headerTarget) headerTarget.innerText = "0 kWh";
  const headerAnnual = document.getElementById("header-annual-energy");
  if (headerAnnual) headerAnnual.innerText = "0 kWh";
  const headerSavings = document.getElementById("header-achieved-savings");
  if (headerSavings) headerSavings.innerText = "0%";

  // Reset computed UI
  if (typeof calculateShadowTable === "function") calculateShadowTable();
  if (typeof updateLiveHeader === "function") updateLiveHeader();
  if (typeof refreshStage5UI === "function") refreshStage5UI();
  if (typeof calcStage5 === "function") calcStage5();

  // Go back to Stage 1, Page 1
  if (typeof switchStage === "function") switchStage(1);
  if (typeof showS1Page === "function") showS1Page(1);
};

// ==================================================================
//  SAVE & PROCEED FUNCTIONS
// ==================================================================

// Save and proceed to Stage 2 - WITH VALIDATION
window.saveAndProceedToStage2 = function () {
  if (typeof calculateShadowTable === "function") calculateShadowTable();
  if (typeof updateLiveHeader === "function") updateLiveHeader();

  if (!validateStage1Complete()) {
    alert("Complete all Stage 1 steps before proceeding.");
    return;
  }

  try {
    const data = getStage1Data();

    if (!data) {
      alert("Unable to generate Stage 1 data. Check console.");
      return;
    }

    window.projectData = window.projectData || {};
    window.projectData.stage1 = data;
    window.projectData.design = data.design;
    window.projectData.site = data.site;
    window.projectData.consumption = data.consumption;
    window.projectData.parameters = data.parameters;

    if (typeof updateProjectStatsHeader === "function") {
      updateProjectStatsHeader();
    }

    const stage1 = document.getElementById("stage-1");
    if (stage1) {
      stage1.classList.remove("active");
      stage1.style.setProperty("display", "none", "important");

      for (let i = 1; i <= 4; i++) {
        const page = document.getElementById(`s1-page-${i}`);
        if (page) {
          page.classList.remove("active-step");
          page.style.setProperty("display", "none", "important");
        }
      }
    }

    if (typeof markStepAsComplete === "function") {
      markStepAsComplete(1);
      markStepAsComplete(2);
      markStepAsComplete(3);
      markStepAsComplete(4);
    }
    if (typeof setStageCompletion === "function") {
      setStageCompletion(1, true);
    }

    switchStage(2);

    setTimeout(() => {
      const stage2 = document.getElementById("stage-2");
      if (stage2 && !stage2.classList.contains("active")) {
        stage2.classList.add("active");
        stage2.style.setProperty("display", "flex", "important");
      }

      if (typeof refreshStage2UI === "function") {
        refreshStage2UI();
      }
    }, 100);

  } catch (err) {
    alert(`Stage 1 save failed: ${err.message}`);
    console.error(err);
  }
};

// Go back to input
window.goBackToInput = function () {
  document.getElementById("solar-panel-page")?.classList.remove("active");
  document.getElementById("initial-input-page")?.classList.add("active");
  switchStage(1);
};

// ==================================================================
//  REPORT GENERATION
// ==================================================================

function toNumSafe(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildNormalizedReportPayload(stage1Raw) {
  const s1 = stage1Raw || {};
  const site = s1.site || window.projectData?.site || {};
  const design = s1.design || window.projectData?.design || {};
  const params = s1.parameters || window.projectData?.parameters || {};
  const consumption = s1.consumption || window.projectData?.consumption || {};
  const perf = s1.performance || {};

  const monthlyTable =
    (Array.isArray(perf.monthlyTable) && perf.monthlyTable.length > 0 ? perf.monthlyTable : null) ||
    (Array.isArray(s1.monthlyTable) && s1.monthlyTable.length > 0 ? s1.monthlyTable : null) ||
    (Array.isArray(window.projectData?.performance?.monthlyTable) ? window.projectData.performance.monthlyTable : []);

  const totalAnnualUnits = toNumSafe(s1.totalAnnualUnits, toNumSafe(consumption.totalAnnualUnits, 0));
  const totalAnnualEnergy = toNumSafe(s1.totalAnnualEnergy, toNumSafe(design.totalAnnualEnergy, 0));
  const systemSizeKwp = toNumSafe(s1.systemSizeKwp, toNumSafe(design.systemSizeKwp, 0));
  const specificYieldAnnual = toNumSafe(
    s1.specificYieldAnnual,
    systemSizeKwp > 0 ? (totalAnnualEnergy / systemSizeKwp) : toNumSafe(design.specificYield, 0)
  );
  const plfAnnual = toNumSafe(
    s1.plfAnnual,
    systemSizeKwp > 0 ? (totalAnnualEnergy / (systemSizeKwp * 24 * 365)) : toNumSafe(design.plf, 0)
  );
  const achievedSavingsPercent = toNumSafe(
    s1.achievedSavingsPercent,
    totalAnnualUnits > 0 ? (totalAnnualEnergy / totalAnnualUnits) * 100 : 0
  );

  const monthlyShadowLosses = Array.isArray(params.monthlyShadowLosses) ? params.monthlyShadowLosses : [];
  const avgShadowLoss = monthlyShadowLosses.length > 0
    ? monthlyShadowLosses.reduce((a, b) => a + toNumSafe(b, 0), 0) / monthlyShadowLosses.length
    : 0;

  return {
    ...s1,
    siteName: s1.siteName || site.name || document.getElementById("site_name")?.value || "Solar_Project",
    designerName: s1.designerName || site.designer || document.getElementById("designer_name")?.value || "-",
    latitude: toNumSafe(s1.latitude, toNumSafe(site?.location?.lat, 0)),
    longitude: toNumSafe(s1.longitude, toNumSafe(site?.location?.lon, 0)),
    totalAnnualUnits,
    savingsTargetPercent: toNumSafe(s1.savingsTargetPercent, toNumSafe(params.savingsTargetPercent, 0)),
    panelCount: toNumSafe(s1.panelCount, toNumSafe(design.panelCount, 0)),
    panelWattage: toNumSafe(s1.panelWattage, toNumSafe(params.panelWattage, toNumSafe(design.panelWattage, 0))),
    panelNoct: toNumSafe(s1.panelNoct, toNumSafe(params.panelNoct, 45)),
    tempCoefficient: toNumSafe(s1.tempCoefficient, toNumSafe(params.tempCoefficient, 0)),
    shadowLoss: toNumSafe(s1.shadowLoss, avgShadowLoss),
    fixedDerating: toNumSafe(s1.fixedDerating, toNumSafe(params.otherLosses, 0)),
    systemSizeKwp,
    totalAnnualEnergy,
    specificYieldAnnual,
    averageDailyEnergy: toNumSafe(s1.averageDailyEnergy, totalAnnualEnergy / 365),
    plfAnnual,
    achievedSavingsPercent,
    monthlyTable,
  };
}

window.openFinalReportOptions = function () {
  const s1 = window.projectData?.stage1;
  if (!s1) {
    alert("Complete Stage 1 inputs first.");
    return;
  }

  const reportBase = buildNormalizedReportPayload(s1);
  const data = calculateFinancials(reportBase, reportBase.totalAnnualUnits, window.bills);
  const fullReport = { ...reportBase, ...data };
  window.finalReportData = fullReport;
  if (typeof finalReportData !== "undefined") {
    finalReportData = fullReport;
  }

  document.getElementById("final-report-options-modal")?.classList.add("active");
};

window.closeFinalReportOptions = function () {
  document.getElementById("final-report-options-modal")?.classList.remove("active");
};

// Generate Master Report
window.generateMasterReport = function () {
  const s1 = window.projectData?.stage1;
  if (s1) {
    const reportBase = buildNormalizedReportPayload(s1);
    const data = calculateFinancials(reportBase, reportBase.totalAnnualUnits, window.bills);
    const fullReport = { ...reportBase, ...data };
    window.finalReportData = fullReport;
    if (typeof finalReportData !== "undefined") {
      finalReportData = fullReport;
    }
    if (typeof renderFinalReport === "function") {
      renderFinalReport(fullReport);
      document.getElementById("initial-input-page")?.classList.remove("active");
      document.getElementById("solar-panel-page")?.classList.add("active");
    } else {
      alert("Report renderer not loaded.");
    }
  } else {
    alert("Complete Stage 1 inputs first.");
  }
};

// Preview Stage 1 Report - WITH VALIDATION
window.previewStage1Report = function () {
  // Validate that all pages are complete
  if (!validateStage1Complete()) {
    alert("Complete all Stage 1 steps before previewing.");
    return;
  }

  // Force calculate shadow data
  if (typeof calculateShadowTable === "function") {
    calculateShadowTable();
  }

  try {
    // Call the ACTUAL preview function from calc.js
    const data = getStage1Data(); // From calc.js

    if (!data) {
      alert("Unable to generate Stage 1 data.");
      return;
    }

    const normalized = buildNormalizedReportPayload(data);
    const fin = calculateFinancials(normalized, normalized.totalAnnualUnits, window.bills);
    const reportData = { ...normalized, ...fin };

    window.finalReportData = reportData;
    if (typeof finalReportData !== "undefined") {
      finalReportData = reportData;
    }

    // Call report renderer
    if (typeof renderFinalReport !== "function") {
      throw new Error("finance.js missing render function");
    }

    renderFinalReport(reportData);

    // Show report overlay
    document.getElementById("initial-input-page").classList.remove("active");
    document.getElementById("solar-panel-page").classList.add("active");
  } catch (err) {
    alert(`Preview failed: ${err.message}`);
  }
};

// ==================================================================
//  PANEL COUNT EDITOR FUNCTIONS
// ==================================================================

// Update header badge with current project stats
window.updateProjectStatsHeader = function () {
  if (typeof updateLiveHeader === "function") {
    updateLiveHeader();
  }
};

// Open panel count editor modal
window.openPanelCountEditor = function () {
  const stage1Data = window.projectData?.stage1;

  if (!stage1Data || !stage1Data.panelCount) {
    alert("Complete Stage 1 calculations first.");
    return;
  }

  // Set current panel count
  document.getElementById("manual-panel-count").value = stage1Data.panelCount;

  // Update preview
  updatePanelCountPreview(stage1Data.panelCount);

  // Show modal
  document.getElementById("panel-count-modal").style.display = "flex";

  // Add live preview on input change
  document
    .getElementById("manual-panel-count")
    .addEventListener("input", function () {
      updatePanelCountPreview(parseInt(this.value) || 0);
    });
};

// Close panel count editor
window.closePanelCountEditor = function () {
  document.getElementById("panel-count-modal").style.display = "none";
};

// Update live preview in modal
function updatePanelCountPreview(panelCount) {
  if (!window.fetchedSolarData || panelCount <= 0) {
    document.getElementById("preview-system-size").textContent = "0 kWp";
    document.getElementById("preview-savings-percent").textContent = "0%";
    document.getElementById("preview-annual-energy").textContent = "0 kWh";
    return;
  }

  const stage1Data = window.projectData?.stage1;
  if (!stage1Data) return;

  // Get current settings
  const wattage = stage1Data.panelWattage;
  const noct = stage1Data.panelNoct;
  const coeffDecimal = -(Math.abs(stage1Data.tempCoefficient) / 100);

  // Retrieve the Arrays/Factors saved in Stage 1 data
  const monthlyShadowLosses =
    stage1Data.monthlyShadowLosses || new Array(12).fill(0);
  const orientationLoss = stage1Data.orientationLoss || 0;
  const orientationFactor = 1 - orientationLoss / 100;
  const otherFactor = 1 - stage1Data.fixedDerating / 100;

  // Simulate with new panel count
  if (typeof simulateEnergyYield === "undefined") {
    return;
  }

  const simulation = simulateEnergyYield(
    panelCount,
    wattage,
    noct,
    coeffDecimal,
    monthlyShadowLosses,
    orientationFactor,
    otherFactor,
    window.fetchedSolarData
  );

  // Calculate savings percentage
  const totalAnnualUnits = stage1Data.totalAnnualUnits || 0;
  const targetEnergy =
    totalAnnualUnits * (stage1Data.savingsTargetPercent / 100);
  const achievedPercent =
    totalAnnualUnits > 0
      ? (simulation.totalAnnualEnergy / totalAnnualUnits) * 100
      : 0;

  // Update preview
  document.getElementById("preview-system-size").textContent =
    simulation.systemSizeKwp.toFixed(2) + " kWp";
  document.getElementById("preview-savings-percent").textContent =
    achievedPercent.toFixed(1) + "%";
  document.getElementById("preview-annual-energy").textContent =
    simulation.totalAnnualEnergy.toFixed(0) + " kWh";
  document.getElementById("preview-target-energy").textContent =
    targetEnergy.toFixed(0) + " kWh";

  // Color code based on target achievement
  const savingsEl = document.getElementById("preview-savings-percent");
  if (
    achievedPercent >= stage1Data.savingsTargetPercent * 0.95 &&
    achievedPercent <= stage1Data.savingsTargetPercent * 1.05
  ) {
    savingsEl.style.color = "#16a34a"; // Green - within 5%
  } else if (achievedPercent < stage1Data.savingsTargetPercent) {
    savingsEl.style.color = "#dc2626"; // Red - under target
  } else {
    savingsEl.style.color = "#2563eb"; // Blue - over target
  }
}

// Apply manual panel count changes
window.applyManualPanelCount = function () {
  const newPanelCount = parseInt(
    document.getElementById("manual-panel-count").value
  );

  if (!newPanelCount || newPanelCount <= 0) {
    alert("Enter a valid panel count.");
    return;
  }

  const stage1Data = window.projectData?.stage1;
  if (!stage1Data || !window.fetchedSolarData) {
    alert("Stage 1 data not found.");
    return;
  }

  // Recalculate with new panel count
  const wattage = stage1Data.panelWattage;
  const noct = stage1Data.panelNoct;
  const coeffDecimal = -(Math.abs(stage1Data.tempCoefficient) / 100);

  // Retrieve Data
  const monthlyShadowLosses =
    stage1Data.monthlyShadowLosses || new Array(12).fill(0);
  const orientationLoss = stage1Data.orientationLoss || 0;
  const orientationFactor = 1 - orientationLoss / 100;
  const otherFactor = 1 - stage1Data.fixedDerating / 100;

  if (typeof simulateEnergyYield === "undefined") {
    alert("Simulation unavailable. Reload the page.");
    return;
  }

  const simulation = simulateEnergyYield(
    newPanelCount,
    wattage,
    noct,
    coeffDecimal,
    monthlyShadowLosses,
    orientationFactor,
    otherFactor,
    window.fetchedSolarData
  );

  // Update Stage 1 data
  window.projectData.stage1.panelCount = newPanelCount;
  window.projectData.stage1.systemSizeKwp = simulation.systemSizeKwp;
  window.projectData.stage1.totalAnnualEnergy = simulation.totalAnnualEnergy;
  window.projectData.stage1.achievedSavingsPercent =
    stage1Data.totalAnnualUnits > 0
      ? (simulation.totalAnnualEnergy / stage1Data.totalAnnualUnits) * 100
      : 0;
  window.projectData.stage1.monthlyTable = simulation.monthlyTable;

  // Recalculate financials
  if (typeof calculateFinancials === "function") {
    const finData = calculateFinancials(
      window.projectData.stage1,
      stage1Data.totalAnnualUnits,
      window.bills || []
    );
    Object.assign(window.projectData.stage1, finData);
  }

  // Update header badge
  updateProjectStatsHeader();

  // Refresh current stage UI
  const currentStage = getCurrentActiveStage();
  if (currentStage === 2 && typeof refreshStage2UI === "function") {
    refreshStage2UI();
  } else if (currentStage === 3 && typeof refreshStage3UI === "function") {
    refreshStage3UI();
  } else if (currentStage === 4 && typeof refreshStage4UI === "function") {
    refreshStage4UI();
  } else if (currentStage === 5 && typeof refreshStage5UI === "function") {
    refreshStage5UI();
  }

  // Close modal
  closePanelCountEditor();

  // Show success message
  alert(
    `Panel count updated to ${newPanelCount}. System size: ${simulation.systemSizeKwp.toFixed(
      2
    )} kWp`
  );
};

// =======================================================
// ADD TO IndexScript.js - STAGE ROUTER
// =======================================================

function refreshCurrentActiveStage() {
    // 1. Identify which stage is open
    const currentStage = getCurrentActiveStage(); // Returns 1, 2, 3, 4, 5...

    console.log(`⚡ Live Update Triggered for Stage ${currentStage}`);

    // 2. Trigger Specific Refresh Logic based on Stage
    
    // STAGE 1 (Shadow/Maps)
    if (currentStage === 1) {
        if (typeof calculateShadowTable === 'function') calculateShadowTable();
    }

    // STAGE 2 (Inverters)
    else if (currentStage === 2) {
        if (typeof refreshStage2UI === 'function') {
             // Small delay to ensure physics calculation finished
             setTimeout(refreshStage2UI, 50); 
        }
    }

    // STAGE 3 (Financials - if you have it)
    else if (currentStage === 3) {
        if (typeof refreshStage3UI === 'function') refreshStage3UI();
    }

    // STAGE 4 (Proposal - if you have it)
    else if (currentStage === 4) {
        if (typeof refreshStage4UI === 'function') refreshStage4UI();
    }
}

// ==================================================================
//  DEBUG HELPER
// ==================================================================

// Debug function to check stage visibility
window.debugStages = function () {
  console.log("=== STAGE VISIBILITY DEBUG ===");
  for (let i = 1; i <= 5; i++) {
    const stage = document.getElementById(`stage-${i}`);
    if (stage) {
      const isActive = stage.classList.contains("active");
      const displayStyle = window.getComputedStyle(stage).display;
      console.log(`Stage ${i}: active=${isActive}, display=${displayStyle}`);
    } else {
      console.log(`Stage ${i}: NOT FOUND`);
    }
  }
  console.log("==============================");
};

// ==================================================================
//  INITIALIZATION
// ==================================================================

// Initialize on page load
document.addEventListener("DOMContentLoaded", function () {
  // Force hide all stages first
  document.querySelectorAll(".stage-view").forEach((stage) => {
    stage.classList.remove("active");
    stage.style.setProperty("display", "none", "important");
  });

  // Start with Stage 1, Page 1
  switchStage(1);

  // Double-check Stage 1 is visible
  setTimeout(() => {
    const stage1 = document.getElementById("stage-1");
    if (stage1 && !stage1.classList.contains("active")) {
      stage1.classList.add("active");
      stage1.style.setProperty("display", "flex", "important");
    }
    showS1Page(1);
  }, 100);

  // Ensure sub-nav is visible on load
  const subNavButtons = document.querySelectorAll(".nav-item.sub-nav");
  subNavButtons.forEach((btn) => (btn.style.display = "flex"));

  // Add pulse animation style if not exists
  if (!document.getElementById("pulse-animation-style")) {
    const style = document.createElement("style");
    style.id = "pulse-animation-style";
    style.textContent = `
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
    `;
    document.head.appendChild(style);
  }

  // Close modal on outside click
  document.addEventListener("click", function (e) {
    const modal = document.getElementById("panel-count-modal");
    if (e.target === modal) {
      closePanelCountEditor();
    }
  });
});
