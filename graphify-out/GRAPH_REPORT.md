# Graph Report - AvishaktiWorkingMain  (2026-04-30)

## Corpus Check
- 17 files · ~49,971 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 272 nodes · 616 edges · 16 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]

## God Nodes (most connected - your core abstractions)
1. `getStage1Snapshot()` - 15 edges
2. `_ec4Refresh()` - 14 edges
3. `resolveManualInverters()` - 14 edges
4. `applyManualOverride()` - 14 edges
5. `setManualMode()` - 13 edges
6. `applyDrawnStrings()` - 13 edges
7. `applyManualLayoutToDesign()` - 13 edges
8. `applyDesignOption()` - 13 edges
9. `setSystemType()` - 12 edges
10. `calculateSolarEdgeMode()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `setStageCompletion()` --calls--> `applyDesignOption()`  [INFERRED]
  static\indexScript.js → static\stage2_inverter.js
- `refreshCurrentActiveStage()` --calls--> `refreshStage3UI()`  [INFERRED]
  static\indexScript.js → static\stage3_switchgear.js
- `refreshCurrentActiveStage()` --calls--> `refreshStage4UI()`  [INFERRED]
  static\indexScript.js → static\stage4_AC_cables.js
- `simulateEnergyYield()` --calls--> `updatePanelCountPreview()`  [INFERRED]
  static\calc.js → static\indexScript.js
- `previewStage1Report()` --calls--> `renderFinalReport()`  [INFERRED]
  static\calc.js → static\finance.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (37): addShadowScenario(), calculateShadowTable(), calculateSolarPhysics(), clampNumber(), fetchSolarDataOnly(), findOptimalPanelCount(), getAnnualUnitsFromBills(), getAverageOrientationLoss() (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.14
Nodes (29): buildCableMakeDropdown(), buildCableSizeDropdown(), calcIb(), evaluateCable(), findCableOptionIndex(), findProtectionOptionIndex(), getCableMake(), getCableProps() (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (15): buildManualOptionForUnit(), buildManualStringOptionForUnit(), _buildPanelToInverterMap(), generateStringOptions(), getMaxDcV(), getMinMpptV(), loadInverters(), loadOptimizers() (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.2
Nodes (20): _checkHealth(), clearAllStrings(), _e4(), _ec4BuildGrid(), _ec4BuildGridLegacy(), _ec4Refresh(), _ec4UpdateHealthBar(), _ec4UpdateRatio() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.23
Nodes (19): applyDesignOption(), applyDrawnStrings(), applyManualLayoutToDesign(), autoSelectAndSizeInverter(), buildUnitsToProcess(), calculateGoodWeMode(), calculateSolarEdgeMode(), canForceManualConfirm() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (17): calculate_strings(), dashboard(), delete_material(), get_inverters(), get_optimizers(), get_solar_panels(), get_stage3_materials(), load_data() (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.26
Nodes (13): previewStage1Report(), collectStage5BoqRows(), ensureExportableData(), exportExcelReport(), exportReport(), fmtMoney(), getFinancialMetrics(), getPreferredSiteName() (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (8): deleteMaterial(), handleCategoryChange(), loadInventory(), openAddModal(), openEditModal(), renderDynamicFields(), renderTable(), setupDetailRowToggles()

### Community 8 - "Community 8"
Cohesion: 0.3
Nodes (15): buildInvOptions(), calculateStage2(), generateInteractiveGrid(), getStage1Snapshot(), getTrackersForManualSeed(), initManualLayoutFromTrackers(), injectCanvasCss(), renderManualVisualDiagram() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (11): findCableOptionByName(), findProtectionOptionByName(), loadStage3Materials(), normalizeCableName(), normalizeProtectionName(), populateDropdown(), refreshStage3UI(), syncStage3CableFromState() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (10): addNewBill(), autoUpdateMonthlyTable(), removeBill(), renderBill(), toggleBill(), toggleBillCollapse(), updateAnnualConsumptionDirectly(), updateBillData() (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (11): applyManualOverride(), calculateVocCold(), _ec4UpdateBom(), getOptimizerCatalog(), getOptimizerLimits(), getOptimizerNameForRatio(), getSelectedOptimizer(), rebalanceManualLayout() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (2): ping(), Keep-alive endpoint to prevent session timeout

### Community 13 - "Community 13"
Cohesion: 0.38
Nodes (4): ensureAlertModal(), ensureToastContainer(), showModalAlert(), showToast()

### Community 14 - "Community 14"
Cohesion: 0.5
Nodes (2): syncMapToInputs(), updateMapMarker()

### Community 15 - "Community 15"
Cohesion: 0.5
Nodes (2): addBoQRow(), refreshStage5UI()

## Knowledge Gaps
- **8 isolated node(s):** `Keep-alive endpoint to prevent session timeout`, `Safely loads data from materials.json`, `Safely saves data to materials.json`, `Returns Solar Panels for Stage 1`, `Returns Inverters for Stage 2` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 12`** (7 nodes): `app.py`, `bad_request()`, `index()`, `ping()`, `Keep-alive endpoint to prevent session timeout`, `require_login()`, `server_error()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (5 nodes): `initializeMap()`, `map.js`, `switchMapLayer()`, `syncMapToInputs()`, `updateMapMarker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (5 nodes): `addBoQRow()`, `getRowTotal()`, `getRowTotalByPrefix()`, `stage5_material_costing.js`, `refreshStage5UI()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `applyDesignOption()` connect `Community 4` to `Community 0`, `Community 2`, `Community 11`?**
  _High betweenness centrality (0.261) - this node is a cross-community bridge._
- **Why does `setStageCompletion()` connect `Community 0` to `Community 4`?**
  _High betweenness centrality (0.261) - this node is a cross-community bridge._
- **Why does `refreshCurrentActiveStage()` connect `Community 0` to `Community 9`, `Community 1`?**
  _High betweenness centrality (0.232) - this node is a cross-community bridge._
- **What connects `Keep-alive endpoint to prevent session timeout`, `Safely loads data from materials.json`, `Safely saves data to materials.json` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._