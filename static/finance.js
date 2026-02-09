// ==================================================================
//  finance.js - Unified Financial Engine (All Stages)
// ==================================================================

/**
 * Calculates financial metrics by finding the best available cost data.
 * @param {Object} techData - Solar physics data (Generation, Yield, etc.)
 * @param {number} totalAnnualUnits - Total consumption
 * @param {Array} bills - Array of bill objects
 */
function calculateFinancials(techData, totalAnnualUnits, bills) {
  
  // --- 1. BILLING ANALYSIS ---
  let totalCurrentBillAmount = 0;
  let totalBillUnits = 0;

  if (bills && bills.length > 0) {
    bills.forEach((bill) => {
      totalBillUnits += parseFloat(bill.total_annual_consumption || 0);
      const monthlyAmount = parseFloat(bill.bill_amount || 0);
      totalCurrentBillAmount += (monthlyAmount * 12); 
    });
  }

  // Weighted Average Tariff
  let avgTariff = 0;
  if (totalBillUnits > 0) avgTariff = totalCurrentBillAmount / totalBillUnits;
  if (!avgTariff || avgTariff === Infinity) avgTariff = 10; // Default safety

  const actualAnnualCost = totalAnnualUnits * avgTariff;


  // --- 2. CAPEX WATERFALL LOGIC (Finds Best Cost) ---
  let grossCapex = 0;
  let subsidyAmount = 0;
  let netCapex = 0;
  let costSource = "Stage 1 Estimate"; // For debugging/display
  let detailedCost = null; // Object to store breakdown if available

  const pData = window.projectData || {};

  // PRIORITY 1: STAGE 5 (Final Commercials)
  if (pData.stage5 && pData.stage5.grandTotal) {
      // In stage5.js, grandTotal typically includes GST and deducts Subsidy.
      // We treat it as the final check-writing amount.
      netCapex = parseFloat(pData.stage5.grandTotal);
      
      // Attempt to retrieve subsidy if stored separately
      subsidyAmount = window.stage5Subsidy || 0; 
      
      // Reconstruct Gross for display (Net + Subsidy)
      grossCapex = netCapex + subsidyAmount;
      
      costSource = "Stage 5 Commercials";
      detailedCost = pData.stage5.itemized;
  } 
  
  // PRIORITY 2: STAGE 3 (Engineering BoQ + Stage 1 Estimates)
  else if (pData.stage3 && pData.stage3.totalCost) {
      // Stage 3 gives us accurate Electrical BoQ cost
      const electricalCost = parseFloat(pData.stage3.totalCost.replace(/,/g, '')) || 0;
      
      // Estimate other components based on System Size (Stage 1)
      const sysSize = techData.systemSizeKwp || 0;
      const estimatedPanelCost = sysSize * 1000 * 22; // Approx ₹22/Wp
      const estimatedInvCost = sysSize * 1000 * 6;    // Approx ₹6/Wp
      const estimatedStructCost = sysSize * 1000 * 4; // Approx ₹4/Wp
      const estimatedInstall = sysSize * 1000 * 3;    // Approx ₹3/Wp
      
      grossCapex = electricalCost + estimatedPanelCost + estimatedInvCost + estimatedStructCost + estimatedInstall;
      
      // Apply Subsidy Logic (Rough)
      const subsidyInput = parseFloat(document.getElementById("subsidy_amount")?.value) || 0;
      const applySubsidy = document.getElementById("project_type")?.value.includes("Subsidy");
      subsidyAmount = applySubsidy ? subsidyInput : 0;
      
      netCapex = grossCapex - subsidyAmount;
      costSource = "Stage 3 Hybrid Estimate";
  }
  
  // PRIORITY 3: STAGE 1 (Rough Estimate)
  else {
      const capexPerKW = parseFloat(document.getElementById("capex_per_kw").value) || 40000;
      grossCapex = techData.systemSizeKwp * capexPerKW;
      
      const subsidyInput = parseFloat(document.getElementById("subsidy_amount")?.value) || 0;
      const applySubsidy = document.getElementById("project_type")?.value.includes("Subsidy");
      
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

  const year1Generation = techData.totalAnnualEnergy;
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

  return {
    costSource, // Metadata
    detailedCost, // Metadata
    avgTariff,
    actualAnnualCost,
    grossCapex,
    subsidyAmount,
    netCapex,
    annualSavings: year1Savings,
    totalLifetimeSavings: cumulativeSavings,
    postSolarCost,
    payback: paybackFound ? paybackYears : 25,
    roi
  };
}


/**
 * Generates the Final Report HTML.
 * Dynamically switches between Simple and Detailed Commercial tables.
 */
function renderFinalReport(data) {
  const fmtMoney = (num) => "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const fmtNum = (num, dec=1) => num.toLocaleString("en-IN", { maximumFractionDigits: dec });

  // --- DYNAMIC COMMERCIAL SECTION ---
  let commercialHTML = '';
  
  // IF DETAILED STAGE 5 DATA EXISTS
  if (data.detailedCost) {
      const items = data.detailedCost;
      const s5 = window.projectData.stage5; // Access full stage 5 for Subtotal/GST
      
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
            <td>Subtotal</td><td style="text-align:right;">${fmtMoney(s5.subTotal)}</td>
         </tr>
         <tr>
            <td>GST Amount</td><td style="text-align:right; color:#dc2626;">+ ${fmtMoney(s5.gstAmount)}</td>
         </tr>
         ${data.subsidyAmount > 0 ? `
         <tr style="color:#16a34a; font-weight:bold;">
            <td>Less: Govt. Subsidy</td><td style="text-align:right;">- ${fmtMoney(data.subsidyAmount)}</td>
         </tr>` : ''}
         <tr class="financial-highlight" style="font-size:1.1rem;">
            <td><strong>Final Net Payable</strong></td>
            <td style="text-align:right;"><strong>${fmtMoney(s5.grandTotal)}</strong></td>
         </tr>
      </table>`;
  } 
  // IF SIMPLE PREVIEW (Stage 1 or 3)
  else {
      commercialHTML = `
      <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;"><i class="fas fa-coins"></i> Project Cost Estimate</h3>
      <div style="background:#fff7ed; border:1px solid #fed7aa; padding:10px; margin-bottom:10px; border-radius:4px; font-size:0.85rem; color:#9a3412;">
         <i class="fas fa-info-circle"></i> Based on: <strong>${data.costSource}</strong>. Complete Stage 5 for a precise quote.
      </div>
      <table class="output-table">
          <tr><td>Estimated Gross Cost</td><td>${fmtMoney(data.grossCapex)}</td></tr>
          ${data.subsidyAmount > 0 ? `<tr style="color:#16a34a;"><td>Est. Subsidy</td><td>- ${fmtMoney(data.subsidyAmount)}</td></tr>` : ''}
          <tr class="financial-highlight"><td><strong>Est. Net Payable</strong></td><td><strong>${fmtMoney(data.netCapex)}</strong></td></tr>
      </table>`;
  }

  // --- MAIN REPORT ASSEMBLY ---
  const output = `
    <h3 style="color: var(--primary-dark); margin-bottom: 1rem;"><i class="fas fa-building"></i> Site & Load Summary</h3>
    <table class="output-table">
      <tr><td>Project Name</td><td>${data.siteName || "Solar Project"}</td></tr>
      <tr><td>Design By</td><td>${data.designerName || '-'}</td></tr>
      <tr><td>Total Annual Load</td><td>${fmtNum(data.totalAnnualUnits, 0)} kWh</td></tr>
      <tr><td>System Size</td><td style="font-size:1.1rem; color:var(--success);"><strong>${data.systemSizeKwp.toFixed(2)} kWp</strong></td></tr>
    </table>

    <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;"><i class="fas fa-solar-panel"></i> Generation Analysis</h3>
    <table class="output-table">
      <tr><td>Specific Yield</td><td>${data.specificYieldAnnual.toFixed(1)} kWh/kWp/year</td></tr>
      <tr><td>Annual Generation</td><td>${fmtNum(data.totalAnnualEnergy, 0)} kWh</td></tr>
      <tr><td>Performance Ratio (PLF)</td><td>${(data.plfAnnual * 100).toFixed(2)}%</td></tr>
    </table>

    ${commercialHTML}

    <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;"><i class="fas fa-chart-line"></i> Financial Returns</h3>
    <table class="output-table">
      <tr><td>Current Tariff</td><td>₹${data.avgTariff.toFixed(2)} / kWh</td></tr>
      <tr><td>Year 1 Savings</td><td>${fmtMoney(data.annualSavings)}</td></tr>
      <tr><td>Payback Period</td><td>${data.payback.toFixed(1)} years</td></tr>
      <tr><td>25-Year ROI</td><td>${data.roi.toFixed(1)}%</td></tr>
      <tr class="financial-highlight">
        <td><strong>Total Lifetime Savings</strong></td>
        <td><strong>${fmtMoney(data.totalLifetimeSavings)}</strong></td>
      </tr>
    </table>

    <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;"><i class="fas fa-calendar-alt"></i> Monthly Generation</h3>
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
          ${data.monthlyTable.map(m => `
            <tr>
              <td>${m.month}</td>
              <td>${m.ghi.toFixed(2)}</td>
              <td style="font-weight:bold; color:var(--primary);">${m.energyYield.toFixed(0)}</td>
              <td>${(m.plf * 100).toFixed(1)}%</td>
            </tr>
          `).join('')}
          <tr class="table-footer">
            <td><strong>Total</strong></td>
            <td>-</td>
            <td><strong>${fmtNum(data.totalAnnualEnergy, 0)}</strong></td>
            <td><strong>${(data.plfAnnual * 100).toFixed(1)}%</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("solar-output").innerHTML = output;
}