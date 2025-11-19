// export.js - All PDF & Excel Export Logic (Updated)

// PDF export
function exportReport() {
  if (Object.keys(finalReportData).length === 0) {
    alert("No report data to export. Please calculate a system first.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const d = finalReportData;

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Avishakti Solar Design Report", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Report for: ${d.siteName}`, 105, 27, { align: "center" });

  // --- Site & Load Summary Table ---
  doc.autoTable({
    startY: 35,
    head: [["Site & Load Summary", ""]],
    body: [
      ["Site Name", d.siteName],
      ["Site Coordinates", `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}`],
      ["Total Annual Load", `${d.totalAnnualUnits.toLocaleString("en-IN")} kWh`],
      ["Desired Savings Target", `${d.savingsTargetPercent.toFixed(0)}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [102, 126, 234] },
  });

  // --- Recommended System Table ---
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [["Recommended Solar System", ""]],
    body: [
      ["Required Panel Count", `${d.panelCount} panels × ${d.panelWattage}Wp`],
      ["Final System Size", `${d.systemSizeKwp.toFixed(2)} kWp`],
      ["Specific Yield (Annual)", `${d.specificYieldAnnual.toFixed(1)} kWh/kWp/year`],
      ["Total Annual Energy Yield", `${d.totalAnnualEnergy.toFixed(0)} kWh/year`],
      ["Average Daily Energy", `${d.averageDailyEnergy.toFixed(1)} kWh/day`],
      ["Annual PLF", `${(d.plfAnnual * 100).toFixed(2)}%`],
      ["Achieved Savings", `${d.achievedSavingsPercent.toFixed(1)}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [102, 126, 234] },
  });

  // --- Financial Analysis Table ---
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [["Financial Analysis", ""]],
    body: [
      ["Average Cost per Unit", `₹${d.avgTariff.toFixed(2)} / kWh`],
      ["Current Annual Bill", `₹${d.actualAnnualCost.toLocaleString("en-IN")}`],
      ["Est. System Cost (CAPEX)", `₹${d.capex.toLocaleString("en-IN")}`],
      ["Est. Annual Savings", `₹${d.annualSavings.toLocaleString("en-IN")}`],
      ["Post-Solar Annual Bill", `₹${(d.postSolarCost < 0 ? 0 : d.postSolarCost).toLocaleString("en-IN")}`],
      ["Payback Period", `${d.payback.toFixed(1)} years`],
      ["Return on Investment (ROI)", `${d.roi.toFixed(1)}% per year`],
      ["Est. 25-Year Savings", `₹${(d.annualSavings * 25).toLocaleString("en-IN")}`],
    ],
    theme: "striped",
    headStyles: { fillColor: [245, 158, 11] },
    didParseCell: function (data) {
      if (data.row.index === 3 || data.row.index === 7) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = "#fef3c7";
        data.cell.styles.textColor = "#92400e";
      }
    },
  });

  // --- Monthly Performance Table ---
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
    m.days,
    m.ghi.toFixed(2),
    m.ambientTemp.toFixed(1),
    m.cellTemp.toFixed(1),
    m.tempDF.toFixed(3),
    m.shadowDF.toFixed(3),
    m.otherDF.toFixed(3),
    m.totalDF.toFixed(3),
    m.energyYield.toFixed(0),
    m.specificYield.toFixed(2),
    (m.plf * 100).toFixed(2),
  ]);

  // Add Annual row
  const avgGHI = d.monthlyTable.reduce((a, b) => a + b.ghi, 0) / 12;
  const avgAmbTemp = d.monthlyTable.reduce((a, b) => a + b.ambientTemp, 0) / 12;
  const avgCellTemp = d.monthlyTable.reduce((a, b) => a + b.cellTemp, 0) / 12;
  const avgTempDF = d.monthlyTable.reduce((a, b) => a + b.tempDF, 0) / 12;
  const avgTotalDF = d.monthlyTable.reduce((a, b) => a + b.totalDF, 0) / 12;
  
  monthlyBody.push([
    "Annual",
    "365",
    avgGHI.toFixed(2),
    avgAmbTemp.toFixed(1),
    avgCellTemp.toFixed(1),
    avgTempDF.toFixed(3),
    d.monthlyTable[0].shadowDF.toFixed(3),
    d.monthlyTable[0].otherDF.toFixed(3),
    avgTotalDF.toFixed(3),
    d.totalAnnualEnergy.toFixed(0),
    (d.specificYieldAnnual / 365).toFixed(2),
    (d.plfAnnual * 100).toFixed(2),
  ]);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [monthlyHead],
    body: monthlyBody,
    theme: "grid",
    headStyles: { fillColor: [2, 132, 199], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 12 },
      2: { cellWidth: 12 },
      3: { cellWidth: 12 },
      4: { cellWidth: 12 },
      5: { cellWidth: 14 },
      6: { cellWidth: 16 },
      7: { cellWidth: 14 },
      8: { cellWidth: 14 },
      9: { cellWidth: 16 },
      10: { cellWidth: 15 },
      11: { cellWidth: 12 },
    },
    didParseCell: function (data) {
      if (data.row.index === 12) {
        // Annual row
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = "#f8fafc";
      }
    },
  });

  // --- Calculation Parameters Table ---
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [["Calculation Parameters Used", ""]],
    body: [
      ["Panel NOCT", `${d.panelNoct}°C`],
      ["Temperature Coefficient", `${d.tempCoefficient.toFixed(2)}% per °C`],
      ["Shadow Loss", `${d.shadowLoss.toFixed(0)}%`],
      ["Fixed Derating (Other Losses)", `${d.fixedDerating.toFixed(0)}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [107, 114, 128] },
  });

  doc.save(`Avishakti_Solar_Report_${d.siteName.replace(/ /g, "_")}.pdf`);
}

// Function to export data to Excel
function exportExcelReport() {
  if (Object.keys(finalReportData).length === 0) {
    alert("No report data to export. Please calculate a system first.");
    return;
  }

  const d = finalReportData;
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Summary Report ---
  const summaryData = [
    ["Avishakti Solar Design Report for:", d.siteName],
    [],
    ["Site & Load Summary", ""],
    ["Site Coordinates", `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}`],
    ["Total Annual Load", `${d.totalAnnualUnits.toLocaleString("en-IN")} kWh`],
    ["Desired Savings Target", `${d.savingsTargetPercent.toFixed(0)}%`],
    [],
    ["Recommended Solar System", ""],
    ["Required Panel Count", `${d.panelCount} panels × ${d.panelWattage}Wp`],
    ["Final System Size", `${d.systemSizeKwp.toFixed(2)} kWp`],
    ["Specific Yield (Annual)", `${d.specificYieldAnnual.toFixed(1)} kWh/kWp/year`],
    ["Total Annual Energy Yield", `${d.totalAnnualEnergy.toFixed(0)} kWh/year`],
    ["Average Daily Energy", `${d.averageDailyEnergy.toFixed(1)} kWh/day`],
    ["Annual PLF", `${(d.plfAnnual * 100).toFixed(2)}%`],
    ["Achieved Savings", `${d.achievedSavingsPercent.toFixed(1)}%`],
    [],
    ["Financial Analysis", ""],
    ["Average Cost per Unit", `₹${d.avgTariff.toFixed(2)} / kWh`],
    ["Current Annual Bill", `₹${d.actualAnnualCost.toLocaleString("en-IN")}`],
    ["Est. System Cost (CAPEX)", `₹${d.capex.toLocaleString("en-IN")}`],
    ["Est. Annual Savings", `₹${d.annualSavings.toLocaleString("en-IN")}`],
    ["Post-Solar Annual Bill", `₹${(d.postSolarCost < 0 ? 0 : d.postSolarCost).toLocaleString("en-IN")}`],
    ["Payback Period", `${d.payback.toFixed(1)} years`],
    ["Return on Investment (ROI)", `${d.roi.toFixed(1)}% per year`],
    ["Est. 25-Year Savings", `₹${(d.annualSavings * 25).toLocaleString("en-IN")}`],
    [],
    ["Calculation Parameters", ""],
    ["Panel NOCT", `${d.panelNoct}°C`],
    ["Temperature Coefficient", `${d.tempCoefficient.toFixed(2)}% per °C`],
    ["Shadow Loss", `${d.shadowLoss.toFixed(0)}%`],
    ["Fixed Derating (Other Losses)", `${d.fixedDerating.toFixed(0)}%`],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1["!cols"] = [{ wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Summary Report");

  // --- Sheet 2: Monthly Performance Analysis ---
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  
  const monthlyHeader = [
    "Parameter",
    ...months,
    "Annual"
  ];

  const buildExcelRow = (label, data, precision, annualValue) => {
    return [
      label,
      ...data.map((val) => parseFloat(val.toFixed(precision))),
      parseFloat(annualValue.toFixed(precision)),
    ];
  };

  const avgGHI = d.monthlyTable.reduce((a, b) => a + b.ghi, 0) / 12;
  const avgAmbTemp = d.monthlyTable.reduce((a, b) => a + b.ambientTemp, 0) / 12;
  const avgCellTemp = d.monthlyTable.reduce((a, b) => a + b.cellTemp, 0) / 12;
  const avgTempDF = d.monthlyTable.reduce((a, b) => a + b.tempDF, 0) / 12;
  const avgTotalDF = d.monthlyTable.reduce((a, b) => a + b.totalDF, 0) / 12;

  const monthlyData = [
    monthlyHeader,
    buildExcelRow("Days", d.monthlyTable.map((m) => m.days), 0, 365),
    buildExcelRow("GHI (kWh/m²/day)", d.monthlyTable.map((m) => m.ghi), 2, avgGHI),
    buildExcelRow("Ambient Temp (°C)", d.monthlyTable.map((m) => m.ambientTemp), 1, avgAmbTemp),
    buildExcelRow("Cell Temp (°C)", d.monthlyTable.map((m) => m.cellTemp), 1, avgCellTemp),
    buildExcelRow("Temp Derate Factor", d.monthlyTable.map((m) => m.tempDF), 3, avgTempDF),
    buildExcelRow("Shadow Derate Factor", d.monthlyTable.map((m) => m.shadowDF), 3, d.monthlyTable[0].shadowDF),
    buildExcelRow("Other Derate Factor", d.monthlyTable.map((m) => m.otherDF), 3, d.monthlyTable[0].otherDF),
    buildExcelRow("Total Derate Factor", d.monthlyTable.map((m) => m.totalDF), 3, avgTotalDF),
    buildExcelRow("Energy Yield (kWh)", d.monthlyTable.map((m) => m.energyYield), 0, d.totalAnnualEnergy),
    buildExcelRow("Specific Yield (kWh/kWp/day)", d.monthlyTable.map((m) => m.specificYield), 2, d.specificYieldAnnual / 365),
    buildExcelRow("PLF (%)", d.monthlyTable.map((m) => m.plf * 100), 2, d.plfAnnual * 100),
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(monthlyData);
  ws2["!cols"] = [{ wch: 30 }];
  for (let i = 1; i <= 13; i++) {
    ws2["!cols"].push({ wch: 15 });
  }
  XLSX.utils.book_append_sheet(wb, ws2, "Monthly Performance");

  // --- Sheet 3: Detailed Monthly Breakdown ---
  const detailedHeader = [
    "Month",
    "Days",
    "GHI (kWh/m²/day)",
    "Ambient Temp (°C)",
    "Cell Temp (°C)",
    "Temp Derate",
    "Shadow Derate",
    "Other Derate",
    "Total Derate",
    "Energy Yield (kWh)",
    "Specific Yield (kWh/kWp/day)",
    "PLF (%)",
  ];

  const detailedData = [detailedHeader];
  
  d.monthlyTable.forEach((m) => {
    detailedData.push([
      m.month,
      m.days,
      parseFloat(m.ghi.toFixed(2)),
      parseFloat(m.ambientTemp.toFixed(1)),
      parseFloat(m.cellTemp.toFixed(1)),
      parseFloat(m.tempDF.toFixed(4)),
      parseFloat(m.shadowDF.toFixed(4)),
      parseFloat(m.otherDF.toFixed(4)),
      parseFloat(m.totalDF.toFixed(4)),
      parseFloat(m.energyYield.toFixed(2)),
      parseFloat(m.specificYield.toFixed(3)),
      parseFloat((m.plf * 100).toFixed(3)),
    ]);
  });

  // Add Annual totals/averages
  detailedData.push([
    "Annual",
    365,
    parseFloat(avgGHI.toFixed(2)),
    parseFloat(avgAmbTemp.toFixed(1)),
    parseFloat(avgCellTemp.toFixed(1)),
    parseFloat(avgTempDF.toFixed(4)),
    parseFloat(d.monthlyTable[0].shadowDF.toFixed(4)),
    parseFloat(d.monthlyTable[0].otherDF.toFixed(4)),
    parseFloat(avgTotalDF.toFixed(4)),
    parseFloat(d.totalAnnualEnergy.toFixed(2)),
    parseFloat((d.specificYieldAnnual / 365).toFixed(3)),
    parseFloat((d.plfAnnual * 100).toFixed(3)),
  ]);

  const ws3 = XLSX.utils.aoa_to_sheet(detailedData);
  ws3["!cols"] = [
    { wch: 10 },
    { wch: 8 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 22 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, "Detailed Monthly Data");

  // --- Save the file ---
  XLSX.writeFile(
    wb,
    `Avishakti_Solar_Report_${d.siteName.replace(/ /g, "_")}.xlsx`
  );
}