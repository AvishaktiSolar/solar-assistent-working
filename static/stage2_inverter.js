// ==================================================================
//  stage2.js - Enhanced String & Inverter Sizing Engine
// ==================================================================

let currentSystemType = "string";
let hasAutoSelected = false;

document.addEventListener("DOMContentLoaded", () => {
  loadInverters();
  loadOptimizers();

  // 1. Existing Listener for Inverter Count
  const invCountInput = document.getElementById("inv_count");
  if (invCountInput) {
    invCountInput.addEventListener("change", () => {
      hasAutoSelected = true; 
      calculateStage2();
    });
  }

  // 2. NEW: Listener for "Recalculate Design" Button
  const recalcBtn = document.getElementById("btn_recalc"); // This ID must match HTML
  if (recalcBtn) {
      recalcBtn.addEventListener("click", () => {
          console.log("🔄 Manual Recalculation Triggered");
          // Force re-check of auto-select logic
          hasAutoSelected = false; 
          calculateStage2();
      });
  } else {
      console.error("❌ Button id='btn_recalc' not found in HTML");
  }
});
function refreshStage2UI() {
    const globalData = window.projectData || {};
    const s1Root = globalData.stage1 || {};
    
    // 1. Data Adapter: Merge Design (Live) + Parameters + Root
    const s1 = { 
        ...s1Root, 
        ...(globalData.design || s1Root.design || {}),
        ...(globalData.parameters || s1Root.parameters || {}) 
    };

    if (s1.systemSizeKwp) {
        // 2. Update UI Header Stats
        const size = s1.systemSizeKwp || 0;
        const count = s1.panelCount || 0;
        const watt = s1.panelWattage || 0;

        const capEl = document.getElementById("stg2_dc_capacity");
        if (capEl) capEl.innerText = `${size.toFixed(2)} kWp`;

        const infoEl = document.getElementById("stg2_panel_info");
        if (infoEl) infoEl.innerText = `${count} Panels (${watt}Wp)`;
        hasAutoSelected = false;
        setTimeout(calculateStage2, 500);
        
    } else {
        console.warn("Stage 1 data not found. Cannot perform auto-selection.");
    }
}
// --- 1. DATA LOADING ---
async function loadInverters() {
  try {
    const res = await fetch("/procurement/api/get_inverters");
    const items = await res.json();
    populateSelect("inverter_selector", items);
  } catch (e) {
    console.error("Error loading inverters", e);
    // ⚡ UPDATED: Fallback must match actual JSON structure
    populateSelect("inverter_selector", [
      {
        name: "SolarEdge 10kW (SE10K)",
        subcategory: "3-Phase", // ⚡ ADD THIS
        specifications: {
          maxAC: 10000,
          max_dc_voltage: 900,
          min_mppt_voltage: 750,
        },
      },
      {
        name: "Goodwe 10kW (GW10K-SDT-30)",
        subcategory: "3-Phase", // ⚡ ADD THIS
        specifications: {
          maxAC: 10000,
          max_dc_voltage: 1000,
          min_mppt_voltage: 160,
        },
      },
    ]);
  }
}

async function loadOptimizers() {
  try {
    const res = await fetch("/procurement/api/get_optimizers");
    const items = await res.json();
    populateSelect("optimizer_selector", items);
  } catch (e) {
    console.error("Error loading optimizers", e);
    // Fallback for testing
    populateSelect("optimizer_selector", [
      {
        name: "SolarEdge P401 (1:1)",
        specifications: { ratio: "1:1", max: 25, min: 8 },
      },
      {
        name: "SolarEdge P950 (2:1)",
        specifications: { ratio: "2:1", max: 30, min: 14 },
      },
    ]);
  }
}

function populateSelect(id, items) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select --</option>';
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = JSON.stringify(item);
    opt.innerText = item.name;
    sel.appendChild(opt);
  });
}

