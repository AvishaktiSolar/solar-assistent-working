// ==================================================================
//  stage5.js - Final Commercial Aggregator & BoQ Engine (Fixed)
// ==================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Initial load is handled by the tab switch event in main.js
});

const FAB_DEFAULT_WATT_OPTIONS = [580, 550];
const FAB_RATE_MAP = {
  fixed: 5.5,
  "580": 5.44,
  "550": 5.2,
  "1R": 4.5,
  "2R": 5.0,
  "3R": 6.0,
};
let stage5MaterialCatalog = null;

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadStage5MaterialCatalog() {
  if (stage5MaterialCatalog) return stage5MaterialCatalog;
  try {
    const res = await fetch("/procurement/api/get_stage5_materials");
    if (!res.ok) throw new Error(`stage5 materials failed (${res.status})`);
    stage5MaterialCatalog = await res.json();
    return stage5MaterialCatalog;
  } catch (e) {
    console.warn("Failed to load Stage 5 material catalog, using fallback defaults.", e);
    stage5MaterialCatalog = {
      civil_foundation: [],
      civil_adhesive: [],
      conduits: [],
    };
    return stage5MaterialCatalog;
  }
}

function fillCivilDropdowns(catalog) {
  const foundationSel = document.getElementById("civil_make_s5");
  const adhesiveSel = document.getElementById("adhesive_make_s5");
  
  if (!foundationSel || !adhesiveSel) return;

  const foundationItems = Array.isArray(catalog?.civil_foundation) ? catalog.civil_foundation : [];
  const adhesiveItems = Array.isArray(catalog?.civil_adhesive) ? catalog.civil_adhesive : [];

  // Blocks Dropdown
  if (foundationItems.length > 0) {
    foundationSel.innerHTML = `<option value="">-- Select Block Type --</option>
      <option value="none">❌ None (Direct Stick - MyBond)</option>` + 
      foundationItems.map((m) => {
        const rate = parseFloat(m?.rate) || 0;
        const adhKg = parseFloat(m?.specifications?.adhesive_kg_per_block) || 0;
        return `<option value="${escHtml(m.name)}" data-rate="${rate}" data-adhkg="${adhKg}" data-id="${m.id}">${escHtml(m.name)} (₹ ${rate.toLocaleString("en-IN")})</option>`;
      }).join("");
  } else {
    foundationSel.innerHTML = `<option value="">-- Select Block Type --</option><option value="none">❌ None (Direct Stick - MyBond)</option>`;
  }

  // Adhesive Dropdown
  if (adhesiveItems.length > 0) {
    adhesiveSel.innerHTML = adhesiveItems.map((m) => {
      const rate = parseFloat(m?.rate) || 0;
      return `<option value="${escHtml(m.name)}" data-rate="${rate}" data-id="${m.id}">${escHtml(m.name)} (₹ ${rate.toLocaleString("en-IN")}/ml)</option>`;
    }).join("");
  } else {
    adhesiveSel.innerHTML = `<option value="">-- Select Adhesive --</option><option value="MyBond MetLock">MyBond MetLock</option>`;
  }
}

