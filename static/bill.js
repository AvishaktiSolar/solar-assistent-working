// ==================================================================
//  bill.js - All Electricity Bill & Summary Logic
// ==================================================================

// Ensure global variables are initialized
window.bills = window.bills || [];
window.billCounter = window.billCounter || 0;

// Add a new electricity bill
function addNewBill() {
  window.billCounter++;
  const billId = `bill_${window.billCounter}`;

  const billObj = {
    id: billId,
    customer_number: "",
    sanctioned_load: 0,
    billing_month: "",
    bill_amount: 0,
    current_units: 0,
    phase_type: "Single Phase",
    monthly_consumption: Array(12).fill(0),
    total_annual_consumption: 0,
  };

  // 1. Auto-Collapse Feature: Close all existing bills before adding a new one
  const existingBodies = document.querySelectorAll(".bill-card-body");
  existingBodies.forEach((body) => (body.style.display = "none"));

  // Reset all existing icons to "down" arrow
  const existingIcons = document.querySelectorAll(".toggle-icon");
  existingIcons.forEach(
    (icon) => (icon.className = "fas fa-chevron-down toggle-icon")
  );

  // Hide empty state if it exists
  const emptyState = document.getElementById("bills-empty-state");
  if (emptyState) emptyState.style.display = "none";

  window.bills.push(billObj);
  renderBill(billObj);
  updateSummary();
}

// Render a bill card
function renderBill(bill) {
  const container = document.getElementById("bills-container");

  const billCard = document.createElement("div");
  billCard.className = "bill-card";
  billCard.id = bill.id;
  // Basic styling for the card to look distinct
  billCard.style.border = "1px solid #e2e8f0";
  billCard.style.marginBottom = "10px";
  billCard.style.borderRadius = "8px";
  billCard.style.backgroundColor = "#fff";

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // 2. HTML Structure with Header Click Event
  billCard.innerHTML = `
    <div class="bill-header" style="cursor: pointer; user-select: none; padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;" onclick="toggleBill('${bill.id}')">
      <div class="bill-title" style="font-weight: 600; color: var(--primary);">
        <i class="fas fa-file-invoice"></i>
        Bill ${window.bills.length}
      </div>
      <div style="display: flex; align-items: center; gap: 15px;">
        <i class="fas fa-chevron-up toggle-icon" id="icon_${bill.id}"></i>
        
        <button class="btn btn-sm text-danger" onclick="event.stopPropagation(); removeBill('${bill.id}')" title="Remove Bill" style="border: none; background: transparent;">
             <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
    
    <div class="bill-card-body" id="body_${bill.id}" style="display: block; padding: 15px;">
      <div class="mini-row">
        <div class="form-group half-width">
          <label>Consumer Number</label>
          <input type="text" id="${bill.id}_customer_number" placeholder="Enter customer number" 
                 onchange="updateBillData('${bill.id}', 'customer_number', this.value)">
        </div>
        
        <div class="form-group half-width">
          <label>Sanctioned Load (kW)</label>
          <input type="number" id="${bill.id}_sanctioned_load" placeholder="e.g., 5" step="0.01" 
                 onchange="updateBillData('${bill.id}', 'sanctioned_load', parseFloat(this.value))">
        </div>
      </div>
      
      <div class="mini-row">
        <div class="form-group half-width">
          <label>Billing Month</label>
           <input type="month" id="${bill.id}_billing_month" 
                 onchange="updateBillData('${bill.id}', 'billing_month', this.value); autoUpdateMonthlyTable('${bill.id}')">
        </div>
        
        <div class="form-group half-width">
          <label>Bill Amount (₹)</label>
          <input type="number" id="${bill.id}_bill_amount" placeholder="e.g., 5000" step="0.01" 
                 onchange="updateBillData('${bill.id}', 'bill_amount', parseFloat(this.value))">
        </div>
      </div>
      
      <div class="mini-row">
        <div class="form-group half-width">
          <label>Units (kWh) - Current</label>
          <input type="number" id="${bill.id}_current_units" placeholder="e.g., 500" step="0.01" 
                 onchange="updateBillData('${bill.id}', 'current_units', parseFloat(this.value)); autoUpdateMonthlyTable('${bill.id}')">
        </div>
        
        <div class="form-group half-width">
          <label>Phase Type</label>
          <select id="${bill.id}_phase_type" onchange="updateBillData('${bill.id}', 'phase_type', this.value)">
            <option value="Single Phase">Single Phase</option>
            <option value="Three Phase">Three Phase</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
        <label style="color: var(--primary-dark); font-weight: bold;">Total Annual Consumption (kWh)</label>
        <input type="number" 
               id="${bill.id}_total_annual_input" 
               placeholder="Enter total kWh for the year" 
               step="0.01" 
               style="font-weight: bold; border-color: var(--primary);"
               onchange="updateAnnualConsumptionDirectly('${bill.id}', parseFloat(this.value))">
        <p class="helper-text" style="margin-bottom: 0; margin-top: 0.5rem; font-size: 0.75rem; color: #64748b;">
          <i class="fas fa-info-circle"></i> Entering value here overrides the monthly table.
        </p>
      </div>
      
      <div class="text-center" style="margin: 10px 0; font-size: 0.8rem; color: #94a3b8; font-weight: 600;">— OR ENTER MONTHLY —</div>
      
      <div class="form-group">
        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 4px;">
            <table class="table table-sm table-striped" style="margin-bottom: 0; font-size: 0.85rem;">
            <thead style="position: sticky; top: 0; background: #f1f5f9;">
                <tr>
                <th>Month</th>
                <th>Units (kWh)</th>
                </tr>
            </thead>
            <tbody>
                ${months.map((month, idx) => `
                <tr>
                    <td>${month}</td>
                    <td style="padding: 2px;">
                    <input type="number" 
                            id="${bill.id}_month_${idx}" 
                            placeholder="0" 
                            step="0.01" 
                            style="width: 100%; border: none; background: transparent; padding: 4px;"
                            onchange="updateMonthlyConsumption('${bill.id}', ${idx}, parseFloat(this.value))">
                    </td>
                </tr>
                `).join("")}
            </tbody>
            </table>
        </div>
        <div style="background: #f8fafc; padding: 8px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 4px 4px; display: flex; justify-content: space-between; font-weight: bold; font-size: 0.9rem;">
            <span>Total:</span>
            <span id="${bill.id}_total_annual">0.00 kWh</span>
        </div>
      </div>
    </div>
  `;

  container.appendChild(billCard);
}