// --- 2. INTELLIGENT AUTO-SELECTION (IMPROVED) ---
function autoSelectAndSizeInverter(dcCapacityKw, systemType) {
    // ⚡ LOCK: If the user has already manually selected or overridden, stop auto-selection
    if (hasAutoSelected) return;

    const sel = document.getElementById("inverter_selector");
    const countInput = document.getElementById("inv_count");
    
    // ⚡ PHASE DEPENDENCY: Pull the site phase from Stage 1
    const globalData = window.projectData || {};
    const requiredPhase = globalData.stage1?.phase || "3-Phase";

    let bestMatchIndex = 0;
    let minScore = Infinity;
    let bestCount = 1;

    for (let i = 1; i < sel.options.length; i++) {
        const inv = JSON.parse(sel.options[i].value);
        const specs = inv.specifications || {};
        
        // 1. BRAND FILTERING
        const isSolarEdge = inv.name.toLowerCase().includes("solaredge");
        const isGoodWe = inv.name.toLowerCase().includes("goodwe");
        
        if (systemType === "optimizer" && !isSolarEdge) continue;
        if (systemType === "string" && !isGoodWe) continue;
        
        // ⚡ 2. STRICT PHASE FILTERING
        // Ensures the inverter subcategory exactly matches the site's phase (1-Phase vs 3-Phase)
        const invPhase = inv.subcategory || ""; 
        if (requiredPhase === "1-Phase" && invPhase !== "1-Phase") continue;
        if (requiredPhase === "3-Phase" && invPhase !== "3-Phase") continue;

        let acKw = specs.maxAC ? specs.maxAC / 1000 : 0;
        if (acKw <= 0) continue;

        // ⚡ 3. PRIORITY LOGIC: Check if one unit can handle the load first
        // We only increment count if the DC/AC ratio exceeds a safe threshold (1.35)
        let neededCount = 1;
        let singleUnitRatio = dcCapacityKw / acKw;

        if (singleUnitRatio > 1.35) {
            // Calculate necessary count to bring ratio closer to the ideal 1.2
            neededCount = Math.max(1, Math.round((dcCapacityKw / 1.2) / acKw));
        }

        if (neededCount > 10) continue;

        const totalAc = acKw * neededCount;
        const actualRatio = dcCapacityKw / totalAc;

        // ⚡ 4. SCORING: Heavy penalty for multi-unit designs to favor single inverters
        const ratioDiff = Math.abs(actualRatio - 1.2) * 100;
        const multiUnitPenalty = (neededCount > 1) ? (neededCount * 500) : 0; 
        
        const score = ratioDiff + multiUnitPenalty;

        if (score < minScore) {
            minScore = score;
            bestMatchIndex = i;
            bestCount = neededCount;
        }
    }

    if (bestMatchIndex > 0) {
        sel.selectedIndex = bestMatchIndex;
        if (countInput) countInput.value = bestCount;
        
        // ⚡ SET LOCK: Set flag to true so manual changes are preserved
        hasAutoSelected = true; 
        
        const selectedInv = JSON.parse(sel.options[bestMatchIndex].value);
        console.log(`✅ Auto-selected (${requiredPhase}): ${selectedInv.name} x${bestCount}`);
    } else {
        console.warn(`⚠️ No suitable ${systemType} inverter found for ${requiredPhase} at ${dcCapacityKw}kWp`);
    }
}
// --- 3. SYSTEM TYPE TOGGLE ---
function setSystemType(type) {
    // 1. Update the tracking state
    currentSystemType = type;
    
    // 2. UI Highlights: Update button active states
    const btnString = document.getElementById("btn-type-string");
    const btnOpt = document.getElementById("btn-type-opt");
    if (btnString) btnString.classList.toggle("active", type === "string");
    if (btnOpt) btnOpt.classList.toggle("active", type === "optimizer");
    
    // ⚡ 3. RESET AUTO-SELECT FLAG
    // This allows autoSelectAndSizeInverter to suggest the best single inverter
    // exactly once for the newly selected system type.
    hasAutoSelected = false; 
    
    // 4. Visibility Toggles: Switch between Mode A (GoodWe) and Mode B (SolarEdge)
    const isOpt = (type === "optimizer");
    const optSection = document.getElementById("optimizer_section");
    const modeA = document.getElementById("report_mode_a");
    const modeB = document.getElementById("report_mode_b");
    const indicator = document.getElementById("report_mode_indicator");

    if (optSection) optSection.style.display = isOpt ? "block" : "none";
    if (modeA) modeA.style.display = isOpt ? "none" : "block";
    if (modeB) modeB.style.display = isOpt ? "block" : "none";
    
    if (indicator) {
        indicator.innerText = isOpt ? "SolarEdge Optimizer Mode" : "GoodWe String Inverter Mode";
    }

    // 5. Trigger Calculation
    // Because hasAutoSelected is now false, calculateStage2 will trigger a fresh auto-selection
    calculateStage2(); 
}
// --- 4. MAIN CALCULATION ENGINE (COMPLETE UPDATE) ---
function calculateStage2() {
  const globalData = window.projectData || {};
  
  // 1. Deep Merge Data Sources
  const s1 = { 
      ...globalData.stage1, 
      ...(globalData.performance || {}),
      ...(globalData.design || {}),
      ...(globalData.parameters || {}),
      monthlyTable: globalData.performance?.monthlyTable || 
                    globalData.stage1?.monthlyTable || 
                    globalData.monthlyTable || []
  };

  // 2. Validate Pre-requisites
  if (!s1.systemSizeKwp || s1.systemSizeKwp === 0) {
    updateElement("design_status", "⚠ Complete Stage 1 First");
    return;
  }

  // 3. Auto-Select Inverter based on DC Capacity
  autoSelectAndSizeInverter(s1.systemSizeKwp, currentSystemType, s1.phase);

  const invSelect = document.getElementById("inverter_selector");
  if (!invSelect || !invSelect.value) return;

  // 4. Extract Inverter Specifications
  const inverter = JSON.parse(invSelect.value);
  const invCount = parseInt(document.getElementById("inv_count").value) || 1;
  const invSpecs = inverter.specifications || {};

  // 5. Calculate Distributions
  const panelsPerInv = Math.floor(s1.panelCount / invCount);

  // 6. Generate Configuration Options
  let options = [];
  if (currentSystemType === "optimizer") {
      options = generateOptimizerOptions(panelsPerInv, s1.panelWattage, invSpecs);
  } else {
      options = generateStringOptions(panelsPerInv, s1.panelVoc || 49.5, s1.panelVmp || 41.5, invSpecs, s1);
  }

  // 7. Select Best Design Option
  const bestOption = options.find(o => o.valid) || options[0];

  // ⚡ 8. ERROR VALIDATION LOGIC (Add before rendering)
  const errorList = document.getElementById("error_list");
  const errorPanel = document.getElementById("error_panel");

  if (errorList && bestOption) {
      let errors = [];
      
      // Check for MPPT Voltage Mismatch & Safety Limits
      if (bestOption.trackers) {
          bestOption.trackers.forEach(t => {
              const maxAllowedV = invSpecs.vmax || invSpecs.max_dc_voltage || 1100;
              if (t.vocAtCold > maxAllowedV) {
                  errors.push(`MPPT${t.id}: Voltage (${t.vocAtCold.toFixed(0)}V) exceeds Inverter Limit (${maxAllowedV}V)!`);
              }
              // Mismatch check for parallel strings
              if (t.mismatchPct && t.mismatchPct > 10) {
                  errors.push(`MPPT${t.id}: Voltage Mismatch (>10%) detected between parallel strings!`);
              }
          });
      }

      if (errors.length > 0) {
          errorPanel.classList.remove("hidden"); // Defined in CSS
          errorList.innerHTML = errors.map(e => `<li><i class="fas fa-times-circle"></i> ${e}</li>`).join("");
      } else {
          errorPanel.classList.add("hidden");
      }
  }

  // 9. TRIGGER ALL VISUAL RENDERING ENGINES
  
  // A. Render Selection Cards
  renderDesignOptions(options, inverter, invCount, s1);

  // B. Render System Scheme (GoodWe List Format)
  renderDetailedSystemReport([{
      modelName: inverter.name,
      qty: invCount,
      trackers: bestOption.trackers || []
  }]);

  // C. Render Visual String Layout (Panel Icons)
  if (bestOption.trackers) {
      renderVisualStringDiagram(bestOption.trackers);
  }

  // D. Render Monthly Production Chart
  if (s1.monthlyTable && s1.monthlyTable.length > 0) {
      renderMiniChart(s1.monthlyTable);
  }

  // E. Finalize Report and Project Data State
  applyDesignOption(bestOption, inverter, invCount, s1);
}

