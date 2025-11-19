// bill.js - All Electricity Bill & Summary Logic

// Add a new electricity bill
function addNewBill() {
  billCounter++;
  const billId = `bill_${billCounter}`;

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

  bills.push(billObj);
  renderBill(billObj);
  updateSummary();
}

// Render a bill card
function renderBill(bill) {
  const container = document.getElementById("bills-container");

  const billCard = document.createElement("div");
  billCard.className = "bill-card";
  billCard.id = bill.id;

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // 2. HTML Structure with Header Click Event
  billCard.innerHTML = `
    <div class="bill-header" style="cursor: pointer; user-select: none;" onclick="toggleBill('${
      bill.id
    }')">
      <div class="bill-title">
        <i class="fas fa-file-invoice"></i>
        Bill ${bills.length}
      </div>
      <div style="display: flex; align-items: center; gap: 15px;">
        <!-- The Collapse Icon -->
        <i class="fas fa-chevron-up toggle-icon" id="icon_${bill.id}"></i>
        
        ${
          bills.length > 1
            ? `<button class="remove-bill" onclick="event.stopPropagation(); removeBill('${bill.id}')" title="Remove Bill">
                 <i class="fas fa-trash"></i>
               </button>`
            : ""
        }
      </div>
    </div>
    
    <!-- The Body (Collapsible Content) -->
    <div class="bill-card-body" id="body_${bill.id}" style="display: block;">
      <div class="form-row">
        <div class="form-group">
          <label>Customer Number <span class="required">*</span></label>
          <input type="text" id="${
            bill.id
          }_customer_number" placeholder="Enter customer number" 
                 onchange="updateBillData('${
                   bill.id
                 }', 'customer_number', this.value)">
        </div>
        
        <div class="form-group">
          <label>Sanctioned Load (kW) <span class="required">*</span></label>
          <input type="number" id="${
            bill.id
          }_sanctioned_load" placeholder="e.g., 5" step="0.01" 
                 onchange="updateBillData('${
                   bill.id
                 }', 'sanctioned_load', parseFloat(this.value))">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Current Bill Month <span class="required">*</span></label>
          <input type="text" id="${
            bill.id
          }_billing_month" placeholder="e.g., Jan-24" 
                 onchange="updateBillData('${
                   bill.id
                 }', 'billing_month', this.value); autoUpdateMonthlyTable('${
    bill.id
  }')">
        </div>
        
        <div class="form-group">
          <label>Bill Amount (₹) <span class="required">*</span></label>
          <input type="number" id="${
            bill.id
          }_bill_amount" placeholder="e.g., 5000" step="0.01" 
                 onchange="updateBillData('${
                   bill.id
                 }', 'bill_amount', parseFloat(this.value))">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Units Consumed (kWh) - Current Month <span class="required">*</span></label>
          <input type="number" id="${
            bill.id
          }_current_units" placeholder="e.g., 500" step="0.01" 
                 onchange="updateBillData('${
                   bill.id
                 }', 'current_units', parseFloat(this.value)); autoUpdateMonthlyTable('${
    bill.id
  }')">
        </div>
        
        <div class="form-group">
          <label>Phase Type <span class="required">*</span></label>
          <select id="${bill.id}_phase_type" onchange="updateBillData('${
    bill.id
  }', 'phase_type', this.value)">
            <option value="Single Phase">Single Phase</option>
            <option value="Three Phase">Three Phase</option>
          </select>
        </div>
      </div>

      <!-- Direct Annual Input -->
      <div class="form-group">
        <label>Total Annual Consumption (kWh)</label>
        <input type="number" 
               id="${bill.id}_total_annual_input" 
               placeholder="Enter total kWh for the year" 
               step="0.01" 
               onchange="updateAnnualConsumptionDirectly('${
                 bill.id
               }', parseFloat(this.value))">
        <p class="helper-text" style="margin-bottom: 0; margin-top: 0.5rem; font-size: 0.8rem;">
          <i class="fas fa-info-circle"></i> Using this field will clear the monthly table below.
        </p>
      </div>
      
      <p class="helper-text" style="text-align: center; font-weight: 600; margin-bottom: 1rem;">— OR —</p>
      
      <div class="form-group">
        <label>Month-wise Consumption (12 Months)</label>
        <table class="monthly-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Units Consumed (kWh)</th>
            </tr>
          </thead>
          <tbody>
            ${months
              .map(
                (month, idx) => `
              <tr>
                <td>${month}</td>
                <td>
                  <input type="number" 
                         id="${bill.id}_month_${idx}" 
                         placeholder="0" 
                         step="0.01" 
                         onchange="updateMonthlyConsumption('${bill.id}', ${idx}, parseFloat(this.value))">
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr class="table-footer">
              <td>Total Annual Consumption</td>
              <td><strong id="${bill.id}_total_annual">0 kWh</strong></td>
            </tr>
          </tfoot>
        </table>
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
  const bill = bills.find((b) => b.id === billId);
  if (bill) {
    bill[field] = value;
    updateSummary();
  }
}

