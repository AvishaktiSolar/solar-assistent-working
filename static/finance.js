// ==================================================================
//  finance.js - Unified Financial Engine (All Stages)
//  FIXES APPLIED:
//  - A-1: Removed 12× tariff inflation
//  - A-2: Fixed sysSize undefined error
//  - A-3: Proper data shape for renderFinalReport
//  - A-7: Fixed subsidy double-deduction
//  - B-3: Unified tariff calculation with shared function
// ==================================================================

// ============================================================
// SHARED TARIFF CALCULATION - ONE SOURCE OF TRUTH
// ============================================================
function getAverageTariff(bills) {
    let totalAmt = 0, totalUnits = 0;
    if (!bills || !bills.length) return 0;
    
    bills.forEach(bill => {
        const amount = parseFloat(bill.bill_amount) || 0;
        const units = parseFloat(bill.current_units) || 0;
        if (amount > 0 && units > 0) {
            totalAmt += amount;
            totalUnits += units;
        }
    });
    return totalUnits > 0 ? totalAmt / totalUnits : 0;
}

// ============================================================
// MAIN FINANCIAL CALCULATION ENGINE
// ============================================================
function calculateFinancials(techData, totalAnnualUnits, bills) {
  
    // --- 1. BILLING ANALYSIS (FIXED A-1: No 12× multiplier) ---
    let totalCurrentBillAmount = 0;
    let totalBillUnits = 0;

    if (bills && bills.length > 0) {
        bills.forEach((bill) => {
            // Use current_units (monthly) not annual consumption
            const monthlyUnits = parseFloat(bill.current_units || 0);
            const monthlyAmount = parseFloat(bill.bill_amount || 0);
            totalBillUnits += monthlyUnits;
            totalCurrentBillAmount += monthlyAmount;
        });
    }

    // Weighted Average Tariff - Using shared function for consistency
    let avgTariff = getAverageTariff(bills);
    
    // Fallback if bills array is empty
    if (avgTariff <= 0 && totalAnnualUnits > 0 && totalCurrentBillAmount > 0) {
        avgTariff = totalCurrentBillAmount / totalBillUnits;
    }
    
    if (!Number.isFinite(avgTariff) || avgTariff <= 0) {
        throw new Error("Average tariff cannot be calculated. Enter real electricity bill units and bill amount before running financial analysis.");
    }

    const actualAnnualCost = totalAnnualUnits * avgTariff;

    // --- 2. CAPEX WATERFALL LOGIC (Finds Best Cost) ---
    let grossCapex = 0;
    let subsidyAmount = 0;
    let netCapex = 0;
    let costSource = "Stage 1 Estimate";
    let detailedCost = null;
    let grandTotalBeforeSubsidy = 0;

    const pData = window.projectData || {};
    const techDataObj = techData || pData?.stage1?.design || {};
    const systemSizeKwp = techDataObj.systemSizeKwp || pData?.design?.systemSizeKwp || 0;

    // PRIORITY 1: STAGE 5 (Final Commercials - FIXED A-7)
    if (pData.stage5 && pData.stage5.grandTotal !== undefined) {
        // Use the values we stored separately to avoid double deduction
        grandTotalBeforeSubsidy = parseFloat(pData.stage5.grandTotalBeforeSubsidy) || 0;
        netCapex = parseFloat(pData.stage5.grandTotal) || 0;
        subsidyAmount = parseFloat(pData.stage5.subsidyDeducted) || 0;
        
        // If grandTotalBeforeSubsidy wasn't stored, reconstruct it
        if (grandTotalBeforeSubsidy === 0 && pData.stage5.subtotal) {
            const gstAmount = parseFloat(pData.stage5.gstAmount) || 0;
            grandTotalBeforeSubsidy = parseFloat(pData.stage5.subtotal) + gstAmount;
        }
        
        grossCapex = grandTotalBeforeSubsidy || (netCapex + subsidyAmount);
        costSource = "Stage 5 Commercials";
        detailedCost = pData.stage5.itemized || null;
    } 
    
    // PRIORITY 2: STAGE 3 (Engineering BoQ + Stage 1 Estimates)
    else if (pData.stage3 && pData.stage3.totalCost) {
        // Stage 3 gives us accurate Electrical BoQ cost
        const electricalCost = parseFloat(pData.stage3.totalCost) || 0;
        
        // FIXED A-2: Use systemSizeKwp instead of undefined sysSize
        const estimatedPanelCost = systemSizeKwp * 22000;   // ₹22,000/kW
        const estimatedInvCost = systemSizeKwp * 6000;      // ₹6,000/kW
        const estimatedStructCost = systemSizeKwp * 4000;   // ₹4,000/kW
        const estimatedInstall = systemSizeKwp * 3000;      // ₹3,000/kW
        
        grossCapex = estimatedPanelCost + estimatedInvCost + estimatedStructCost + estimatedInstall + electricalCost;
        
        // Apply Subsidy Logic
        const applySubsidy = document.getElementById("project_type")?.value?.includes("Subsidy") || false;
        const subsidyInput = parseFloat(document.getElementById("subsidy_amount")?.value) || 0;
        subsidyAmount = applySubsidy ? subsidyInput : 0;
        
        netCapex = grossCapex - subsidyAmount;
        costSource = "Stage 3 Hybrid Estimate";
    }
    
    // PRIORITY 3: STAGE 1 (Rough Estimate)
    else {
        let capexPerKW = 0;
        // Try to get capex from various sources
        if (pData.stage1?.capexPerKw) {
            capexPerKW = parseFloat(pData.stage1.capexPerKw);
        } else if (document.getElementById("capex_per_kw")) {
            capexPerKW = parseFloat(document.getElementById("capex_per_kw").value);
        }
        
        if (!Number.isFinite(capexPerKW) || capexPerKW <= 0) {
            // Fallback: estimate from panel count
            const panelCount = pData.stage1?.panelCount || pData?.design?.panelCount || 0;
            const panelWattage = pData.stage1?.panelWattage || pData?.design?.panelWattage || 550;
            if (panelCount > 0 && systemSizeKwp > 0) {
                capexPerKW = 25000; // Default ₹25,000/kW
            } else {
                throw new Error("CAPEX per kW is missing. Enter a real user-provided CAPEX value or complete Stage 5 pricing.");
            }
        }
        
        grossCapex = systemSizeKwp * capexPerKW;
        
        const applySubsidy = document.getElementById("project_type")?.value?.includes("Subsidy") || false;
        const subsidyInput = parseFloat(document.getElementById("subsidy_amount")?.value) || 0;
        subsidyAmount = applySubsidy ? subsidyInput : 0;
        netCapex = grossCapex - subsidyAmount;
        costSource = "Stage 1 Preliminary";
    }

    // Safety: Net Cost cannot be negative
    if (netCapex < 0) netCapex = 0;

    // --- 3. LIFETIME CASHFLOW ANALYSIS (25 Years) ---
    let cumulativeSavings = 0;
    let netCashflow = -netCapex; 
    let paybackYears = 0;
    let paybackFound = false;

    const generationDegradation = 0.0055; 
    const tariffInflation = 0.02;         
    const annualOandM = 0;                

    const year1Generation = techDataObj.totalAnnualEnergy || techData?.totalAnnualEnergy || 0;
    const year1Savings = year1Generation * avgTariff;

    for (let year = 1; year <= 25; year++) {
        // A. Degrade Generation
        const yearGen = year1Generation * Math.pow(1 - generationDegradation, year - 1);
        
        // B. Inflate Tariff
        const yearTariff = avgTariff * Math.pow(1 + tariffInflation, year - 1);
        
        // C. Calculate Savings
        const yearSavings = (yearGen * yearTariff) - annualOandM;
        
        cumulativeSavings += yearSavings;
        netCashflow += yearSavings;

        // D. Payback Logic
        if (!paybackFound && netCashflow >= 0) {
            const prevBalance = Math.abs(netCashflow - yearSavings); 
            paybackYears = (year - 1) + (prevBalance / yearSavings);
            paybackFound = true;
        }
    }

    const totalProfit = cumulativeSavings - netCapex;
    const roi = netCapex > 0 ? (totalProfit / netCapex) * 100 : 0;

    // Post-solar bill estimate
    let postSolarCost = (totalAnnualUnits - year1Generation) * avgTariff;
    if (postSolarCost < 0) postSolarCost = 0; 

    // --- 4. BUILD COMPLETE REPORT DATA (FIXED A-3) ---
    // Extract monthly data from techData or projectData
    let monthlyTable = [];
    let specificYieldAnnual = 0;
    let plfAnnual = 0;
    
    // Try to get monthly data from various sources
    if (techData?.monthlyTable && Array.isArray(techData.monthlyTable)) {
        monthlyTable = techData.monthlyTable;
    } else if (pData.stage1?.performance?.monthlyTable) {
        monthlyTable = pData.stage1.performance.monthlyTable;
    } else if (pData.stage1?.monthlyTable) {
        monthlyTable = pData.stage1.monthlyTable;
    }
    
    // Get specific yield and PLF
    if (techData?.specificYieldAnnual !== undefined) {
        specificYieldAnnual = techData.specificYieldAnnual;
    } else if (pData.stage1?.specificYieldAnnual !== undefined) {
        specificYieldAnnual = pData.stage1.specificYieldAnnual;
    } else if (pData.stage1?.system?.specificYield !== undefined) {
        specificYieldAnnual = pData.stage1.system.specificYield;
    }
    
    if (techData?.plfAnnual !== undefined) {
        plfAnnual = techData.plfAnnual;
    } else if (pData.stage1?.plfAnnual !== undefined) {
        plfAnnual = pData.stage1.plfAnnual;
    } else if (pData.stage1?.system?.plf !== undefined) {
        plfAnnual = pData.stage1.system.plf;
    }
    
    // Calculate total annual energy if not provided
    let totalAnnualEnergy = techDataObj.totalAnnualEnergy || techData?.totalAnnualEnergy || 0;
    if (totalAnnualEnergy === 0 && monthlyTable.length > 0) {
        totalAnnualEnergy = monthlyTable.reduce((sum, m) => sum + (m.energyYield || m.gen || 0), 0);
    }

    return {
        // Financial metrics
        costSource: costSource,
        detailedCost: detailedCost,
        avgTariff: avgTariff,
        actualAnnualCost: actualAnnualCost,
        grossCapex: grossCapex,
        subsidyAmount: subsidyAmount,
        netCapex: netCapex,
        annualSavings: year1Savings,
        totalAchievedValue: cumulativeSavings,
        achievedLifetimeOutput: cumulativeSavings,
        postSolarCost: postSolarCost,
        payback: paybackFound ? paybackYears : 25,
        roi: roi,
        
        // Report data (FIXED A-3)
        systemSizeKwp: systemSizeKwp,
        totalAnnualUnits: totalAnnualUnits || 0,
        totalAnnualEnergy: totalAnnualEnergy,
        specificYieldAnnual: specificYieldAnnual,
        plfAnnual: plfAnnual,
        monthlyTable: monthlyTable,
        siteName: pData?.site?.name || pData?.stage1?.site?.name || "Solar Project",
        designerName: pData?.site?.designer || pData?.stage1?.site?.designer || "-",
        
        // Legacy compatibility
        totalAnnualUnits: totalAnnualUnits || 0
    };
}