function renderDetailedSystemReport(scheme) {
    let html = `<div style="display: flex; flex-direction: column; gap: 20px; padding: 15px; background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%); border-radius: 12px;">`;

    scheme.forEach((group, idx) => {
        const totalPanels = group.trackers.reduce((sum, t) => {
            const [strings, panels] = t.formation.split('*').map(Number);
            return sum + (strings * panels);
        }, 0);

        html += `
        <div class="inverter-report-block" style="position: relative; background: white; border-radius: 16px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border-left: 5px solid #3b82f6; overflow: hidden;">
            
            <!-- Decorative Background Pattern -->
            <div style="position: absolute; top: 0; right: 0; width: 200px; height: 200px; background: radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%); pointer-events: none;"></div>
            
            <!-- Header Section -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.4);">
                        <i class="fas fa-bolt" style="color: white; font-size: 1.4rem;"></i>
                    </div>
                    <div>
                        <div style="font-weight: 800; font-size: 1.1rem; color: #1e293b; letter-spacing: -0.02em;">${group.modelName}</div>
                        <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">Inverter Unit #${idx + 1}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="text-align: right;">
                        <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Quantity</div>
                        <div style="font-size: 1.5rem; font-weight: 800; color: #3b82f6;">${group.qty}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Total Panels</div>
                        <div style="font-size: 1.5rem; font-weight: 800; color: #10b981;">${totalPanels}</div>
                    </div>
                </div>
            </div>
            
            <!-- MPPT Tracker Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
                ${group.trackers.map(t => {
                    const [strings, panels] = t.formation.split('*').map(Number);
                    const totalOnTracker = strings * panels;
                    
                    return `
                    <div style="background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%); border: 2px solid #e2e8f0; border-radius: 12px; padding: 15px; transition: all 0.3s ease; position: relative; overflow: hidden;" 
                         onmouseover="this.style.borderColor='#3b82f6'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px -4px rgba(59, 130, 246, 0.2)'"
                         onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        
                        <!-- MPPT Badge -->
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 6px 12px; border-radius: 20px; box-shadow: 0 2px 4px rgba(30, 64, 175, 0.3);">
                                <i class="fas fa-plug" style="color: #fff; font-size: 0.7rem;"></i>
                                <span style="color: white; font-weight: 800; font-size: 0.8rem; letter-spacing: 0.03em;">MPPT ${t.id}</span>
                            </div>
                            <div style="background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 700;">
                                ${totalOnTracker} panels
                            </div>
                        </div>
                        
                        <!-- Configuration Display -->
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 10px; background: white; border-radius: 8px; border: 1px solid #f1f5f9;">
                            <div style="flex: 1;">
                                <div style="font-size: 0.65rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Configuration</div>
                                <div style="font-size: 1.3rem; font-weight: 800; color: #1e293b; font-family: 'Courier New', monospace; letter-spacing: 0.02em;">${t.formation}</div>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 10px; border-left: 2px solid #e2e8f0;">
                                <i class="fas fa-layer-group" style="color: #3b82f6; font-size: 1.2rem;"></i>
                                <span style="font-size: 0.7rem; color: #64748b; font-weight: 600;">${strings} string${strings > 1 ? 's' : ''}</span>
                            </div>
                        </div>
                        
                        <!-- Mini Visual Representation -->
                        <div style="margin-top: 12px; display: flex; gap: 4px; flex-wrap: wrap;">
                            ${Array(Math.min(strings, 3)).fill(0).map(() => `
                                <div style="display: flex; gap: 2px;">
                                    ${Array(Math.min(panels, 8)).fill(0).map(() => `
                                        <div style="width: 8px; height: 12px; background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); border-radius: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);"></div>
                                    `).join('')}
                                    ${panels > 8 ? '<span style="font-size: 0.7rem; color: #64748b; align-self: center; margin-left: 4px;">+' + (panels - 8) + '</span>' : ''}
                                </div>
                            `).join('')}
                            ${strings > 3 ? '<span style="font-size: 0.7rem; color: #64748b; align-self: center; margin-left: 6px;">+' + (strings - 3) + ' more</span>' : ''}
                        </div>
                        
                    </div>`;
                }).join("")}
            </div>
        </div>`;
    });

    html += `</div>`;
    updateElement("string_config_detail", html, true);
}


