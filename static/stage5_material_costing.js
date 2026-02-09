// ==================================================================
//  stage5.js - Final Commercial Aggregator & BoQ Engine (Fixed)
// ==================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Initial load is handled by the tab switch event in main.js
});

function refreshStage5UI() {
  // 1. ROBUST DATA FETCHING (Live Sync Fix)
  const globalData = window.projectData || {};
  const s1Root = globalData.stage1 || {};

  // Merge Design (Live Header Data) + Parameters + Root
  const s1 = {
    ...s1Root,
    ...(globalData.design || s1Root.design || {}),
    ...(globalData.parameters || s1Root.parameters || {}),
  };

  const s2 = globalData.strings || {};
  const s3 = globalData.stage3 || {};
  const s4 = globalData.stage4 || {};

  console.log("Stage 5 Live Data:", { s1, s2 });

  // --- CLEAR TABLES ---
  const majorBody = document.getElementById("boq_major_body");
  const bosBody = document.getElementById("boq_bos_body");
  const servBody = document.getElementById("boq_services_body");

  if (majorBody) majorBody.innerHTML = "";
  if (bosBody) bosBody.innerHTML = "";
  if (servBody) servBody.innerHTML = "";

  // ==========================================
  // A. MAJOR COMPONENTS
  // ==========================================

  // 1. PANELS (Calculated Rate)
  let panelRate = 13500;
  const capexPerKw = parseFloat(s1.capexPerKw || document.getElementById("capex_per_kw")?.value || 0);
  const watts = parseFloat(s1.panelWattage || 0);

  if (capexPerKw > 0 && watts > 0) {
    panelRate = (capexPerKw / 1000) * watts;
  }

  addBoQRow(
    majorBody,
    "panel",
    "PV Modules (Solar Panels)",
    `${s1.panelWattage || 550}Wp ${s1.panelType || "Mono/Bifacial"}`,
    s1.panelCount || 0, // <--- This now updates instantly
    panelRate
  );

  // 2. INVERTER
  addBoQRow(
    majorBody,
    "inverter",
    "Solar Inverter",
    s2.inverterModel || "Grid Tie Inverter",
    s2.inverterCount || 1,
    45000
  );

  // 3. STRUCTURE
  addBoQRow(
    majorBody,
    "structure",
    "Module Mounting Structure",
    s1.structureType || "Hot Dip Galvanized",
    (s1.systemSizeKwp || 0).toFixed(2),
    4500
  );

  // ==========================================
  // B. BALANCE OF SYSTEM
  // ==========================================

  // AC CABLE
  const acCableName = s4.cableSelected || "AC Cable (Armored)";
  const acLen = s4.totalLength || 35;
  addBoQRow(bosBody, "ac_cable", "AC Cable (4C Armored)", acCableName, acLen, 280);

  // DC CABLE
  const dcCableItem = s3.dc?.cable;
  let dcLen = 0;
  let dcRate = 45;

  if (dcCableItem && parseFloat(dcCableItem.qty) > 0) {
    dcLen = parseFloat(dcCableItem.qty);
    if (parseFloat(dcCableItem.cost) > 0) {
      dcRate = parseFloat(dcCableItem.cost) / dcLen;
    }
  } else {
    dcLen = Math.ceil((s1.panelCount || 0) * 6);
  }

  addBoQRow(bosBody, "dc_cable", "DC Solar Cable", dcCableItem?.item || "DC Cable 4sqmm", dcLen, dcRate);

  // CIVIL
  const civilData = s4.civil || {};
  const blockCount = parseFloat(civilData.blocks) || 0;
  const adhesiveName = civilData.adhesive || "Adhesive";

  let civilRate = 450;
  if (blockCount > 0 && civilData.totalCost) {
    const totalCivil = parseFloat(civilData.totalCost.replace(/[^\d.]/g, "")) || 0;
    civilRate = totalCivil / blockCount;
  } else if (blockCount === 0) {
    civilData.blocks = 40;
  }

  addBoQRow(
    bosBody,
    "civil_found",
    "Civil Foundation Kit",
    `Concrete Blocks + ${adhesiveName}`,
    blockCount || 40,
    civilRate.toFixed(2)
  );

  // PROTECTION
  const mcbName = s3.ac?.mcb?.item || "AC Protection";
  addBoQRow(bosBody, "ac_mcb", "Switchgear / Protection", mcbName, 1, 3500);

  // MC4
  const mc4Qty = Math.ceil((s1.panelCount || 0) * 2.2);
  addBoQRow(bosBody, "mc4", "MC4 Connectors (Pair)", "IP68 Rated", mc4Qty, 150);

  // EARTHING & CONDUIT
  addBoQRow(bosBody, "earthing", "Earthing Kit (3 Pits)", "Rod (1.2m) + Bag + Strip", 1, 9500);
  addBoQRow(bosBody, "conduit", "PVC/Flexible Conduits", "25mm / 32mm", 40, 65);

  // ==========================================
  // C. SERVICES
  // ==========================================
  const sysSizeKw = s1.systemSizeKwp || 0;

  addBoQRow(servBody, "install", "Installation & Commissioning", "Civil & Elec Execution", sysSizeKw.toFixed(2), 3500);
  addBoQRow(servBody, "transport", "Transportation & Logistics", "Site Delivery", 1, 6000);
  addBoQRow(servBody, "net_meter", "Net Metering Liaisoning", "Documentation & Govt Fees", 1, 15000);

  // ==========================================
  // D. SUBSIDY LOGIC
  // ==========================================
  let subsidy = 0;
  const isSubsidyProject = document.getElementById("project_type")?.value.includes("Subsidy");

  if (isSubsidyProject) {
    if (sysSizeKw <= 2) subsidy = sysSizeKw * 30000;
    else if (sysSizeKw <= 3) subsidy = 60000 + (sysSizeKw - 2) * 18000;
    else subsidy = 78000;
  }

  const manualSub = parseFloat(document.getElementById("subsidy_amount")?.value);
  if (manualSub > 0) subsidy = manualSub;

  const subDisplay = document.getElementById("s5_subsidy_amt");
  if (subDisplay) subDisplay.innerText = subsidy.toLocaleString("en-IN");

  window.stage5Subsidy = subsidy;

  // Trigger Final Math
  calcStage5();
}