// 3. Toggle Logic: Hides body, swaps icon
function toggleBill(billId) {
  const body = document.getElementById(`body_${billId}`);
  const icon = document.getElementById(`icon_${billId}`);

  if (body.style.display === "none") {
    body.style.display = "block";
    icon.className = "fas fa-chevron-up toggle-icon"; // Arrow Up
  } else {
    body.style.display = "none";
    icon.className = "fas fa-chevron-down toggle-icon"; // Arrow Down
  }
}

// Update bill data in the global 'bills' array
function updateBillData(billId, field, value) {
  const bill = window.bills.find((b) => b.id === billId);
  if (bill) {
    bill[field] = value;
    updateSummary();
  }
}

// Update a specific month's consumption
function updateMonthlyConsumption(billId, monthIndex, value) {
  const bill = window.bills.find((b) => b.id === billId);
  if (bill) {
    const numericValue = isNaN(value) ? 0 : value;
    bill.monthly_consumption[monthIndex] = numericValue;
    bill.total_annual_consumption = bill.monthly_consumption.reduce(
      (sum, val) => sum + val,
      0
    );

    document.getElementById(
      `${bill.id}_total_annual`
    ).textContent = `${bill.total_annual_consumption.toFixed(2)} kWh`;
    
    // Sync the table total back to the direct input field
    const directInput = document.getElementById(`${bill.id}_total_annual_input`);
    if(directInput) directInput.value = bill.total_annual_consumption.toFixed(2);

    updateSummary();
  }
}