// Update a specific month's consumption
function updateMonthlyConsumption(billId, monthIndex, value) {
  const bill = bills.find((b) => b.id === billId);
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
    document.getElementById(`${bill.id}_total_annual_input`).value =
      bill.total_annual_consumption.toFixed(2);

    updateSummary();
  }
}

// Function to handle direct annual input
function updateAnnualConsumptionDirectly(billId, value) {
  const bill = bills.find((b) => b.id === billId);
  if (!bill) return;

  const numericValue = isNaN(value) ? 0 : value;

  // Set the total annual consumption directly
  bill.total_annual_consumption = numericValue;

  // Clear the 12-month table data
  for (let i = 0; i < 12; i++) {
    bill.monthly_consumption[i] = 0;
    const monthInput = document.getElementById(`${bill.id}_month_${i}`);
    if (monthInput) {
      monthInput.value = ""; // Clear inputs
    }
  }

  // Update the table footer to match
  document.getElementById(
    `${bill.id}_total_annual`
  ).textContent = `${numericValue.toFixed(2)} kWh`;

  // Update the main summary
  updateSummary();
}

// Remove a bill from the UI and the 'bills' array
function removeBill(billId) {
  if (bills.length <= 1) {
    alert("You must have at least one bill.");
    return;
  }

  bills = bills.filter((b) => b.id !== billId);
  document.getElementById(billId).remove();
  updateSummary();

  // Re-number the bill titles
  const billCards = document.querySelectorAll(".bill-card");
  billCards.forEach((card, idx) => {
    const title = card.querySelector(".bill-title");
    // Careful selector to avoid removing icon
    const textNode = Array.from(title.childNodes).find(
      (node) =>
        node.nodeType === 3 && node.textContent.trim().startsWith("Bill")
    );
    if (textNode) textNode.textContent = ` Bill ${idx + 1}`;
  });
}

// Update the summary card at the bottom
function updateSummary() {
  const totalUnits = bills.reduce(
    (sum, bill) => sum + bill.total_annual_consumption,
    0
  );

  let totalAnnualCost = 0;
  let totalBillAmounts = 0;
  let totalBillUnits = 0;

  bills.forEach((bill) => {
    if (bill.bill_amount > 0 && bill.current_units > 0) {
      totalBillAmounts += bill.bill_amount;
      totalBillUnits += bill.current_units;
    }
    const costPerUnit =
      bill.current_units > 0 ? bill.bill_amount / bill.current_units : 0;
    const billAnnualCost = bill.total_annual_consumption * costPerUnit;
    totalAnnualCost += billAnnualCost;
  });

  // Calculate Average Cost per Unit
  const avgCostPerUnit =
    totalBillUnits > 0 ? totalBillAmounts / totalBillUnits : 0;

  document.getElementById(
    "total_annual_units"
  ).textContent = `${totalUnits.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} kWh`;
  document.getElementById(
    "total_annual_cost"
  ).textContent = `₹${totalAnnualCost.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
  document.getElementById("bill_count").textContent = bills.length;

  // Update the new "Avg Cost / Unit" field
  const avgCostElem = document.getElementById("avg_cost_per_unit");
  if (avgCostElem) {
    avgCostElem.textContent = `₹${avgCostPerUnit.toFixed(2)}`;
  }
}

// Function to auto-fill monthly table from current bill
function autoUpdateMonthlyTable(billId) {
  const billMonthInput = document.getElementById(`${billId}_billing_month`);
  const currentUnitsInput = document.getElementById(`${billId}_current_units`);

  const monthString = billMonthInput.value.toLowerCase();
  const unitsValue = parseFloat(currentUnitsInput.value);

  if (isNaN(unitsValue) || unitsValue < 0) {
    return;
  }

  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  let monthIndex = -1;

  for (let i = 0; i < months.length; i++) {
    if (monthString.includes(months[i])) {
      monthIndex = i;
      break;
    }
  }

  if (monthIndex !== -1) {
    const tableInput = document.getElementById(`${billId}_month_${monthIndex}`);
    if (tableInput) {
      tableInput.value = unitsValue;
      updateMonthlyConsumption(billId, monthIndex, unitsValue);
    }
  }
}