async function refreshStage5UI() {
  await loadStage5MaterialCatalog();
  fillCivilDropdowns(stage5MaterialCatalog);

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

  const toNum = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const cleaned = String(v).replace(/[^0-9.-]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  };
  const cleanItemText = (txt) => {
    const raw = String(txt || "").trim();
    if (!raw || raw === "-") return "-";
    return raw.replace(/\s*\(Default:.*?\)\s*$/i, "").trim();
  };
  const isMeaningfulSelection = (txt) => {
    const v = cleanItemText(txt);
    if (!v || v === "-") return false;
    return !/^--\s*Select/i.test(v);
  };

  console.log("Stage 5 Live Data:", { s1, s2 });

  // --- CLEAR TABLES ---
  const majorBody = document.getElementById("boq_major_body");
  const bosBody = document.getElementById("boq_bos_body");
  const servBody = document.getElementById("boq_services_body");

  if (majorBody) majorBody.innerHTML = "";
  if (bosBody) bosBody.innerHTML = "";
  if (servBody) servBody.innerHTML = "";

  // Civil inputs live in Stage 5 (fixed rows)
  const civil = s4.civil || {};
  const civilMakeEl = document.getElementById("civil_make_s5");
  const qtyBlocksEl = document.getElementById("qty_blocks");
  const adhesiveEl = document.getElementById("adhesive_make_s5");
  const qtyWalkwayEl = document.getElementById("qty_walkway");
  const qtyAnchorEl = document.getElementById("qty_anchor");
  const rateBlocksEl = document.getElementById("rate_blocks");
  const rateWalkwayEl = document.getElementById("rate_walkway");
  const rateAnchorEl = document.getElementById("rate_anchor");

  // Set initial values from image
  if (qtyBlocksEl && !qtyBlocksEl.value) qtyBlocksEl.value = 95;
  if (rateBlocksEl && !rateBlocksEl.value) rateBlocksEl.value = "283.33";
  if (qtyWalkwayEl && !qtyWalkwayEl.value) qtyWalkwayEl.value = 15;
  if (rateWalkwayEl && !rateWalkwayEl.value) rateWalkwayEl.value = "550.00";
  if (qtyAnchorEl && !qtyAnchorEl.value) qtyAnchorEl.value = 380;
  if (rateAnchorEl && !rateAnchorEl.value) rateAnchorEl.value = "39.00";
  
  // Adhesive initialization
  const rateAdhesiveEl = document.getElementById("rate_adhesive");
  if (rateAdhesiveEl && !rateAdhesiveEl.value) rateAdhesiveEl.value = "2.00";

  if (civilMakeEl && !civilMakeEl.value) civilMakeEl.value = civil.blockType || "";
  if (adhesiveEl && !adhesiveEl.value) adhesiveEl.value = "MyBond MetLock";

  if (typeof calcCivilBlocksNew === "function") calcCivilBlocksNew();
  if (typeof calcWalkway === "function") calcWalkway();
  if (typeof calcAnchor === "function") calcAnchor();

  // ==========================================
  // A. MAJOR COMPONENTS
  // ==========================================

  // 1. PANELS (Calculated Rate)
  let panelRate = 13500;
  const capexPerKw = parseFloat(s1.capexPerKw || document.getElementById("capex_per_kw")?.value || 0);
  const watts = parseFloat(s1.panelWattage || 0);

  if (capexPerKw > 0 && watts > 0) {
    panelRate = (capexPerKw / 1000) * watts;
  } else {
    // Use rate from image if capex not available
    panelRate = 25.2;
  }

  addBoQRow(
    majorBody,
    "panel",
    "PV Modules (Solar Panels)",
    `${s1.panelWattage || 550}Wp ${s1.panelType || "Mono/Bifacial"}`,
    s1.panelCount || 162, // Use 162 from image as default
    panelRate
  );

  // 2. INVERTER
  const inverterBreakdown = Array.isArray(s2.multiInverterDesign) && s2.multiInverterDesign.length > 0
    ? s2.multiInverterDesign.reduce((acc, row) => {
        const model = row?.inverter?.name || "Grid Tie Inverter";
        const qty = parseFloat(row?.qty) || 0;
        const existing = acc.find(x => x.model === model);
        if (existing) existing.qty += qty;
        else acc.push({ model, qty });
        return acc;
      }, [])
    : [{ model: s2.inverterModel || "Grid Tie Inverter", qty: parseFloat(s2.inverterCount) || 1 }];

  inverterBreakdown.forEach((inv, idx) => {
    const rowId = inverterBreakdown.length === 1 ? "inverter" : `inverter_${idx + 1}`;
    addBoQRow(
      majorBody,
      rowId,
      "Solar Inverter",
      inv.model,
      inv.qty,
      305000
    );
  });

  // 2B. OPTIMIZERS (from Stage 2 BOM, if optimizer mode is used)
  const optimizerRows = (Array.isArray(s2.bom) ? s2.bom : []).filter(item =>
    (item?.name || "").toLowerCase().includes("optimizer")
  );
  optimizerRows.forEach((opt, idx) => {
    const optName = opt.name || `Optimizer ${idx + 1}`;
    const optQty = parseFloat(opt.qty) || 0;
    // Optimizer rate from image
    const optRate = 2800;
    addBoQRow(
      majorBody,
      `optimizer_${idx + 1}`,
      "Module Optimizer",
      optName,
      optQty,
      optRate
    );
  });

  // 3. FABRICATION (single row with Row1/Row2/Row3 panel inputs)
  const defaultWatt = parseInt(s1.panelWattage, 10) || 550;
  const fabState = globalData.stage5?.fabrication || {};
  addFabricationRow(majorBody, "fabrication", "Fabrication", s1, defaultWatt, fabState);

  // ==========================================
  // B. BALANCE OF SYSTEM
  // ==========================================

  // Stage 3 -> Stage 5 mapping: include all selected Stage 3 components in BOS
  const stage3Entries = [
    { id: "dcdb", desc: "DC Distribution Box", data: s3.dc?.dcdb },
    { id: "dc_mcb", desc: "DC MCB", data: s3.dc?.mcb },
    { id: "dc_fuse", desc: "DC Fuse", data: s3.dc?.fuse },
    { id: "dc_spd", desc: "DC SPD", data: s3.dc?.spd },
    { id: "dc_cable", desc: "DC Solar Cable", data: s3.dc?.cable },
    { id: "acdb", desc: "AC Distribution Box", data: s3.ac?.acdb },
    { id: "ac_mcb", desc: "AC MCB", data: s3.ac?.mcb },
    { id: "ac_elcb", desc: "AC ELCB", data: s3.ac?.elcb },
    { id: "ac_spd", desc: "AC SPD", data: s3.ac?.spd },
    { id: "ac_cable", desc: "AC Cable (4C Armored)", data: s3.ac?.cable },
  ];
  const fallbackRates = {
    dc_cable: 45,
    ac_cable: 280,
    dc_mcb: 450,
    dc_fuse: 150,
    dc_spd: 1200,
    ac_spd: 1800,
  };
  stage3Entries.forEach((entry) => {
    const itemText = cleanItemText(entry.data?.item);
    const hasSelection = isMeaningfulSelection(entry.data?.item);
    const rowCost = toNum(entry.data?.cost);

    // Skip unselected dynamic rows; keep selected/fixed rows.
    if (!hasSelection && rowCost <= 0) return;

    let qty = toNum(entry.data?.qty);
    if (entry.id === "ac_cable") {
      qty = toNum(s4.totalLength) > 0 ? toNum(s4.totalLength) : qty;
      if (qty <= 0) qty = 35;
    } else if (entry.id === "dc_cable") {
      if (qty <= 0) qty = Math.ceil((toNum(s1.panelCount) || 0) * 6);
    } else if (qty <= 0) {
      qty = 1;
    }

    const fallbackRate = fallbackRates[entry.id] || 0;

    let rate = qty > 0 && rowCost > 0 ? rowCost / qty : fallbackRate;
    let spec = itemText || entry.desc;

    if (entry.id === "ac_cable") {
      const finalCable = cleanItemText(s4.cableSelected || itemText || "AC Cable");
      const finalSize = cleanItemText(s4.cableSize || entry.data?.size || "");
      const finalRate = toNum(s4.cableRate);

      if (finalRate > 0) rate = finalRate;
      spec = finalSize ? `${finalCable} | ${finalSize}` : finalCable;
    } else if (entry.id === "ac_mcb") {
      const finalMcb = cleanItemText(s4.mcbSelected || itemText || "AC MCB");
      const finalRate = toNum(s4.mcbRate);
      if (finalRate > 0) rate = finalRate;
      spec = finalMcb;
    }

    addBoQRow(bosBody, entry.id, entry.desc, spec, qty, rate);
  });

  // MC4
  const mc4Qty = Math.ceil((s1.panelCount || 0) * 2.2);
  addBoQRow(bosBody, "mc4", "MC4 Connectors (Pair)", "IP68 Rated", mc4Qty, 150);

  // EARTHING & CONDUIT - Add all materials from image
  addBoQRow(bosBody, "earthing_kit", "Earthing Kit", "True Power", 4, 3250);
  addBoQRow(bosBody, "lightning_arrestor", "Lightning Arrestor", "True Power", 2, 1000);
  addBoQRow(bosBody, "earthing_cable", "Earthing Cable", "Polycab Green 4 sq mm", 400, 57);
  addBoQRow(bosBody, "earthing_strips", "Earthing Strips", "Local HDG 25X3 mm", 80, 58);
  addBoQRow(bosBody, "pipes", "PVC Pipes", "Prince Schedule 40 UPVC", 30, 350);

  // ==========================================
  // C. INSTALLATION & SERVICES
  // ==========================================
  const sysSizeKw = s1.systemSizeKwp || 0;

  addBoQRow(servBody, "install", "Installation & Commissioning", "Civil & Elec Execution", sysSizeKw.toFixed(2), 3500);
  addBoQRow(servBody, "transport", "Transportation & Logistics", "Site Delivery", 1, 20000);
  addBoQRow(servBody, "structure_consultant", "Structure Consultant", "As per requirement", 1, 15000);
  addBoQRow(servBody, "meter_charges", "Meter Charges", "Govt Fees", 1, 60000);
  addBoQRow(servBody, "net_meter", "NetMetering", "Documentation & Govt Fees", 1, 51840);
  addBoQRow(servBody, "miscellaneous", "Miscellaneous", "Other services", 1, 99740);
  addBoQRow(servBody, "inc", "InC", "As per requirement", 1, 187200);

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
  const safeIdClass = String(id || "misc").replace(/[^a-zA-Z0-9_-]/g, "_");
  tr.className = `boq-row row-${safeIdClass}`;
  tr.innerHTML = `
        <td class="col-use">
            <input type="checkbox" class="boq-include" checked onchange="calcStage5()">
        </td>
        <td class="col-desc">${desc}</td>
        <td class="col-spec">${spec}</td>
        <td class="col-qty"><input type="number" class="cost-input qty-input" id="qty_${id}" value="${q}" step="0.01" min="0" onchange="calcStage5()" style="text-align:center;"></td>
        <td class="col-rate">
            <input type="number" class="cost-input item-rate" id="rate_${id}" value="${r.toFixed(
              2
            )}" onchange="calcStage5()" step="0.01">
        </td>
        <td class="col-total" id="total_${id}">₹ ${total.toLocaleString("en-IN", {
          maximumFractionDigits: 0,
        })}</td>
    `;
  tbody.appendChild(tr);
}

