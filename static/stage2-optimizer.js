// ==================================================================
//  stage2-optimizer.js - Optimizer System Design Logic
// ==================================================================

/**
 * Generate optimizer-based design options
 * @param {number} panelCount - Total number of panels
 * @param {number} wattage - Panel wattage
 * @param {object} invSpecs - Inverter specifications
 * @returns {Array} Array of design options
 */
export function generateOptimizerOptions(panelCount, wattage, invSpecs) {
    const options = [];
    
    // --- Option 1: Economy (2:1 Ratio - P950/S1200) ---
    // Best for cost. Uses half the number of optimizers.
    const qty2to1 = Math.ceil(panelCount / 2);
    // Logic: If odd panels, one opt takes 1 panel.
    // Check constraint: Min 14 per string (3ph), Max 30.
    const strCount2to1 = Math.ceil(qty2to1 / 30); 
    const optsPerStr2to1 = Math.ceil(qty2to1 / strCount2to1);
    const valid2to1 = optsPerStr2to1 >= 14; 
    
    options.push({
        id: "opt_eco",
        title: "💰 Economy (2:1)",
        desc: "Lowest Cost. Uses P950/S1200 optimizers.",
        config: `${strCount2to1} String(s) × ${optsPerStr2to1} Opts`,
        bom: [{ name: "SolarEdge P950 (2:1)", qty: qty2to1 }],
        valid: valid2to1,
        warning: valid2to1 ? null : `String too short (${optsPerStr2to1} < 14). Add panels or switch to 1:1.`
    });

    // --- Option 2: Premium (1:1 Ratio - P401/S500) ---
    // Best for complex roofs. One opt per panel.
    // Check constraint: Min 16 per string (3ph), Max 25 (or 50 with S500 sometimes, sticking to conservative 25).
    const qty1to1 = panelCount; 
    const strCount1to1 = Math.ceil(qty1to1 / 25);
    const optsPerStr1to1 = Math.ceil(qty1to1 / strCount1to1);
    const valid1to1 = optsPerStr1to1 >= 16;

    options.push({
        id: "opt_prem",
        title: "⚡ Performance (1:1)",
        desc: "Max Control. Uses S500/P401 optimizers.",
        config: `${strCount1to1} String(s) × ${optsPerStr1to1} Opts`,
        bom: [{ name: "SolarEdge S500 (1:1)", qty: qty1to1 }],
        valid: valid1to1,
        warning: valid1to1 ? null : `String too short (${optsPerStr1to1} < 16).`
    });

    // --- Option 3: Balanced / Hybrid (Fallback) ---
    // If Economy fails, this offers a safe middle ground or just a different wiring (more strings)
    // Here we offer "Max Flexibility" (Shorter strings using 1:1)
    const strCountSafe = strCount1to1 + 1; // Force an extra string for smaller loops
    const optsPerStrSafe = Math.ceil(qty1to1 / strCountSafe);
    const validSafe = optsPerStrSafe >= 16; // Still needs to meet min voltage

    options.push({
        id: "opt_safe",
        title: "🛡️ Max Flexibility",
        desc: "More strings, lower DC voltage per string.",
        config: `${strCountSafe} String(s) × ${optsPerStrSafe} Opts`,
        bom: [{ name: "SolarEdge S500 (1:1)", qty: qty1to1 }],
        valid: validSafe,
        warning: validSafe ? null : "System too small to split further."
    });

    return options;
}

/**
 * Render optimizer-specific configuration details
 * @param {object} option - Selected design option
 * @param {object} inverter - Inverter details
 * @param {number} invCount - Inverter count
 * @param {object} s1 - Stage 1 data
 */
export function renderOptimizerConfig(option, inverter, invCount, s1) {
    console.log("Rendering Optimizer Configuration:", option);
    
    // Additional optimizer-specific rendering logic can go here
    // For example, detailed string layout diagrams, voltage calculations, etc.
    
    return {
        systemType: "optimizer",
        inverterModel: inverter.name,
        inverterCount: invCount,
        selectedConfig: option.config,
        bom: option.bom || [],
        stringPlan: option.id,
        isValid: option.valid
    };
}

/**
 * Validate optimizer string configuration
 * @param {number} optsPerString - Optimizers per string
 * @param {string} ratio - Optimizer ratio (1:1 or 2:1)
 * @returns {object} Validation result
 */
export function validateOptimizerString(optsPerString, ratio) {
    const minOpts = ratio === "2:1" ? 14 : 16;
    const maxOpts = ratio === "2:1" ? 30 : 25;
    
    const isValid = optsPerString >= minOpts && optsPerString <= maxOpts;
    
    return {
        isValid,
        minOpts,
        maxOpts,
        warning: !isValid ? 
            `String must have ${minOpts}-${maxOpts} optimizers (current: ${optsPerString})` : 
            null
    };
}

/**
 * Calculate optimizer system voltages
 * @param {number} optsPerString - Optimizers per string
 * @param {number} panelVoc - Panel open circuit voltage
 * @param {number} panelVmp - Panel max power voltage
 * @param {string} ratio - Optimizer ratio
 * @returns {object} Voltage calculations
 */
export function calculateOptimizerVoltages(optsPerString, panelVoc, panelVmp, ratio) {
    const panelsPerOpt = ratio === "2:1" ? 2 : 1;
    const totalPanels = optsPerString * panelsPerOpt;
    
    return {
        stringVoc: panelVoc * totalPanels,
        stringVmp: panelVmp * totalPanels,
        totalPanels,
        optsPerString
    };
}