function renderMiniChart(monthlyData) {
    const container = document.getElementById("rpt_bar_chart");
    if (!container) return;

    // 1. Immediately clear the "Waiting for calculation" placeholder
    container.innerHTML = "";

    if (!monthlyData || monthlyData.length === 0) {
        container.innerHTML = 
            '<div style="width:100%; text-align:center; color:#94a3b8; font-size:0.8rem; padding: 20px;">No production data found for this location</div>';
        return;
    }

    // 2. Robust dynamic key detection (Handles energyYield, energy, yield, or value)
    const possibleKeys = ["energyYield", "energy", "yield", "value"];
    const energyKey = possibleKeys.find(k => monthlyData[0] && monthlyData[0][k] !== undefined);

    if (!energyKey) {
        console.error("Monthly data found, but no valid energy key detected:", monthlyData[0]);
        container.innerHTML = '<div style="width:100%; text-align:center; color:#ef4444; font-size:0.8rem; padding: 20px;">Invalid data format</div>';
        return;
    }

    // 3. Calculate max value for scaling
    const maxVal = Math.max(...monthlyData.map(m => m[energyKey] || 0));

    if (maxVal === 0) {
        container.innerHTML = '<div style="width:100%; text-align:center; color:#94a3b8; font-size:0.8rem; padding: 20px;">Expected production is zero</div>';
        return;
    }

    // 4. Generate Chart Bars using DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    monthlyData.forEach((m, index) => {
        const energy = m[energyKey] || 0;
        const heightPercent = (energy / maxVal) * 100;

        // Create the bar element
        const bar = document.createElement("div");
        bar.className = "chart-bar fade-in";
        bar.style.height = `${heightPercent}%`;
        bar.style.transition = "height 0.6s ease-out"; // Animates the "growth" of the bar
        bar.style.minHeight = "2px"; // Ensures very small values are visible
        
        // Tooltip
        bar.title = `${m.month || `Month ${index + 1}`}: ${Math.round(energy)} kWh`;

        // Value badge (visible on hover)
        const valBadge = document.createElement("div");
        valBadge.style.cssText = "position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-size: 0.6rem; color: #0ea5e9; font-weight: 700; opacity: 0; transition: opacity 0.2s; pointer-events: none;";
        valBadge.innerText = Math.round(energy);
        bar.appendChild(valBadge);

        // Label (Month abbreviations)
        const lbl = document.createElement("div");
        lbl.className = "chart-label";
        lbl.innerText = m.month ? m.month.substring(0, 3) : index + 1;
        bar.appendChild(lbl);

        // Hover interactions
        bar.onmouseenter = () => valBadge.style.opacity = "1";
        bar.onmouseleave = () => valBadge.style.opacity = "0";

        fragment.appendChild(bar);
    });

    container.appendChild(fragment);
}
// ==========================================
//  HELPER: GENERATE OPTIMIZER OPTIONS
// ==========================================
function generateOptimizerOptions(panelCount, wattage, invSpecs) {
    const options = [];
    
    // --- Option 1: Economy (Hybrid 2:1) ---
    // Handles odd panel counts correctly (Full pairs + 1 leftover)
    const fullPairs = Math.floor(panelCount / 2);
    const leftover1to1 = panelCount % 2; 
    const totalOpts2to1 = fullPairs + leftover1to1;
    
    // String power validation: Max 5.7kW for 1-Phase SolarEdge
    const stringWatts = (panelCount * wattage);
    const strCount2to1 = Math.ceil(totalOpts2to1 / 30);
    const wattsPerStr = stringWatts / strCount2to1;
    const isPowerValid = (invSpecs.subcategory === "3-Phase") ? true : (wattsPerStr <= 5700);

    options.push({
        id: "opt_eco",
        title: "💰 Economy (Hybrid 2:1)",
        desc: `Uses 2:1 for pairs and 1:1 for the odd panel.`,
        config: `${strCount2to1} String(s) × ${Math.ceil(totalOpts2to1 / strCount2to1)} Opts`,
        bom: [
            { name: "S1200 (2:1)", qty: fullPairs },
            { name: "S650B (1:1)", qty: leftover1to1 }
        ],
        valid: totalOpts2to1 >= 14 && isPowerValid,
        warning: !isPowerValid ? "Exceeds 5.7kW String Limit" : (totalOpts2to1 < 14 ? "String too short" : null)
    });

    // --- Option 2: Performance (1:1) ---
    const strCount1to1 = Math.ceil(panelCount / 25);
    const optsPerStr1to1 = Math.ceil(panelCount / strCount1to1);

    options.push({
        id: "opt_prem",
        title: "⚡ Performance (1:1)",
        desc: "Individual panel optimization.",
        config: `${strCount1to1} String(s) × ${optsPerStr1to1} Opts`,
        bom: [{ name: "S650B (1:1)", qty: panelCount }],
        valid: optsPerStr1to1 >= 16,
        warning: optsPerStr1to1 < 16 ? "String too short (<16)" : null
    });

    return options;
}