// ============================================================
// REPORT RENDERER (FIXED A-3)
// ============================================================
function renderFinalReport(data) {
    const fmtMoney = (num) => {
        if (!num || isNaN(num)) return "₹0";
        return "₹" + Math.round(num).toLocaleString("en-IN");
    };
    
    const fmtNum = (num, dec=1) => {
        if (!num || isNaN(num)) return "0";
        return num.toLocaleString("en-IN", { maximumFractionDigits: dec });
    };

    // --- DYNAMIC COMMERCIAL SECTION ---
    let commercialHTML = '';
    
    // IF DETAILED STAGE 5 DATA EXISTS
    if (data.detailedCost) {
        const items = data.detailedCost;
        const s5 = window.projectData?.stage5 || {};
        
        commercialHTML = `
        <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;">
            <i class="fas fa-file-invoice-dollar"></i> Commercial Proposal (Final)
        </h3>
        <table class="output-table">
            <tr style="background:#f8fafc;">
                <th>Item Description</th>
                <th style="text-align:right;">Amount</th>
            </tr>
            <tr><td>PV Modules</td><td style="text-align:right;">${fmtMoney(items.panels)}</td></tr>
            <tr><td>Inverters</td><td style="text-align:right;">${fmtMoney(items.inverter)}</td></tr>
            <tr><td>Structure</td><td style="text-align:right;">${fmtMoney(items.structure)}</td></tr>
            <tr><td>Electrical BoS</td><td style="text-align:right;">${fmtMoney(items.bos)}</td></tr>
            <tr><td>Installation & Services</td><td style="text-align:right;">${fmtMoney(items.installation)}</td></tr>
            <tr style="border-top:2px solid #ccc; font-weight:bold;">
                <td>Subtotal</td><td style="text-align:right;">${fmtMoney(s5.subTotal || data.grossCapex)}</td>
            </tr>
            <tr>
                <td>GST Amount</td><td style="text-align:right; color:#dc2626;">+ ${fmtMoney(s5.gstAmount || 0)}</td>
            </tr>
            ${data.subsidyAmount > 0 ? `
            <tr style="color:#16a34a; font-weight:bold;">
                <td>Less: Govt. Subsidy</td><td style="text-align:right;">- ${fmtMoney(data.subsidyAmount)}</td>
            </tr>` : ''}
            <tr class="financial-highlight" style="font-size:1.1rem;">
                <td><strong>Final Net Payable</strong></td>
                <td style="text-align:right;"><strong>${fmtMoney(data.netCapex)}</strong></td>
            </tr>
        </table>`;
    } 
    // IF SIMPLE PREVIEW (Stage 1 or 3)
    else {
        commercialHTML = `
        <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;">
            <i class="fas fa-coins"></i> Project Cost Estimate
        </h3>
        <div style="background:#fff7ed; border:1px solid #fed7aa; padding:10px; margin-bottom:10px; border-radius:4px; font-size:0.85rem; color:#9a3412;">
            <i class="fas fa-info-circle"></i> Based on: <strong>${data.costSource || "Estimate"}</strong>. 
            Complete Stage 5 for a precise quote.
        </div>
        <table class="output-table">
            <tr><td>Estimated Gross Cost</td><td>${fmtMoney(data.grossCapex)}</td></tr>
            ${data.subsidyAmount > 0 ? `<tr style="color:#16a34a;"><td>Est. Subsidy</td><td>- ${fmtMoney(data.subsidyAmount)}</td></tr>` : ''}
            <tr class="financial-highlight"><td><strong>Est. Net Payable</strong></td><td><strong>${fmtMoney(data.netCapex)}</strong></td></tr>
        </table>`;
    }

    // --- MONTHLY TABLE RENDERING (FIXED A-3) ---
    let monthlyRows = '';
    let totalGen = 0;
    
    if (data.monthlyTable && data.monthlyTable.length > 0) {
        data.monthlyTable.forEach(m => {
            const gen = m.energyYield || m.gen || 0;
            totalGen += gen;
            monthlyRows += `
                <tr>
                    <td>${m.month || ''}</td>
                    <td>${(m.ghi || 0).toFixed(2)}</td>
                    <td style="font-weight:bold; color:var(--primary);">${Math.round(gen).toLocaleString()}</td>
                    <td>${((m.plf || 0) * 100).toFixed(1)}%</td>
                </tr>
            `;
        });
    } else {
        monthlyRows = `
            <tr>
                <td colspan="4" style="text-align:center; color:#999; padding:20px;">
                    <i class="fas fa-info-circle"></i> Monthly generation data not available.
                    Complete Stage 1.3 to generate data.
                </td>
            </tr>
        `;
    }

    // --- MAIN REPORT ASSEMBLY ---
    const output = `
    <div class="report-container">
        <h3 style="color: var(--primary-dark); margin-bottom: 1rem;">
            <i class="fas fa-building"></i> Site & Load Summary
        </h3>
        <table class="output-table">
            <tr><td>Project Name</td><td>${data.siteName || "Solar Project"}</td></tr>
            <tr><td>Design By</td><td>${data.designerName || '-'}</td></tr>
            <tr><td>Total Annual Load</td><td>${fmtNum(data.totalAnnualUnits, 0)} kWh</td></tr>
            <tr><td>System Size</td><td style="font-size:1.1rem; color:var(--success);">
                <strong>${(data.systemSizeKwp || 0).toFixed(2)} kWp</strong>
            </td></tr>
        </table>

        <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;">
            <i class="fas fa-solar-panel"></i> Generation Analysis
        </h3>
        <table class="output-table">
            <tr><td>Specific Yield</td><td>${(data.specificYieldAnnual || 0).toFixed(1)} kWh/kWp/year</td></tr>
            <tr><td>Annual Generation</td><td>${fmtNum(data.totalAnnualEnergy || 0, 0)} kWh</td></tr>
            <tr><td>Performance Ratio (PLF)</td><td>${((data.plfAnnual || 0) * 100).toFixed(2)}%</td></tr>
        </table>

        ${commercialHTML}

        <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;">
            <i class="fas fa-chart-line"></i> Financial Returns
        </h3>
        <table class="output-table">
            <tr><td>Current Tariff</td><td>₹${(data.avgTariff || 0).toFixed(2)} / kWh</td></tr>
            <tr><td>Year 1 Achieved Value</td><td>${fmtMoney(data.annualSavings)}</td></tr>
            <tr><td>Payback Period</td><td>${(data.payback || 0).toFixed(1)} years</td></tr>
            <tr><td>25-Year ROI</td><td>${(data.roi || 0).toFixed(1)}%</td></tr>
            <tr class="financial-highlight">
                <td><strong>Total Achieved Value</strong></td>
                <td><strong>${fmtMoney(data.totalAchievedValue)}</strong></td>
            </tr>
        </table>

        <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;">
            <i class="fas fa-calendar-alt"></i> Monthly Generation
        </h3>
        <div style="overflow-x: auto;">
            <table class="monthly-report-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>GHI</th>
                        <th>Gen (kWh)</th>
                        <th>PLF (%)</th>
                    </tr>
                </thead>
                <tbody>
                    ${monthlyRows}
                    ${data.monthlyTable && data.monthlyTable.length > 0 ? `
                    <tr class="table-footer">
                        <td><strong>Total</strong></td>
                        <td>-</td>
                        <td><strong>${fmtNum(data.totalAnnualEnergy || totalGen, 0)}</strong></td>
                        <td><strong>${((data.plfAnnual || 0) * 100).toFixed(1)}%</strong></td>
                    </tr>` : ''}
                </tbody>
            </table>
        </div>
    </div>
    `;

    const outputContainer = document.getElementById("solar-output");
    if (outputContainer) {
        outputContainer.innerHTML = output;
    } else {
        console.warn("Element #solar-output not found in DOM");
        // Fallback: try to find any output container
        const fallbackContainer = document.querySelector(".report-container, #report-output, .output-area");
        if (fallbackContainer) {
            fallbackContainer.innerHTML = output;
        }
    }
}

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================
window.getAverageTariff = getAverageTariff;
window.calculateFinancials = calculateFinancials;
window.renderFinalReport = renderFinalReport;

console.log("✅ finance.js loaded with all critical fixes applied");