function addConduitRow(tbody, id, desc, conduitItems = []) {
  if (!tbody) return;
  const opts = conduitItems.length > 0 ? conduitItems : [];
  const firstRate = parseFloat(opts[0]?.rate) || 0;

  const tr = document.createElement("tr");
  tr.className = `boq-row row-${id}`;
  tr.innerHTML = `
    <td class="col-use">
      <input type="checkbox" class="boq-include" checked onchange="calcStage5()">
    </td>
    <td class="col-desc">${desc}</td>
    <td class="col-spec">
      <select id="sel_${id}" class="cost-input" style="text-align:left;" onchange="onConduitMaterialChange()">
        ${opts.length > 0
          ? opts.map((m) => `<option value="${escHtml(m.name)}" data-rate="${parseFloat(m.rate) || 0}">${escHtml(m.name)}</option>`).join("")
          : `<option value="">No conduit material in procurement</option>`
        }
      </select>
    </td>
    <td class="col-qty"><span id="qty_${id}">40</span></td>
    <td class="col-rate">
      <input type="number" class="cost-input item-rate" id="rate_${id}" value="${firstRate.toFixed(2)}" onchange="calcStage5()">
    </td>
    <td class="col-total" id="total_${id}">₹ ${(40 * firstRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
  `;
  tbody.appendChild(tr);
}