// ==========================================
//  HELPER: GENERATE STRING INVERTER OPTIONS
// ==========================================
function generateStringOptions(panelCount, voc, vmp, invSpecs, s1) {
    const options = [];
    const maxV = invSpecs.vmax || 1100; 
    const minV = invSpecs.vmin || 160;
    const totalMppts = invSpecs.mppt || 2; 

    // Dynamic Temperature Adjustments
    const vocCoeff = s1.voc_coeff || -0.26; 
    const vmpCoeff = s1.pmax_coeff || -0.33; 
    const deltaTCold = (s1.tempMin || 10) - 25;
    const deltaTHot = (s1.tempMax || 45) - 25;

    const vocCold = voc * (1 + (vocCoeff / 100) * deltaTCold);
    const vmpHot = vmp * (1 + (vmpCoeff / 100) * deltaTHot);

    const maxLen = Math.floor(maxV / vocCold);
    const minLen = Math.ceil(minV / vmpHot);

    let totalStrings = Math.ceil(panelCount / maxLen);
    let stringsRemaining = totalStrings;
    let panelsRemaining = panelCount;
    let trackerDetails = [];

    for (let i = 1; i <= totalMppts; i++) {
        if (stringsRemaining <= 0 || panelsRemaining <= 0) break;

        let stringsOnTracker = 1;
        if (stringsRemaining > (totalMppts - i + 1)) stringsOnTracker = 2;
        if (stringsRemaining > (totalMppts * 2) && i === 1) stringsOnTracker = 3;

        let pPerString = Math.ceil(panelsRemaining / stringsRemaining);
        if (pPerString > maxLen) pPerString = maxLen;

        // Voltage Mismatch Logic:
        // In this loop, strings on the same tracker are identical length (0% mismatch).
        // If your logic later allows different lengths on one MPPT, calculate:
        // mismatch = Math.abs(length1 - length2) / Math.max(length1, length2) * 100
        const mismatchPct = 0; 

        trackerDetails.push({
            id: i,
            formation: `${stringsOnTracker}*${pPerString}`,
            panelsPerString: pPerString,
            stringQty: stringsOnTracker,
            vmpAt25: pPerString * vmp,
            vocAtCold: pPerString * vocCold,
            mismatchPct: mismatchPct 
        });

        panelsRemaining -= (stringsOnTracker * pPerString);
        stringsRemaining -= stringsOnTracker;
    }

    const configString = trackerDetails.map(t => `MPPT${t.id}#: ${t.formation}`).join(" | ");

    options.push({
        id: "str_goodwe_detailed",
        title: "GoodWe Auto Design",
        config: configString,
        trackers: trackerDetails, 
        // ⚡ VALIDATION: Standard sizing + Mismatch Check
        valid: trackerDetails.every(t => t.panelsPerString >= minLen && t.panelsPerString <= maxLen && t.mismatchPct < 10),
        stringCount: totalStrings,
        panelsPerString: Math.floor(panelCount / totalStrings)
    });

    return options;
}

