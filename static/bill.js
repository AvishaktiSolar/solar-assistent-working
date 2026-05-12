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
  const existingWrappers = document.querySelectorAll(".bill-card-collapse-wrapper");
  existingWrappers.forEach((wrapper) => wrapper.classList.add('collapsed'));

  // Reset all existing icons to "down" arrow
  const existingIcons = document.querySelectorAll(".toggle-icon");
  existingIcons.forEach(
    (icon) => (icon.style.transform = "rotate(180deg)")
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
  billCard.style.marginBottom = "10px";

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  billCard.innerHTML = `
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; cursor: pointer; background: #fff;" onclick="toggleBillCollapse('${bill.id}')">
      <span class="bill-title" style="font-weight: 700; color: #1e40af;"><i class="fas fa-file-invoice"></i> Bill Record #${window.bills.length}</span>
      <div style="display: flex; gap: 20px; align-items: center;">
        <i class="fas fa-chevron-up toggle-icon" id="icon_${bill.id}" style="color: #94a3b8; transition: transform 0.3s ease;"></i>
        <button onclick="event.stopPropagation(); removeBill('${bill.id}')" style="background:none; border:none; color:#f87171; padding:0; width:auto;" title="Remove Bill"><i class="fas fa-trash-alt"></i></button>
      </div>
    </div>

    <div id="collapse-wrapper-${bill.id}" class="bill-card-collapse-wrapper">
      <div class="bill-card-content">
      <div class="bill-details-left">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div class="form-group">
            <label style="font-size: 0.75rem; color: #64748b;">Consumer Number</label>
            <input type="text" id="${bill.id}_customer_number" style="font-size: 0.9rem;" placeholder="Enter customer number"
              onchange="updateBillData('${bill.id}', 'customer_number', this.value)">
          </div>
          <div class="form-group">
            <label style="font-size: 0.75rem; color: #64748b;">Sanctioned Load (kW)</label>
            <input type="number" id="${bill.id}_sanctioned_load" style="font-size: 0.9rem;" placeholder="5" step="0.01"
              onchange="updateBillData('${bill.id}', 'sanctioned_load', parseFloat(this.value))">
          </div>
          <div class="form-group">
            <label style="font-size: 0.75rem; color: #64748b;">Billing Month</label>
            <input type="month" id="${bill.id}_billing_month" style="font-size: 0.9rem;"
              onchange="updateBillData('${bill.id}', 'billing_month', this.value); autoUpdateMonthlyTable('${bill.id}')">
          </div>
          <div class="form-group">
            <label style="font-size: 0.75rem; color: #64748b;">Bill Amount (INR)</label>
            <input type="number" id="${bill.id}_bill_amount" style="font-size: 0.9rem;" placeholder="5000" step="0.01"
              onchange="updateBillData('${bill.id}', 'bill_amount', parseFloat(this.value))">
          </div>
          <div class="form-group">
            <label style="font-size: 0.75rem; color: #64748b;">Current Units (kWh)</label>
            <input type="number" id="${bill.id}_current_units" style="font-size: 0.9rem;" placeholder="500" step="0.01"
              onchange="updateBillData('${bill.id}', 'current_units', parseFloat(this.value)); autoUpdateMonthlyTable('${bill.id}')">
          </div>
          <div class="form-group">
            <label style="font-size: 0.75rem; color: #64748b;">Phase Type</label>
            <select id="${bill.id}_phase_type" style="font-size: 0.9rem;" onchange="updateBillData('${bill.id}', 'phase_type', this.value)">
              <option value="Single Phase">Single Phase</option>
              <option value="Three Phase">Three Phase</option>
            </select>
          </div>
        </div>

        <div style="border-top: 1px dashed #cbd5e1; padding-top: 15px; background: #f0f9ff; padding: 15px; border-radius: 8px;">
          <label style="color: #0369a1; font-weight: 700; font-size: 0.85rem;">Total Annual Consumption (kWh)</label>
          <input type="number" id="${bill.id}_total_annual_input" style="margin: 8px 0;" placeholder="Enter total annual kWh" step="0.01"
            onchange="updateAnnualConsumptionDirectly('${bill.id}', parseFloat(this.value))">
          <small style="color: #64748b; font-size: 0.7rem;"><i class="fas fa-info-circle"></i> Manual entry here will override the monthly table.</small>
        </div>
      </div>

      <div class="bill-monthly-right">
        <div class="monthly-grid-header">? OR ENTER MONTHLY ?</div>
        <div class="monthly-inputs-grid">
          ${months.map((month, idx) => `
            <div class="monthly-input-row">
              <span>${month}</span>
              <input type="number" id="${bill.id}_month_${idx}" value="0" step="0.01"
                onchange="updateMonthlyConsumption('${bill.id}', ${idx}, parseFloat(this.value))">
            </div>
          `).join("")}
        </div>

        <div class="monthly-total-bar">
          <strong style="font-size: 0.9rem; color: #475569;">Calculated Total:</strong>
          <strong id="${bill.id}_total_annual" style="font-size: 0.9rem; color: #16a34a;">0.00 kWh</strong>
        </div>
      </div>
    </div>
    </div>
  `;

  container.appendChild(billCard);
}
// 3. Toggle Logic: Uses max-height animation for smooth collapse
function toggleBillCollapse(billId) {
  const wrapper = document.getElementById(`collapse-wrapper-${billId}`);
  const icon = document.getElementById(`icon_${billId}`);
  
  wrapper.classList.toggle('collapsed');
  
  // Rotate icon
  if (wrapper.classList.contains('collapsed')) {
    icon.style.transform = 'rotate(180deg)';
  } else {
    icon.style.transform = 'rotate(0deg)';
  }
}

// Legacy function for backwards compatibility
function toggleBill(billId) {
  toggleBillCollapse(billId);
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