window.onConduitMaterialChange = function () {
  const sel = document.getElementById("sel_conduit");
  const rateInput = document.getElementById("rate_conduit");
  if (!sel || !rateInput) return;
  const selected = sel.options[sel.selectedIndex];
  const rate = parseFloat(selected?.dataset?.rate) || 0;
  rateInput.value = rate.toFixed(2);
  calcStage5();
};

function getFabRateForMode(modeKey) {
  if (modeKey && FAB_RATE_MAP[modeKey] !== undefined) return FAB_RATE_MAP[modeKey];
  return 0;
}

function addFabricationRow(tbody, id, desc, s1, fallbackWatt, rowState = {}) {
  if (!tbody) return;

  const row1 = parseFloat(rowState.row1) || 0;
  const row2 = parseFloat(rowState.row2) || 0;
  const row3 = parseFloat(rowState.row3) || 0;
  const panelCount = row1 + row2 + row3;
  const watt = parseInt(rowState.watt, 10) || fallbackWatt;
  const panelTypeText = `${watt}Wp ${s1?.panelType || ""}`.trim();
  const row1Rate = getFabRateForMode("1R");
  const row2Rate = getFabRateForMode("2R");
  const row3Rate = getFabRateForMode("3R");
  const avgRate = panelCount > 0
    ? ((row1 * row1Rate) + (row2 * row2Rate) + (row3 * row3Rate)) / panelCount
    : 0;
  const total = panelCount * watt * avgRate;

  const tr = document.createElement("tr");
  tr.className = `boq-row row-${id}`;
  tr.setAttribute("data-fab-row", id);
  tr.innerHTML = `
    <td class="col-use">
      <input type="checkbox" class="boq-include" checked onchange="calcStage5()">
    </td>
    <td class="col-desc">${desc}</td>
    <td class="col-spec">
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
        <input type="text" class="cost-input fab-panel-type" id="fab_panel_type_${id}" value="${panelTypeText}" readonly style="text-align:left;">
        <input type="text" class="cost-input" value="Row rates: 1R=4.5, 2R=5, 3R=6" readonly style="text-align:left;">
      </div>
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:#334155;">1R
          <input type="number" min="0" step="1" class="cost-input fab-count-1" id="fab_count1_${id}" value="${row1}" onchange="calcStage5()" placeholder="Row 1 Panels">
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:#334155;">2R
          <input type="number" min="0" step="1" class="cost-input fab-count-2" id="fab_count2_${id}" value="${row2}" onchange="calcStage5()" placeholder="Row 2 Panels">
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:#334155;">3R
          <input type="number" min="0" step="1" class="cost-input fab-count-3" id="fab_count3_${id}" value="${row3}" onchange="calcStage5()" placeholder="Row 3 Panels">
        </label>
      </div>
    </td>
    <td class="col-qty"><span id="qty_${id}">${panelCount}</span></td>
    <td class="col-rate">
      <input type="number" class="cost-input item-rate fab-rate" id="rate_${id}" value="${avgRate.toFixed(2)}" onchange="calcStage5()" readonly>
    </td>
    <td class="col-total" id="total_${id}">₹ ${total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
  `;
  tbody.appendChild(tr);
}