// --- HELPER: Add Row to Table ---
function addBoQRow(tbody, id, desc, spec, qty, rate) {
  if (!tbody) return;

  const q = parseFloat(qty) || 0;
  const r = parseFloat(rate) || 0;
  const total = q * r;

  const tr = document.createElement("tr");
  tr.innerHTML = `
        <td class="col-desc">${desc}</td>
        <td class="col-spec">${spec}</td>
        <td class="col-qty"><span id="qty_${id}">${q}</span></td>
        <td class="col-rate">
            <input type="number" class="cost-input item-rate" id="rate_${id}" value="${r.toFixed(
              2
            )}" onchange="calcStage5()">
        </td>
        <td class="col-total" id="total_${id}">${total.toLocaleString("en-IN", {
          maximumFractionDigits: 0,
        })}</td>
    `;
  tbody.appendChild(tr);
}

// --- CALCULATION ENGINE ---
window.calcStage5 = function () {
  let subTotal = 0;

  // 1. Iterate over all rows with 'item-rate' class
  const inputs = document.querySelectorAll(".item-rate");

  inputs.forEach(input => {
    const row = input.closest("tr");
    if (!row) return;

    // Get Quantity
    const qtySpan = row.querySelector('span[id^="qty_"]');
    const qty = parseFloat(qtySpan.innerText) || 0;

    // Get Current Rate (User may have edited it)
    const rate = parseFloat(input.value) || 0;

    // Calc Line Total
    const lineTotal = qty * rate;
    subTotal += lineTotal;

    // Update Line Display
    const totalCell = row.querySelector(".col-total");
    if (totalCell)
      totalCell.innerText = lineTotal.toLocaleString("en-IN", {
        maximumFractionDigits: 0,
      });
  });

  // 2. Update Subtotal
  document.getElementById("val_subtotal").innerText = subTotal.toLocaleString("en-IN");

  // 3. GST Calculation
  const gstVal = document.getElementById("gst_mode")?.value || 13.8; // Default composite GST
  const gstPercent = parseFloat(gstVal);
  const gstAmt = subTotal * (gstPercent / 100);
  document.getElementById("val_gst").innerText = gstAmt.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  // 4. Grand Total & Subsidy
  let grandTotal = subTotal + gstAmt;

  const subsidyCheck = document.getElementById("apply_subsidy");
  if (subsidyCheck && subsidyCheck.checked) {
    grandTotal -= window.stage5Subsidy || 0;
  }

  if (grandTotal < 0) grandTotal = 0; // Safety

  document.getElementById("val_grand_total").innerText = grandTotal.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });

  // 5. Cost Per Watt
  const sysSize = parseFloat(window.projectData?.stage1?.systemSizeKwp || 0);
  if (sysSize > 0) {
    const cpw = grandTotal / (sysSize * 1000);
    const cpwEl = document.getElementById("val_cpw");
    if (cpwEl) cpwEl.innerText = cpw.toFixed(2);
  }

  // 6. Save Global State
  window.projectData.stage5 = {
    grandTotal: grandTotal,
    subTotal: subTotal,
    gstAmount: gstAmt,
    itemized: {
      panels: getRowTotal("panel"),
      inverter: getRowTotal("inverter"),
      structure: getRowTotal("structure"),
      bos:
        subTotal -
        (getRowTotal("panel") +
          getRowTotal("inverter") +
          getRowTotal("structure") +
          getRowTotal("install") +
          getRowTotal("transport") +
          getRowTotal("net_meter")),
      installation: getRowTotal("install") + getRowTotal("transport") + getRowTotal("net_meter"),
    },
  };
};

// Helper to extract specific category totals for the final report chart
function getRowTotal(id) {
  const el = document.getElementById(`total_${id}`);
  if (el) {
    return parseFloat(el.innerText.replace(/,/g, "")) || 0;
  }
  return 0;
}
