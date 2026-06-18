// export.js - PDF and Excel Export Logic (Stage 5 + Financial + Generation)

function getReportDataForExport() {
  const fromWindow = window.finalReportData;
  const fromLegacy = (typeof finalReportData !== "undefined") ? finalReportData : null;
  const data = fromWindow && Object.keys(fromWindow).length > 0
    ? fromWindow
    : (fromLegacy && Object.keys(fromLegacy).length > 0 ? fromLegacy : {});

  return data || {};
}

function syncLegacyFinalReportData(data) {
  window.finalReportData = data || {};
  if (typeof finalReportData !== "undefined") {
    finalReportData = window.finalReportData;
  }
}

function toNum(v, fieldName = "numeric value") {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Missing or invalid ${fieldName}. Export aborted.`);
  }
  return n;
}

function fmtMoney(num) {
  return "INR " + toNum(num, "currency amount").toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function getPreferredSiteName(d) {
  const fromData = String(d?.siteName || d?.site?.name || d?.site_name || "").trim();
  if (fromData) return fromData;

  const s1 = window.projectData?.stage1 || {};
  const fromStage = String(
    s1.siteName ||
    s1.site?.name ||
    s1.site_name ||
    window.projectData?.site?.name ||
    document.getElementById("site_name")?.value ||
    ""
  ).trim();

  return fromStage || "Solar_Project";
}

function safeSiteName(d) {
  const raw = getPreferredSiteName(d);
  return raw.replace(/[\\/:*?"<>|]/g, "_");
}

function getFinancialMetrics(d) {
  const grossCapex = toNum(d.grossCapex ?? d.capex, "gross CAPEX");
  const subsidyAmount = toNum(d.subsidyAmount ?? 0, "subsidy amount");
  const netCapex = toNum(d.netCapex ?? d.capex, "net CAPEX");
  const annualSavings = toNum(d.annualSavings, "year 1 achieved value");
  const totalAchievedValue = toNum(d.totalAchievedValue ?? d.achievedLifetimeOutput, "total achieved value");
  const payback = toNum(d.payback, "payback period");
  const roi = toNum(d.roi, "ROI");
  const avgTariff = toNum(d.avgTariff, "average tariff");
  const actualAnnualCost = toNum(d.actualAnnualCost, "current annual bill");
  const postSolarCost = Math.max(0, toNum(d.postSolarCost, "post-solar annual bill"));
  return {
    grossCapex,
    subsidyAmount,
    netCapex,
    annualSavings,
    totalAchievedValue,
    payback,
    roi,
    avgTariff,
    actualAnnualCost,
    postSolarCost,
  };
}

function collectStage5BoqRows() {
  const rows = Array.from(document.querySelectorAll("#stage-5 tr.boq-row"));
  return rows.map((row) => {
    const desc = row.querySelector(".col-desc")?.innerText?.trim() || "-";
    const spec = row.querySelector(".col-spec")?.innerText?.trim().replace(/\s+/g, " ") || "-";
    const qty = toNum(row.querySelector(".col-qty span")?.innerText, "BoQ quantity");
    const rateInput = row.querySelector(".col-rate input");
    const rate = toNum(rateInput?.value, "BoQ rate");
    const amountTxt = row.querySelector(".col-total")?.innerText || "0";
    const amount = toNum(String(amountTxt).replace(/,/g, ""), "BoQ amount");
    return { desc, spec, qty, rate, amount };
  });
}

function getStage5Summary() {
  const s5 = window.projectData?.stage5 || {};
  const subsidy = window.stage5Subsidy === undefined ? 0 : toNum(window.stage5Subsidy, "Stage 5 subsidy");
  const subsidyApplied = document.getElementById("apply_subsidy")?.checked === true;
  return {
    subTotal: toNum(s5.subTotal, "Stage 5 subtotal"),
    gstAmount: toNum(s5.gstAmount, "Stage 5 GST"),
    grandTotal: toNum(s5.grandTotal, "Stage 5 grand total"),
    subsidy,
    subsidyApplied,
  };
}

function ensureExportableData() {
  const d = getReportDataForExport();
  if (!d || Object.keys(d).length === 0) {
    alert("Generate the final proposal before export.");
    return null;
  }
  if (!Array.isArray(d.monthlyTable) || d.monthlyTable.length !== 12) {
    alert("Complete Stage 1 calculations first. Export requires 12 months of real generation data.");
    return null;
  }
  const requiredMonthly = ["days", "ghi", "ambientTemp", "cellTemp", "tempDF", "shadowDF", "otherDF", "totalDF", "energyYield", "specificYield", "plf"];
  const missing = [];
  d.monthlyTable.forEach((m, idx) => {
    requiredMonthly.forEach((key) => {
      if (!Number.isFinite(parseFloat(m?.[key]))) missing.push(`${m?.month || `Month ${idx + 1}`} ${key}`);
    });
  });
  if (missing.length > 0) {
    alert(`Export aborted. Missing real monthly generation data:\n\n${missing.slice(0, 8).join("\n")}${missing.length > 8 ? "\n..." : ""}`);
    return null;
  }
  return d;
}

// PDF export
function exportReport() {
  const d = ensureExportableData();
  if (!d) return;

  const f = getFinancialMetrics(d);
  const boqRows = collectStage5BoqRows();
  const s5Summary = getStage5Summary();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Avishakti Solar Design Report", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Report for: ${getPreferredSiteName(d)}`, 105, 27, { align: "center" });

  doc.autoTable({
    startY: 35,
    head: [["Site and Load Summary", ""]],
    body: [
      ["Site Name", getPreferredSiteName(d)],
      ["Site Coordinates", `${toNum(d.latitude, 0).toFixed(4)}, ${toNum(d.longitude, 0).toFixed(4)}`],
      ["Total Annual Load", `${toNum(d.totalAnnualUnits, 0).toLocaleString("en-IN")} kWh`],
      ["Achieved Output", `${toNum(d.achievedSavingsPercent, 0).toFixed(1)}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [102, 126, 234] },
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [["Generation Summary", ""]],
    body: [
      ["Required Panel Count", `${toNum(d.panelCount, 0)} x ${toNum(d.panelWattage, 0)}Wp`],
      ["Final System Size", `${toNum(d.systemSizeKwp, 0).toFixed(2)} kWp`],
      ["Specific Yield (Annual)", `${toNum(d.specificYieldAnnual, 0).toFixed(1)} kWh/kWp/year`],
      ["Total Annual Energy Yield", `${toNum(d.totalAnnualEnergy, 0).toFixed(0)} kWh/year`],
      ["Average Daily Energy", `${toNum(d.averageDailyEnergy, 0).toFixed(1)} kWh/day`],
      ["Annual PLF", `${(toNum(d.plfAnnual, 0) * 100).toFixed(2)}%`],
      ["Achieved Savings", `${toNum(d.achievedSavingsPercent, 0).toFixed(1)}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [102, 126, 234] },
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [["Financial Analysis", ""]],
    body: [
      ["Average Cost per Unit", `INR ${f.avgTariff.toFixed(2)} / kWh`],
      ["Current Annual Bill", fmtMoney(f.actualAnnualCost)],
      ["Gross CAPEX", fmtMoney(f.grossCapex)],
      ["Subsidy", fmtMoney(f.subsidyAmount)],
      ["Net CAPEX", fmtMoney(f.netCapex)],
      ["Year 1 Achieved Value", fmtMoney(f.annualSavings)],
      ["Post-Solar Annual Bill", fmtMoney(f.postSolarCost)],
      ["Payback Period", `${f.payback.toFixed(1)} years`],
      ["Return on Investment (ROI)", `${f.roi.toFixed(1)}% per year`],
      ["Total Achieved Value", fmtMoney(f.totalAchievedValue)],
    ],
    theme: "striped",
    headStyles: { fillColor: [245, 158, 11] },
  });

  if (boqRows.length > 0) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Stage 5 Detailed BoQ", "Specification", "Qty", "Rate (INR)", "Amount (INR)"]],
      body: boqRows.map((r) => [
        r.desc,
        r.spec,
        r.qty.toFixed(2),
        r.rate.toLocaleString("en-IN", { maximumFractionDigits: 2 }),
        r.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
      ]),
      theme: "grid",
      headStyles: { fillColor: [16, 185, 129], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Stage 5 Totals", "Value"]],
      body: [
        ["Subtotal", fmtMoney(s5Summary.subTotal)],
        ["GST", fmtMoney(s5Summary.gstAmount)],
        ["Subsidy Applied", s5Summary.subsidyApplied ? "Yes" : "No"],
        ["Subsidy Amount", fmtMoney(s5Summary.subsidy)],
        ["Net Payable", fmtMoney(s5Summary.grandTotal)],
      ],
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235] },
    });
  }

  const monthlyHead = [
    "Month",
    "Days",
    "GHI",
    "Amb. T",
    "Cell T",
    "Temp DF",
    "Shadow DF",
    "Other DF",
    "Total DF",
    "Energy",
    "Sp. Yield",
    "PLF %",
  ];

  const monthlyBody = d.monthlyTable.map((m) => [
    m.month,
    toNum(m.days, 0),
    toNum(m.ghi, 0).toFixed(2),
    toNum(m.ambientTemp, 0).toFixed(1),
    toNum(m.cellTemp, 0).toFixed(1),
    toNum(m.tempDF, 0).toFixed(3),
    toNum(m.shadowDF, 0).toFixed(3),
    toNum(m.otherDF, 0).toFixed(3),
    toNum(m.totalDF, 0).toFixed(3),
    toNum(m.energyYield, 0).toFixed(0),
    toNum(m.specificYield, 0).toFixed(2),
    (toNum(m.plf, 0) * 100).toFixed(2),
  ]);

  const avgGHI = d.monthlyTable.reduce((a, b) => a + toNum(b.ghi, 0), 0) / 12;
  const avgAmbTemp = d.monthlyTable.reduce((a, b) => a + toNum(b.ambientTemp, 0), 0) / 12;
  const avgCellTemp = d.monthlyTable.reduce((a, b) => a + toNum(b.cellTemp, 0), 0) / 12;
  const avgTempDF = d.monthlyTable.reduce((a, b) => a + toNum(b.tempDF, 0), 0) / 12;
  const avgTotalDF = d.monthlyTable.reduce((a, b) => a + toNum(b.totalDF, 0), 0) / 12;

  monthlyBody.push([
    "Annual",
    "365",
    avgGHI.toFixed(2),
    avgAmbTemp.toFixed(1),
    avgCellTemp.toFixed(1),
    avgTempDF.toFixed(3),
    toNum(d.monthlyTable[0]?.shadowDF, 0).toFixed(3),
    toNum(d.monthlyTable[0]?.otherDF, 0).toFixed(3),
    avgTotalDF.toFixed(3),
    toNum(d.totalAnnualEnergy, 0).toFixed(0),
    (toNum(d.specificYieldAnnual, 0) / 365).toFixed(2),
    (toNum(d.plfAnnual, 0) * 100).toFixed(2),
  ]);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [monthlyHead],
    body: monthlyBody,
    theme: "grid",
    headStyles: { fillColor: [2, 132, 199], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
  });

  doc.save(`Avishakti_Solar_Report_${safeSiteName(d)}.pdf`);
}