// ==========================================
//  UI RENDERER: CREATE SELECTION CARDS
// ==========================================
function renderDesignOptions(options, inverter, invCount, s1) {
    const container = document.getElementById("string_config_detail");
    if (!container) return;

    let html = `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-top:10px;">`;

    options.forEach(opt => {
        const color = opt.valid ? "border-green-500 bg-green-50 hover:bg-green-100" : "border-red-300 bg-red-50 opacity-60";
        const icon = opt.valid ? "check-circle" : "exclamation-triangle";
        const cursor = opt.valid ? "pointer" : "not-allowed";
        
        // We use an onclick handler to trigger the apply function
        // Note: Passing objects in onclick HTML is messy, so we attach event listeners later or store data in DOM
        html += `
        <div id="card_${opt.id}" class="design-card" 
             style="border:2px solid ${opt.valid?'#22c55e':'#fca5a5'}; background:${opt.valid?'#f0fdf4':'#fef2f2'}; 
                    padding:10px; border-radius:8px; cursor:${cursor}; transition:all 0.2s;"
             onclick="handleOptionClick('${opt.id}')">
            
            <div style="font-weight:700; color:${opt.valid?'#15803d':'#991b1b'}; font-size:0.9rem; display:flex; align-items:center; gap:5px;">
                <i class="fas fa-${icon}"></i> ${opt.title}
            </div>
            
            <div style="font-size:0.8rem; color:#374151; margin:5px 0;">${opt.desc}</div>
            <div style="font-weight:700; font-size:0.85rem; color:#111827;">${opt.config}</div>
            
            ${opt.warning ? `<div style="font-size:0.75rem; color:#ef4444; margin-top:5px;">⚠️ ${opt.warning}</div>` : ''}
        </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Attach data to window for the click handler to access
    window.currentDesignOptions = options;
    window.currentInverterContext = { inverter, invCount, s1 };
}

// ==========================================
//  HANDLER: APPLY SELECTION
// ==========================================
window.handleOptionClick = function(id) {
    const options = window.currentDesignOptions;
    const ctx = window.currentInverterContext;
    const selected = options.find(o => o.id === id);

    if (!selected || !selected.valid) return;

    // Highlight UI
    document.querySelectorAll('.design-card').forEach(el => {
        el.style.borderColor = '#e5e7eb'; // Reset
        el.style.transform = 'scale(1)';
        el.style.boxShadow = 'none';
    });
    const card = document.getElementById(`card_${id}`);
    if(card) {
        card.style.borderColor = '#2563eb'; // Blue Active
        card.style.transform = 'scale(1.02)';
        card.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    }

    applyDesignOption(selected, ctx.inverter, ctx.invCount, ctx.s1);
};

function applyDesignOption(option, inverter, invCount, s1) {
    // 1. Update Global Project Data State
    if (!window.projectData) window.projectData = {};
    window.projectData.strings = {
        systemType: currentSystemType,
        inverterModel: inverter.name,
        inverterCount: invCount,
        selectedConfig: option.config,
        trackers: option.trackers || [],
        isValid: option.valid
    };

    // ⚡ 2. MAP PROJECT OVERVIEW DATA (From Stage 1 / User Summary)
    // Matches the 'Project Overview' table in your uploaded image 'st.png'
    updateElement("rpt_project_name", s1.projectName || "New Solar Project");
    updateElement("rpt_location", s1.address || s1.location || "Default Location");
    
    // Temperature Range Formatting
    const tempRange = (s1.tempMin !== undefined && s1.tempMax !== undefined) 
        ? `${s1.tempMin}°C / ${s1.tempMax}°C` 
        : "-";
    updateElement("rpt_temp_range", tempRange);
    
    // Update Array Configuration label in the overview
    updateElement("rpt_pv_config", option.config);

    // ⚡ 3. TRIGGER VISUAL RENDERING (Clears "Waiting for calculation")
    if (s1.monthlyTable && s1.monthlyTable.length > 0) {
        renderMiniChart(s1.monthlyTable);
    }
    if (option.trackers) {
        renderVisualStringDiagram(option.trackers);
    }

    // 4. RENDER SYSTEM SCHEME (GoodWe Style Blocks)
    const schemeContainer = document.getElementById("string_config_detail");
    if (schemeContainer && option.trackers) {
        schemeContainer.innerHTML = `
            <div class="inverter-report-block fade-in" style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid var(--brd); margin-bottom: 20px;">
                <div style="font-weight: 800; margin-bottom: 12px; font-size: 0.95rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; display: flex; justify-content: space-between;">
                    <span style="color: var(--txt);"><i class="fas fa-server" style="color: var(--p); margin-right: 8px;"></i>${inverter.name}</span>
                    <span style="background: #e0f2fe; color: #0369a1; padding: 2px 10px; border-radius: 20px; font-size: 0.75rem;">Qty: ${invCount}</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                    ${option.trackers.map(t => `
                        <div style="font-size: 0.8rem; color: #475569; background: white; padding: 8px; border-radius: 6px; border: 1px solid #f1f5f9;">
                            <strong style="color: #1e40af;">MPPT${t.id}#</strong> 
                            <span style="color: #64748b;">(pv array 1):</span>
                            <span style="font-weight: 700; color: #2563eb; margin-left: 4px;">${t.formation}</span>
                        </div>
                    `).join("")}
                </div>
            </div>`;
    }

    // 5. RENDER DETAILED PARAMETER TABLE (Horizontal Tracker Columns)
    const paramThead = document.getElementById("rpt_param_thead");
    const paramTbody = document.getElementById("rpt_param_tbody");
    
    if (paramThead && paramTbody && option.trackers) {
        let headerHtml = `<tr><th style="text-align: left; background: #f8fafc; color: var(--txt-2); font-size: 0.7rem; min-width: 150px;">PARAMETER</th>`;
        option.trackers.forEach(t => {
            headerHtml += `<th style="text-align: center; background: #f8fafc; color: var(--txt-2); font-size: 0.7rem;">TRACKER ${t.id}</th>`;
        });
        headerHtml += `</tr>`;
        paramThead.innerHTML = headerHtml;

        const rows = [
            { label: "Vmpp at 25°C [V]", key: "vmpAt25" },
            { label: "Voc at Cold [V]", key: "vocAtCold" },
            { label: "Min. Vmpp [V]", value: inverter.specifications.min_mppt_voltage || 160 },
            { label: "Max. DC Voltage [V]", value: inverter.specifications.max_dc_voltage || 1100 }
        ];

        paramTbody.innerHTML = rows.map(row => `
            <tr class="fade-in">
                <td style="font-weight: 600; color: var(--txt-2); background: #f8fafc; border-right: 1px solid var(--brd); font-size: 0.75rem;">${row.label}</td>
                ${option.trackers.map(t => {
                    let val = row.key ? (t[row.key] ? t[row.key].toFixed(1) : "-") : row.value;
                    let warningStyle = "";
                    if (row.key === "vocAtCold" && parseFloat(val) > (inverter.specifications.max_dc_voltage || 1100)) {
                        warningStyle = "background: #fee2e2; color: #b91c1c; font-weight: 800;";
                    }
                    return `<td style="text-align: center; color: var(--txt); font-weight: 600; font-size: 0.8rem; ${warningStyle}">${val}</td>`;
                }).join("")}
            </tr>
        `).join("");
        
        const paramSection = document.getElementById("string_parameter_section");
        if(paramSection) paramSection.classList.remove("hidden");
    }

    // 6. UPDATE SYSTEM PERFORMANCE SUMMARY (As seen in 'goodweop.png')
    const totalPeakDc = (s1.panelWattage * s1.panelCount);
    const nominalAc = ((inverter.specifications.maxAC || 0) * invCount);
    
    updateElement("rpt_peak_dc", `${(totalPeakDc / 1000).toFixed(2)} kWp`);
    updateElement("rpt_nominal_ac", `${(nominalAc / 1000).toFixed(2)} kW`);
    updateElement("rpt_annual_gen", `${s1.annualYield ? Math.round(s1.annualYield) : "-"} kWh`);
    
    const ratio = nominalAc > 0 ? (totalPeakDc / nominalAc).toFixed(2) : "-";
    updateElement("rpt_dc_ac", ratio);

    // 7. UPDATE SIDEBAR / SLD COMPONENTS
    updateElement("sld_panel_count", s1.panelCount);
    updateElement("sld_inv_name", inverter.name);
    updateElement("sld_inv_qty", `${invCount}×`);
    updateElement("string_config_summary", option.config);

    // 8. VALIDATION & STATUS UI
    const statusEl = document.getElementById("design_status");
    const banner = document.getElementById("validation_banner");
    if (statusEl) {
        statusEl.innerHTML = option.valid ? '<i class="fas fa-check-circle"></i> Validated' : '<i class="fas fa-times-circle"></i> Check Limits';
        statusEl.style.color = option.valid ? '#16a34a' : '#ef4444';
        if(banner) banner.className = `info-box validation-box ${option.valid ? 'status-valid' : 'status-error'}`;
    }

    // Toggle Next Button
    const nextBtn = document.getElementById("btn-next-stage3");
    if (nextBtn) nextBtn.disabled = !option.valid;
}

function renderVisualStringDiagram(trackers) {
    const container = document.getElementById("diagram_container");
    const section = document.getElementById("visual_string_diagram");
    if (!container) return;

    if (section) section.classList.remove("hidden");

    let html = `<div class="visual-scroll-container" style="display: flex; flex-direction: column; gap: 15px;">`;

    trackers.forEach(t => {
        const [strings, panels] = t.formation.split('*').map(Number);
        
        for (let s = 1; s <= strings; s++) {
            html += `
            <div class="solar-block-group" style="display: flex; align-items: center; gap: 10px; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--p); min-width: 70px;">MPPT${t.id}-S${s}</div>
                <div class="panel-string" style="display: flex; gap: 3px; flex-wrap: wrap;">
                    ${Array(panels).fill(0).map(() => `
                        <div class="v-panel" style="width: 12px; height: 18px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 1px;"></div>
                    `).join("")}
                </div>
                <div style="margin-left: auto;"><i class="fas fa-arrow-right" style="color: #cbd5e1; font-size: 0.8rem;"></i></div>
            </div>`;
        }
    });

    html += `</div>`;
    container.innerHTML = html;
}

// ⚡ HELPER: Ensure this exists at the bottom of stage2_inverter.js
function updateElement(id, value, isHtml = false) {
    const el = document.getElementById(id);
    if (el) {
        if (isHtml) el.innerHTML = value;
        else el.innerText = value;
    }
}