// --- CALCULATION ENGINE ---
window.calcStage5 = function () {
  let subTotal = 0;
  const isRowIncluded = (row) => {
    const chk = row?.querySelector(".boq-include");
    return chk ? chk.checked : true;
  };

  // ✅ FIX: Sync fixed civil row totals before main loop
  ["blocks", "walkway", "anchor"].forEach((id) => {
    const qtyEl   = document.getElementById(`qty_${id}`);
    const rateEl  = document.getElementById(`rate_${id}`);
    const totalEl = document.getElementById(`total_${id}`);
    const row     = totalEl?.closest("tr");
    if (!qtyEl || !rateEl || !totalEl) return;
    const qty  = parseFloat(qtyEl.value) || 0;
    const rate = parseFloat(rateEl.value) || 0;
    const tot  = qty * rate;
    totalEl.innerText = `₹ ${tot.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    // Add to subtotal only if checkbox is checked
    const chk = row?.querySelector(".boq-include");
    if (!chk || chk.checked) subTotal += tot;
  });
  // Adhesive separately (uses calcCivilBlocksNew's qty field)
  const adhQty  = parseFloat(document.getElementById("qty_adhesive")?.value) || 0;
  const adhRate = parseFloat(document.getElementById("rate_adhesive")?.value) || 0;
  const adhTot  = adhQty * adhRate;
  const adhCell = document.getElementById("total_adhesive");
  const adhRow  = adhCell?.closest("tr");
  if (adhCell) adhCell.innerText = `₹ ${adhTot.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const adhChk = adhRow?.querySelector(".boq-include");
  if (!adhChk || adhChk.checked) subTotal += adhTot;

  const fabRows = {};
  document.querySelectorAll("tr[data-fab-row]").forEach((row) => {
    const rowId = row.getAttribute("data-fab-row");
    const count1Input = row.querySelector(".fab-count-1");
    const count2Input = row.querySelector(".fab-count-2");
    const count3Input = row.querySelector(".fab-count-3");
    const rateInput = row.querySelector(".fab-rate");
    const totalCell = row.querySelector(".col-total");
    const qtySpan = row.querySelector('span[id^="qty_"]');

    const row1 = parseFloat(count1Input?.value) || 0;
    const row2 = parseFloat(count2Input?.value) || 0;
    const row3 = parseFloat(count3Input?.value) || 0;
    const panelCount = row1 + row2 + row3;
    const s1Watt = parseInt(window.projectData?.stage1?.panelWattage, 10)
      || parseInt(window.projectData?.design?.panelWattage, 10)
      || parseInt(window.projectData?.parameters?.panelWattage, 10)
      || FAB_DEFAULT_WATT_OPTIONS[1];
    const watt = s1Watt;
    const row1Rate = getFabRateForMode("1R");
    const row2Rate = getFabRateForMode("2R");
    const row3Rate = getFabRateForMode("3R");
    const avgRate = panelCount > 0
      ? ((row1 * row1Rate) + (row2 * row2Rate) + (row3 * row3Rate)) / panelCount
      : 0;
    const lineTotal = panelCount * watt * avgRate;

    if (rateInput) rateInput.value = avgRate.toFixed(2);
    if (qtySpan) qtySpan.innerText = String(panelCount);
    if (totalCell) {
      totalCell.innerText = `₹ ${lineTotal.toLocaleString("en-IN", {
        maximumFractionDigits: 0,
      })}`;
    }

    fabRows[rowId] = { row1, row2, row3, panelCount, watt, rates: { row1: row1Rate, row2: row2Rate, row3: row3Rate }, avgRate };
    if (isRowIncluded(row)) subTotal += lineTotal;
  });

  // 1. Iterate over all rows with 'item-rate' class (excluding fab-rate and fixed civil rows already synced above)
  const inputs = document.querySelectorAll(".item-rate:not(.fab-rate)");

  inputs.forEach(input => {
    const row = input.closest("tr");
    if (!row) return;

    // Skip fixed civil rows (already synced above)
    if (row.id === "row_blocks" || row.id === "row_adhesive" || row.id === "row_walkway" || row.id === "row_anchor") return;

    // Get Quantity (from input field or span)
    const qtyInput = row.querySelector('input.qty-input');
    const qtySpan = row.querySelector('span[id^="qty_"]');
    const qty = parseFloat(qtyInput?.value ?? qtySpan?.innerText) || 0;

    // Get Current Rate (User may have edited it)
    const rate = parseFloat(input.value) || 0;

    // Calc Line Total
    const lineTotal = qty * rate;
    if (isRowIncluded(row)) subTotal += lineTotal;

    // Update Line Display
    const totalCell = row.querySelector(".col-total");
    if (totalCell) {
      const totalText = lineTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 });
      totalCell.innerText = `₹ ${totalText}`;
    }
  });

  // 2. Update Subtotal (already accumulated from all rows above)
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
      inverter: getRowTotal("inverter") + getRowTotalByPrefix("inverter_"),
      structure: 0,
      bos:
        subTotal -
        (getRowTotal("panel") +
          getRowTotal("inverter") +
          getRowTotal("fabrication") +
          getRowTotal("install") +
          getRowTotal("transport") +
          getRowTotal("net_meter")),
      installation: getRowTotal("install") + getRowTotal("transport") + getRowTotal("net_meter"),
      fabrication: getRowTotal("fabrication"),
    },
    fabrication: fabRows.fabrication || {},
  };

  if (typeof setStageCompletion === "function") {
    setStageCompletion(5, grandTotal > 0);
  }
};

