// calc.js - Solar PV Calculation Engine (Updated with Correct Formulas)

// Function to fetch data from our Python server
async function getSolarData(lat, lon, tilt) {
  const url = "/get_data";

  let payload = {
    latitude: lat,
    longitude: lon,
  };

  if (tilt && !isNaN(tilt)) {
    payload.tilt = tilt;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  return response.json();
}

// Function for the "Fetch" button
async function fetchAndPreviewSolarData() {
  const lat = parseFloat(document.getElementById("latitude").value);
  const lon = parseFloat(document.getElementById("longitude").value);
  const tilt = parseFloat(document.getElementById("tilt_angle").value);

  const fetchButton = document.getElementById("fetch-solar-btn");
  const previewDiv = document.getElementById("solar-data-preview");

  if (!lat || !lon) {
    alert("Please enter a valid Latitude and Longitude first.");
    return;
  }

  const originalButtonHtml = fetchButton.innerHTML;
  fetchButton.innerHTML = '<span class="loading"></span> Fetching...';
  fetchButton.disabled = true;
  previewDiv.innerHTML = "";
  fetchedSolarData = null;

  try {
    const solarData = await getSolarData(lat, lon, tilt);

    if (solarData.error) {
      throw new Error(solarData.error);
    }

    fetchedSolarData = solarData; // Store data globally

    // 1. Create Header Row (Months)
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let headerHtml = "<th>Parameter</th>"; // First column
    headerHtml += months.map((m) => `<th>${m}</th>`).join("");
    headerHtml += "<th>Annual Avg</th>"; // Last column

    // 2. Create Data Rows
    const createRow = (label, key, unit, precision, annualValue) => {
      let row = `<tr><td>${label} (${unit})</td>`; // Label cell
      row += solarData.monthly_data
        .map((month) => `<td>${month[key].toFixed(precision)}</td>`)
        .join("");
      row += `<td>${annualValue.toFixed(precision)}</td>`; // Annual cell
      row += `</tr>`;
      return row;
    };

    if (!solarData.annual.ac_energy) {
      solarData.annual.ac_energy =
        solarData.monthly_data.reduce((s, m) => s + m.ac_energy, 0) / 12;
    }
    if (!solarData.annual.dc_energy) {
      solarData.annual.dc_energy =
        solarData.monthly_data.reduce((s, m) => s + m.dc_energy, 0) / 12;
    }

    const solarRow = createRow("GHI", "solar", "kWh/m²/day", 2, solarData.annual.solar);
    const poaRow = createRow("POA Irradiance", "poa", "kWh/m²/day", 2, solarData.annual.poa);
    const dcEnergyRow = createRow("DC Energy", "dc_energy", "kWh", 0, solarData.annual.dc_energy);
    const acEnergyRow = createRow("AC Energy", "ac_energy", "kWh", 0, solarData.annual.ac_energy);
    const tcellRow = createRow("Cell Temp", "tcell", "°C", 1, solarData.annual.tcell);
    const tempAvgRow = createRow("Ambient Temp", "temp_avg", "°C", 1, solarData.annual.temp_avg);
    const tempMinRow = createRow("Sim. Min Temp", "temp_min", "°C", 1, solarData.annual.temp_min);
    const tempMaxRow = createRow("Sim. Max Temp", "temp_max", "°C", 1, solarData.annual.temp_max);

    // 3. Create the full table HTML
    const tableHtml = `
      <h4 style="color: var(--text-primary);"><i class="fas fa-check-circle" style="color: var(--success-color);"></i> Fetched Solar Data Preview</h4>
      <table class="monthly-report-table">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>
          ${solarRow}
          ${poaRow}
          ${dcEnergyRow}
          ${acEnergyRow}
          ${tcellRow}
          ${tempAvgRow}
          ${tempMinRow}
          ${tempMaxRow}
        </tbody>
      </table>
    `;

    previewDiv.innerHTML = tableHtml;
  } catch (error) {
    previewDiv.innerHTML = `<span class="preview-error"><i class="fas fa-times-circle"></i> Error: ${error.message}</span>`;
  } finally {
    fetchButton.innerHTML = originalButtonHtml;
    fetchButton.disabled = false;
  }
}

// Main "Calculate" button's function
async function processFinalCalculation() {
  if (!fetchedSolarData) {
    alert('Please fetch the solar data first using the "Fetch Solar Data" button.');
    return;
  }

  const calcButton = document.getElementById("calculate-btn");

  try {
    // --- 1. Validate Site Details ---
    siteData.site_name = document.getElementById("site_name").value;
    siteData.latitude = parseFloat(document.getElementById("latitude").value);
    siteData.longitude = parseFloat(document.getElementById("longitude").value);

    if (!siteData.site_name || !siteData.latitude || !siteData.longitude) {
      alert("Please enter Site Name, Latitude, and Longitude.");
      throw new Error("Validation failed");
    }

    // --- 2. Validate Advanced Parameters ---
    const advancedInputs = [
      "savings_target", "panel_wattage", "panel_noct", 
      "temp_coefficient", "shadow_loss", "other_losses"
    ];
    for (let id of advancedInputs) {
      const input = document.getElementById(id);
      if (input.value === "" || isNaN(parseFloat(input.value))) {
         const label = document.querySelector(`label[for='${id}']`);
         const labelText = label ? label.textContent : id;
         alert(`Please enter a valid number for ${labelText}`);
         throw new Error("Validation failed");
      }
    }

    // --- 3. Validate Bills ---
    if (bills.length === 0) {
      alert("Please add at least one electricity bill");
      throw new Error("Validation failed");
    }
    for (let bill of bills) {
      if (
        !bill.customer_number || !bill.sanctioned_load ||
        !bill.billing_month || !bill.bill_amount
      ) {
        alert(`Please fill all required fields for Bill ${bills.indexOf(bill) + 1}`);
        throw new Error("Validation failed");
      }
      if (!bill.current_units || bill.current_units <= 0) {
        alert(`Please enter current month units consumed for Bill ${bills.indexOf(bill) + 1}`);
        throw new Error("Validation failed");
      }
    }
    const totalAnnualUnits = bills.reduce((sum, bill) => sum + bill.total_annual_consumption, 0);
    if (totalAnnualUnits === 0) {
      alert("Total annual consumption is 0. Please enter monthly consumption data.");
      throw new Error("Validation failed");
    }

    // --- 4. Process Calculation ---
    const originalButtonHtml = calcButton.innerHTML;
    calcButton.innerHTML = '<span class="loading"></span> Calculating...';
    calcButton.disabled = true;

    // Run calculation and save data to global object
    calculateSolarSystem(totalAnnualUnits, fetchedSolarData);

    // --- 5. Switch Pages ---
    document.getElementById("initial-input-page").classList.remove("active");
    document.getElementById("solar-panel-page").classList.add("active");

    window.scrollTo(0, 0);

    calcButton.innerHTML = originalButtonHtml;
    calcButton.disabled = false;
  } catch (error) {
    console.error("Calculation failed:", error.message);
    calcButton.innerHTML = '<i class="fas fa-arrow-right"></i> Calculate Solar Requirements';
    calcButton.disabled = false;
  }
}

//==================================================================
//          CORE SOLAR PV CALCULATION ENGINE (UPDATED)
//==================================================================
function calculateSolarSystem(totalAnnualUnits, solarData) {
  
  // --- 1. Read ALL inputs from the HTML ---
  const siteName = document.getElementById("site_name").value;
  const latitude = parseFloat(document.getElementById("latitude").value);
  const longitude = parseFloat(document.getElementById("longitude").value);
  
  // Advanced Parameters
  const savingsTargetPercent = parseFloat(document.getElementById("savings_target").value);
  const panelWattage = parseFloat(document.getElementById("panel_wattage").value);
  const panelNoct = parseFloat(document.getElementById("panel_noct").value);
  const tempCoefficient = parseFloat(document.getElementById("temp_coefficient").value) / 100; // Convert to decimal
  const shadowLoss = parseFloat(document.getElementById("shadow_loss").value) / 100; // Convert to decimal
  const fixedDerating = parseFloat(document.getElementById("other_losses").value) / 100; // Convert to decimal (0.86 = 86%)
  
  // Cost is made optional: default to 0 if empty
  const capexPerKW = parseFloat(document.getElementById("capex_per_kw").value) || 0;

  // --- 2. Calculate Bill & Tariff ---
  let totalCurrentUnits = 0;
  let totalCurrentBillAmount = 0;
  bills.forEach((bill) => {
    totalCurrentUnits += bill.current_units || 0;
    totalCurrentBillAmount += bill.bill_amount || 0;
  });

  const avgTariff = totalCurrentBillAmount / totalCurrentUnits;
  const actualAnnualCost = totalAnnualUnits * avgTariff;

  // --- 3. Days per Month ---
  const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  
  // --- 4. Extract Monthly Data ---
  const monthlyGHI = solarData.monthly_data.map(m => m.solar);
  const monthlyAmbientTemp = solarData.monthly_data.map(m => m.temp_avg);

  // --- 5. STEP 1: Calculate Cell Temperature (Tcell) ---
  // Formula: Tcell = AmbientTemp + (NOCT - 20)
  const monthlyCellTemp = monthlyAmbientTemp.map(tAmb => tAmb + (panelNoct - 20));

  // --- 6. STEP 2: Temperature Derating Factor ---
  // Formula: TempDF = 1 + (TempCoeff × (Tcell – 25))
  const monthlyTempDF = monthlyCellTemp.map(tCell => 1 + (tempCoefficient * (tCell - 25)));

  // --- 7. STEP 3: Shadow & Other Derating ---
  const shadowDF = 1 - shadowLoss;
  const otherDF = 1 - fixedDerating;

  // --- 8. STEP 4: Total Monthly Derating ---
  // Formula: TotalDF = TempDF × ShadowDF × OtherDF
  const monthlyTotalDF = monthlyTempDF.map(tempDF => tempDF * shadowDF * otherDF);

  // --- 9. INITIAL CALCULATION: Assume 1 kWp system to find specific yield ---
  let totalAnnualEnergyPerKwp = 0;
  let monthlyDataPerKwp = [];

  for (let i = 0; i < 12; i++) {
    // STEP 5: Monthly Energy Yield for 1 kWp system
    // Formula: EnergyYield = GHI × TotalDF × SystemSize(kW) × Days
    const energyYield = monthlyGHI[i] * monthlyTotalDF[i] * 1 * daysPerMonth[i];
    totalAnnualEnergyPerKwp += energyYield;
    
    monthlyDataPerKwp.push({
      month: solarData.monthly_data[i].month,
      days: daysPerMonth[i],
      ghi: monthlyGHI[i],
      ambientTemp: monthlyAmbientTemp[i],
      cellTemp: monthlyCellTemp[i],
      tempDF: monthlyTempDF[i],
      shadowDF: shadowDF,
      otherDF: otherDF,
      totalDF: monthlyTotalDF[i],
      energyYield: energyYield
    });
  }

  // STEP 6: Specific Yield Annual (kWh/kWp/year)
  const specificYieldAnnual = totalAnnualEnergyPerKwp;

  // --- 10. STEP 9: Calculate Required Panel Count ---
  // Formula: RequiredAnnualEnergy = AnnualConsumption × (TargetSaving / 100)
  const requiredAnnualEnergy = totalAnnualUnits * (savingsTargetPercent / 100);
  
  // Formula: PanelCount = RequiredAnnualEnergy / (SpecificYieldAnnual × PanelWatt / 1000)
  const panelCountExact = requiredAnnualEnergy / (specificYieldAnnual * (panelWattage / 1000));
  const panelCount = Math.ceil(panelCountExact); // Round UP
  
  // Final System Size in kWp
  const systemSizeKwp = (panelCount * panelWattage) / 1000;

  // --- 11. RECALCULATE with Actual System Size ---
  let totalAnnualEnergy = 0;
  let monthlyTable = [];

  for (let i = 0; i < 12; i++) {
    // STEP 5: Monthly Energy Yield with actual system size
    const energyYield = monthlyGHI[i] * monthlyTotalDF[i] * systemSizeKwp * daysPerMonth[i];
    
    // STEP 7: Specific Yield Monthly (kWh/kWp/day)
    const specificYieldMonthly = energyYield / (systemSizeKwp * daysPerMonth[i]);
    
    // STEP 8: Plant Load Factor (PLF)
    const plfMonthly = energyYield / (systemSizeKwp * 24 * daysPerMonth[i]);
    
    totalAnnualEnergy += energyYield;
    
    monthlyTable.push({
      month: solarData.monthly_data[i].month,
      days: daysPerMonth[i],
      ghi: monthlyGHI[i],
      ambientTemp: monthlyAmbientTemp[i],
      cellTemp: monthlyCellTemp[i],
      tempDF: monthlyTempDF[i],
      shadowDF: shadowDF,
      otherDF: otherDF,
      totalDF: monthlyTotalDF[i],
      energyYield: energyYield,
      specificYield: specificYieldMonthly,
      plf: plfMonthly
    });
  }

  // STEP 6 (Final): Total Annual Energy & Averages
  const averageDailyEnergy = totalAnnualEnergy / 365;
  const specificYieldActual = totalAnnualEnergy / systemSizeKwp;
  
  // STEP 8 (Annual PLF)
  const plfAnnual = totalAnnualEnergy / (systemSizeKwp * 24 * 365);

  // --- 12. Financial Calculations ---
  const achievedSavingsPercent = (totalAnnualEnergy / totalAnnualUnits) * 100;
  const capex = systemSizeKwp * capexPerKW;
  const annualSavings = totalAnnualEnergy * avgTariff;
  const postSolarCost = (totalAnnualUnits - totalAnnualEnergy) * avgTariff;
  const payback = annualSavings > 0 ? capex / annualSavings : 0;
  const roi = (payback > 0) ? (1 / payback) * 100 : 0;

  // --- 13. Save data for export ---
  finalReportData = {
    siteName: siteName,
    latitude: latitude,
    longitude: longitude,
    totalAnnualUnits: totalAnnualUnits,
    savingsTargetPercent: savingsTargetPercent,
    
    // Panel & System Info
    panelWattage: panelWattage,
    panelCount: panelCount,
    systemSizeKwp: systemSizeKwp,
    
    // Energy Yields
    specificYieldAnnual: specificYieldActual,
    totalAnnualEnergy: totalAnnualEnergy,
    averageDailyEnergy: averageDailyEnergy,
    achievedSavingsPercent: achievedSavingsPercent,
    plfAnnual: plfAnnual,
    
    // Financial
    avgTariff: avgTariff,
    actualAnnualCost: actualAnnualCost,
    capex: capex,
    annualSavings: annualSavings,
    postSolarCost: (postSolarCost < 0 ? 0 : postSolarCost),
    payback: payback,
    roi: roi,
    
    // Monthly Breakdown
    monthlyTable: monthlyTable,
    
    // Parameters used
    panelNoct: panelNoct,
    tempCoefficient: tempCoefficient * 100, // Store as percentage
    shadowLoss: shadowLoss * 100,
    fixedDerating: fixedDerating * 100
  };

  // --- 14. Generate HTML for the report page ---
  const output = `
    <h3 style="color: var(--primary-dark); margin-bottom: 1rem;"><i class="fas fa-building"></i> Site & Load Summary</h3>
    <table class="output-table">
      <tr><td>Site Name</td><td>${finalReportData.siteName}</td></tr>
      <tr><td>Site Coordinates</td><td>${finalReportData.latitude.toFixed(4)}, ${finalReportData.longitude.toFixed(4)}</td></tr>
      <tr><td>Total Annual Load</td><td>${finalReportData.totalAnnualUnits.toLocaleString("en-IN")} kWh</td></tr>
      <tr><td>Desired Savings Target</td><td>${finalReportData.savingsTargetPercent.toFixed(0)}%</td></tr>
    </table>

    <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;"><i class="fas fa-solar-panel"></i> Recommended Solar System</h3>
    <table class="output-table">
      <tr><td>Required Panel Count</td><td>${finalReportData.panelCount} panels × ${finalReportData.panelWattage}Wp</td></tr>
      <tr><td>Final System Size</td><td>${finalReportData.systemSizeKwp.toFixed(2)} kWp</td></tr>
      <tr><td>Specific Yield (Annual)</td><td>${finalReportData.specificYieldAnnual.toFixed(1)} kWh/kWp/year</td></tr>
      <tr><td>Total Annual Energy Yield</td><td>${finalReportData.totalAnnualEnergy.toFixed(0)} kWh/year</td></tr>
      <tr><td>Average Daily Energy</td><td>${finalReportData.averageDailyEnergy.toFixed(1)} kWh/day</td></tr>
      <tr><td>Annual PLF</td><td>${(finalReportData.plfAnnual * 100).toFixed(2)}%</td></tr>
      <tr><td>Achieved Savings</td><td>${finalReportData.achievedSavingsPercent.toFixed(1)}%</td></tr>
    </table>

    <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;"><i class="fas fa-chart-line"></i> Financial Analysis</h3>
    <table class="output-table">
      <tr><td>Average Cost per Unit</td><td>₹${finalReportData.avgTariff.toFixed(2)} / kWh</td></tr>
      <tr><td>Current Annual Bill</td><td>₹${finalReportData.actualAnnualCost.toLocaleString("en-IN")}</td></tr>
      <tr><td>Est. System Cost (CAPEX)</td><td>₹${finalReportData.capex.toLocaleString("en-IN")}</td></tr>
      <tr class="financial-highlight">
        <td><strong>Est. Annual Savings</strong></td>
        <td><strong>₹${finalReportData.annualSavings.toLocaleString("en-IN")}</strong></td>
      </tr>
      <tr><td>Post-Solar Annual Bill</td><td>₹${finalReportData.postSolarCost.toLocaleString("en-IN")}</td></tr>
      <tr><td>Payback Period</td><td>${finalReportData.payback.toFixed(1)} years</td></tr>
      <tr><td>Return on Investment (ROI)</td><td>${finalReportData.roi.toFixed(1)}% per year</td></tr>
      <tr class="financial-highlight">
        <td><strong>Est. 25-Year Savings</strong></td>
        <td><strong>₹${(finalReportData.annualSavings * 25).toLocaleString("en-IN")}</strong></td>
      </tr>
    </table>

    <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;"><i class="fas fa-calendar-alt"></i> Monthly Performance Analysis</h3>
    <div style="overflow-x: auto;">
      <table class="monthly-report-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Days</th>
            <th>GHI<br>(kWh/m²/day)</th>
            <th>Amb. Temp<br>(°C)</th>
            <th>Cell Temp<br>(°C)</th>
            <th>Temp<br>Derate</th>
            <th>Shadow<br>Derate</th>
            <th>Other<br>Derate</th>
            <th>Total<br>Derate</th>
            <th>Energy Yield<br>(kWh)</th>
            <th>Sp. Yield<br>(kWh/kWp/day)</th>
            <th>PLF<br>(%)</th>
          </tr>
        </thead>
        <tbody>
          ${finalReportData.monthlyTable.map(m => `
            <tr>
              <td>${m.month}</td>
              <td>${m.days}</td>
              <td>${m.ghi.toFixed(2)}</td>
              <td>${m.ambientTemp.toFixed(1)}</td>
              <td>${m.cellTemp.toFixed(1)}</td>
              <td>${m.tempDF.toFixed(3)}</td>
              <td>${m.shadowDF.toFixed(3)}</td>
              <td>${m.otherDF.toFixed(3)}</td>
              <td>${m.totalDF.toFixed(3)}</td>
              <td>${m.energyYield.toFixed(0)}</td>
              <td>${m.specificYield.toFixed(2)}</td>
              <td>${(m.plf * 100).toFixed(2)}%</td>
            </tr>
          `).join('')}
          <tr class="table-footer">
            <td><strong>Annual</strong></td>
            <td><strong>365</strong></td>
            <td><strong>${(monthlyGHI.reduce((a, b) => a + b, 0) / 12).toFixed(2)}</strong></td>
            <td><strong>${(monthlyAmbientTemp.reduce((a, b) => a + b, 0) / 12).toFixed(1)}</strong></td>
            <td><strong>${(finalReportData.monthlyTable.reduce((a, b) => a + b.cellTemp, 0) / 12).toFixed(1)}</strong></td>
            <td><strong>${(finalReportData.monthlyTable.reduce((a, b) => a + b.tempDF, 0) / 12).toFixed(3)}</strong></td>
            <td><strong>${shadowDF.toFixed(3)}</strong></td>
            <td><strong>${otherDF.toFixed(3)}</strong></td>
            <td><strong>${(finalReportData.monthlyTable.reduce((a, b) => a + b.totalDF, 0) / 12).toFixed(3)}</strong></td>
            <td><strong>${finalReportData.totalAnnualEnergy.toFixed(0)}</strong></td>
            <td><strong>${(finalReportData.specificYieldAnnual / 365).toFixed(2)}</strong></td>
            <td><strong>${(finalReportData.plfAnnual * 100).toFixed(2)}%</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3 style="color: var(--primary-dark); margin-top: 2rem; margin-bottom: 1rem;"><i class="fas fa-cog"></i> Calculation Parameters Used</h3>
    <table class="output-table">
      <tr><td>Panel NOCT</td><td>${finalReportData.panelNoct}°C</td></tr>
      <tr><td>Temperature Coefficient</td><td>${finalReportData.tempCoefficient.toFixed(2)}% per °C</td></tr>
      <tr><td>Shadow Loss</td><td>${finalReportData.shadowLoss.toFixed(0)}%</td></tr>
      <tr><td>Fixed Derating (Other Losses)</td><td>${finalReportData.fixedDerating.toFixed(0)}%</td></tr>
    </table>
  `;

  document.getElementById("solar-output").innerHTML = output;
}

// Go back to input page
function goBackToInput() {
  document.getElementById("solar-panel-page").classList.remove("active");
  document.getElementById("initial-input-page").classList.add("active");
  window.scrollTo(0, 0);
  finalReportData = {};
}