// Function to handle direct annual input
function updateAnnualConsumptionDirectly(billId, value) {
  const bill = window.bills.find((b) => b.id === billId);
  if (!bill) return;

  const numericValue = isNaN(value) ? 0 : value;

  // Set the total annual consumption directly
  bill.total_annual_consumption = numericValue;

  // Clear the 12-month table data inputs visually but not strictly logically required if we prioritize total
  for (let i = 0; i < 12; i++) {
    // We don't necessarily zero out the array, but we clear the inputs to avoid confusion
    const monthInput = document.getElementById(`${bill.id}_month_${i}`);
    if (monthInput) {
      monthInput.value = ""; 
    }
  }
  // Zero out array if user types directly (optional, keeps data clean)
  bill.monthly_consumption.fill(0);

  // Update the table footer to match
  document.getElementById(
    `${bill.id}_total_annual`
  ).textContent = `${numericValue.toFixed(2)} kWh`;

  // Update the main summary
  updateSummary();
}

// Remove a bill from the UI and the 'bills' array
function removeBill(billId) {
  window.bills = window.bills.filter((b) => b.id !== billId);
  const element = document.getElementById(billId);
  if(element) element.remove();
  
  updateSummary();

  // Re-number the bill titles
  const billCards = document.querySelectorAll(".bill-card");
  billCards.forEach((card, idx) => {
    const title = card.querySelector(".bill-title");
    // Careful selector to avoid removing icon
    // We just replace the text content part
    title.innerHTML = `<i class="fas fa-file-invoice"></i> Bill ${idx + 1}`;
  });

  // Show empty state if no bills left
  if (window.bills.length === 0) {
      const emptyState = document.getElementById("bills-empty-state");
      if (emptyState) emptyState.style.display = "block";
  }
}

// Update the summary card at the bottom
function updateSummary() {
  const totalUnits = window.bills.reduce(
    (sum, bill) => sum + (bill.total_annual_consumption || 0),
    0
  );

  let totalAnnualCost = 0;
  let totalBillAmounts = 0;
  let totalBillUnits = 0;

  window.bills.forEach((bill) => {
    if (bill.bill_amount > 0 && bill.current_units > 0) {
      totalBillAmounts += bill.bill_amount;
      totalBillUnits += bill.current_units;
    }
    const costPerUnit =
      bill.current_units > 0 ? bill.bill_amount / bill.current_units : 0;
    
    // Annual Cost Estimate
    const billAnnualCost = bill.total_annual_consumption * costPerUnit;
    totalAnnualCost += billAnnualCost;
  });

  // Calculate Average Cost per Unit
  const avgCostPerUnit =
    totalBillUnits > 0 ? totalBillAmounts / totalBillUnits : 0;

  // Update UI Elements
  const unitsElem = document.getElementById("total_annual_units");
  if(unitsElem) unitsElem.textContent = `${totalUnits.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kWh`;
  
  const costElem = document.getElementById("total_annual_cost");
  if(costElem) costElem.textContent = `₹${totalAnnualCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  
  const countElem = document.getElementById("bill_count");
  if(countElem) countElem.textContent = window.bills.length;

  // Update the "Avg Cost / Unit" field
  const avgCostElem = document.getElementById("avg_cost_per_unit");
  if (avgCostElem) {
    avgCostElem.textContent = `₹${avgCostPerUnit.toFixed(2)}`;
  }
}

// Function to auto-fill monthly table from current bill
// This is a "Smart" feature: if user enters Jan and 100 units, it puts 100 in Jan slot
function autoUpdateMonthlyTable(billId) {
  const billMonthInput = document.getElementById(`${billId}_billing_month`);
  const currentUnitsInput = document.getElementById(`${billId}_current_units`);

  // Handle month input (type="month" gives YYYY-MM format)
  const monthValue = billMonthInput.value; // "2023-01"
  const unitsValue = parseFloat(currentUnitsInput.value);

  if (!monthValue || isNaN(unitsValue) || unitsValue < 0) {
    return;
  }

  // Extract month index (0-11) from "YYYY-MM"
  const monthIndex = parseInt(monthValue.split("-")[1], 10) - 1;

  if (monthIndex >= 0 && monthIndex <= 11) {
    const tableInput = document.getElementById(`${billId}_month_${monthIndex}`);
    if (tableInput) {
      tableInput.value = unitsValue;
      updateMonthlyConsumption(billId, monthIndex, unitsValue);
    }
  }
}