// Excel export
function exportExcelReport() {
  const d = ensureExportableData();
  if (!d) return;

  const f = getFinancialMetrics(d);
  const boqRows = collectStage5BoqRows();
  const s5Summary = getStage5Summary();
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ["Avishakti Solar Design Report", getPreferredSiteName(d)],
    [],
    ["Site and Load Summary", ""],
    ["Site Coordinates", `${toNum(d.latitude, 0).toFixed(4)}, ${toNum(d.longitude, 0).toFixed(4)}`],
    ["Total Annual Load", `${toNum(d.totalAnnualUnits, 0).toLocaleString("en-IN")} kWh`],
    ["Achieved Output", `${toNum(d.achievedSavingsPercent, 0).toFixed(1)}%`],
    [],
    ["Generation Summary", ""],
    ["Panel Count", `${toNum(d.panelCount, 0)} x ${toNum(d.panelWattage, 0)}Wp`],
    ["System Size", `${toNum(d.systemSizeKwp, 0).toFixed(2)} kWp`],
    ["Specific Yield", `${toNum(d.specificYieldAnnual, 0).toFixed(1)} kWh/kWp/year`],
    ["Annual Energy Yield", `${toNum(d.totalAnnualEnergy, 0).toFixed(0)} kWh/year`],
    ["Average Daily Energy", `${toNum(d.averageDailyEnergy, 0).toFixed(1)} kWh/day`],
    ["Annual PLF", `${(toNum(d.plfAnnual, 0) * 100).toFixed(2)}%`],
    ["Achieved Savings", `${toNum(d.achievedSavingsPercent, 0).toFixed(1)}%`],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 32 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const financialData = [
    ["Financial Analysis", "Value"],
    ["Average Tariff", `INR ${f.avgTariff.toFixed(2)} / kWh`],
    ["Current Annual Bill", f.actualAnnualCost],
    ["Gross CAPEX", f.grossCapex],
    ["Subsidy", f.subsidyAmount],
    ["Net CAPEX", f.netCapex],
    ["Year 1 Achieved Value", f.annualSavings],
    ["Post-Solar Annual Bill", f.postSolarCost],
    ["Payback (years)", f.payback],
    ["ROI (% per year)", f.roi],
    ["Total Achieved Value", f.totalAchievedValue],
    [],
    ["Stage 5 Commercials", "Value"],
    ["Subtotal", s5Summary.subTotal],
    ["GST", s5Summary.gstAmount],
    ["Subsidy Applied", s5Summary.subsidyApplied ? "Yes" : "No"],
    ["Subsidy Amount", s5Summary.subsidy],
    ["Net Payable", s5Summary.grandTotal],
  ];
  const wsFinancial = XLSX.utils.aoa_to_sheet(financialData);
  wsFinancial["!cols"] = [{ wch: 30 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsFinancial, "Financial");

  if (boqRows.length > 0) {
    const boqData = [
      ["Item Description", "Specification", "Qty", "Rate (INR)", "Amount (INR)"],
      ...boqRows.map((r) => [r.desc, r.spec, r.qty, r.rate, r.amount]),
      [],
      ["Subtotal", "", "", "", s5Summary.subTotal],
      ["GST", "", "", "", s5Summary.gstAmount],
      ["Subsidy Applied", s5Summary.subsidyApplied ? "Yes" : "No", "", "", ""],
      ["Subsidy Amount", "", "", "", s5Summary.subsidy],
      ["Net Payable", "", "", "", s5Summary.grandTotal],
    ];
    const wsBoq = XLSX.utils.aoa_to_sheet(boqData);
    wsBoq["!cols"] = [{ wch: 34 }, { wch: 48 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsBoq, "Stage5_BoQ");
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyHeader = ["Parameter", ...months, "Annual"];
  const buildExcelRow = (label, data, precision, annualValue) => [
    label,
    ...data.map((val) => parseFloat(toNum(val, 0).toFixed(precision))),
    parseFloat(toNum(annualValue, 0).toFixed(precision)),
  ];

  const avgGHI = d.monthlyTable.reduce((a, b) => a + toNum(b.ghi, 0), 0) / 12;
  const avgAmbTemp = d.monthlyTable.reduce((a, b) => a + toNum(b.ambientTemp, 0), 0) / 12;
  const avgCellTemp = d.monthlyTable.reduce((a, b) => a + toNum(b.cellTemp, 0), 0) / 12;
  const avgTempDF = d.monthlyTable.reduce((a, b) => a + toNum(b.tempDF, 0), 0) / 12;
  const avgTotalDF = d.monthlyTable.reduce((a, b) => a + toNum(b.totalDF, 0), 0) / 12;

  const monthlyData = [
    monthlyHeader,
    buildExcelRow("Days", d.monthlyTable.map((m) => m.days), 0, 365),
    buildExcelRow("GHI (kWh/m2/day)", d.monthlyTable.map((m) => m.ghi), 2, avgGHI),
    buildExcelRow("Ambient Temp (C)", d.monthlyTable.map((m) => m.ambientTemp), 1, avgAmbTemp),
    buildExcelRow("Cell Temp (C)", d.monthlyTable.map((m) => m.cellTemp), 1, avgCellTemp),
    buildExcelRow("Temp Derate", d.monthlyTable.map((m) => m.tempDF), 3, avgTempDF),
    buildExcelRow("Shadow Derate", d.monthlyTable.map((m) => m.shadowDF), 3, toNum(d.monthlyTable[0]?.shadowDF, 0)),
    buildExcelRow("Other Derate", d.monthlyTable.map((m) => m.otherDF), 3, toNum(d.monthlyTable[0]?.otherDF, 0)),
    buildExcelRow("Total Derate", d.monthlyTable.map((m) => m.totalDF), 3, avgTotalDF),
    buildExcelRow("Energy Yield (kWh)", d.monthlyTable.map((m) => m.energyYield), 0, d.totalAnnualEnergy),
    buildExcelRow("Specific Yield", d.monthlyTable.map((m) => m.specificYield), 2, toNum(d.specificYieldAnnual, 0) / 365),
    buildExcelRow("PLF (%)", d.monthlyTable.map((m) => toNum(m.plf, 0) * 100), 2, toNum(d.plfAnnual, 0) * 100),
  ];
  const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyData);
  wsMonthly["!cols"] = [{ wch: 30 }, ...new Array(13).fill({ wch: 14 })];
  XLSX.utils.book_append_sheet(wb, wsMonthly, "Monthly");

  XLSX.writeFile(wb, `Avishakti_Solar_Report_${safeSiteName(d)}.xlsx`);
}