// Helper to extract specific category totals for the final report chart
function getRowTotal(id) {
  const el = document.getElementById(`total_${id}`);
  if (el) {
    const row = el.closest("tr");
    const include = row?.querySelector(".boq-include");
    if (include && !include.checked) return 0;
    return parseFloat((el.innerText || "").replace(/[₹\s,]/g, "")) || 0;
  }
  return 0;
}

function getRowTotalByPrefix(prefix) {
  let sum = 0;
  document.querySelectorAll(`[id^="total_${prefix}"]`).forEach((el) => {
    const row = el.closest("tr");
    const include = row?.querySelector(".boq-include");
    if (include && !include.checked) return;
    sum += parseFloat((el.innerText || "").replace(/[₹\s,]/g, "")) || 0;
  });
  return sum;
}

// ==================================================================
// NEW CALCULATION FUNCTIONS FOR CIVIL ROWS
// ==================================================================

window.calcCivilBlocksNew = function() {
  const blockSel = document.getElementById("civil_make_s5");
  const qtyBlocksEl = document.getElementById("qty_blocks");
  const rateBlocksInput = document.getElementById("rate_blocks");
  const totalBlocksCell = document.getElementById("total_blocks");

  // BLOCKS CALCULATION
  if (blockSel && qtyBlocksEl && rateBlocksInput && totalBlocksCell) {
    const blockCount = parseFloat(qtyBlocksEl.value) || 0;
    const selectedBlockOption = blockSel.options[blockSel.selectedIndex];
    const dropdownRate = parseFloat(selectedBlockOption?.dataset?.rate) || 0;

    // If the dropdown has a rate, use it; otherwise keep manual entry
    let blockRate = parseFloat(rateBlocksInput.value) || 0;
    if (dropdownRate > 0) {
      blockRate = dropdownRate;
      rateBlocksInput.value = blockRate.toFixed(2);
    }

    const blockCost = blockCount * blockRate;
    // ✅ KEY FIX: always write ₹ formatted total
    totalBlocksCell.innerText = `₹ ${blockCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  // ADHESIVE CALCULATION
  const qtyAdhesiveEl = document.getElementById("qty_adhesive");
  const rateAdhInput = document.getElementById("rate_adhesive");
  const totalAdhCell = document.getElementById("total_adhesive");

  if (qtyAdhesiveEl && rateAdhInput && totalAdhCell) {
    const adhQty = parseFloat(qtyAdhesiveEl.value) || 0;
    const adhRate = parseFloat(rateAdhInput.value) || 0;
    totalAdhCell.innerText = `₹ ${(adhQty * adhRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  // HIDE/SHOW ADHESIVE ROW BASED ON BLOCK SELECTION
  const blockType = blockSel?.value || "";
  const adhesiveRow = document.getElementById("row_adhesive");
  if (adhesiveRow) {
    adhesiveRow.style.display = (blockType && blockType !== "" && blockType !== "none") ? "table-row" : "table-row";
  }

  // Save state
  if (!window.projectData) window.projectData = {};
  if (!window.projectData.stage4) window.projectData.stage4 = {};
  
  const blockCount = parseFloat(qtyBlocksEl?.value) || 0;
  const blockRate = parseFloat(rateBlocksInput?.value) || 0;
  const adhQty = parseFloat(qtyAdhesiveEl?.value) || 0;
  const adhRate = parseFloat(rateAdhInput?.value) || 0;
  
  window.projectData.stage4.civil = {
    blocks: blockCount,
    blockType: blockType,
    blockCost: blockCount * blockRate,
    adhesiveQty: adhQty,
    adhesiveRate: adhRate,
    adhesiveCost: adhQty * adhRate,
    totalCost: (blockCount * blockRate) + (adhQty * adhRate)
  };

  if (typeof calcStage5 === "function") calcStage5();
};

// Alias function for backward compatibility
window.calcCivilBlocks = window.calcCivilBlocksNew;

window.calcWalkway = function() {
  const qtyWalkwayEl = document.getElementById("qty_walkway");
  const rateInput = document.getElementById("rate_walkway");
  const totalCell = document.getElementById("total_walkway");
  
  if (qtyWalkwayEl && rateInput && totalCell) {
    const walkwayCount = parseFloat(qtyWalkwayEl.value) || 0;
    const walkwayRate = parseFloat(rateInput.value) || 550;
    const walkwayCost = walkwayCount * walkwayRate;
    
    totalCell.innerText = `₹ ${walkwayCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  if (typeof calcStage5 === "function") calcStage5();
};

window.calcAnchor = function() {
  const anchorQtyEl = document.getElementById("qty_anchor");
  const rateInput = document.getElementById("rate_anchor");
  const totalCell = document.getElementById("total_anchor");
  
  if (anchorQtyEl && rateInput && totalCell) {
    const anchorCount = parseFloat(anchorQtyEl.value) || 0;
    const anchorRate = parseFloat(rateInput.value) || 39;
    const anchorCost = anchorCount * anchorRate;
    
    totalCell.innerText = `₹ ${anchorCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  if (typeof calcStage5 === "function") calcStage5();
};
