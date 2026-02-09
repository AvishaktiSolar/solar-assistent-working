// ==================================================================
//  stage2-string.js - String Inverter System Design Logic
// ==================================================================

/**
 * Generate string inverter design options
 * @param {number} panelCount - Total number of panels
 * @param {number} voc - Panel open circuit voltage
 * @param {number} vmp - Panel max power voltage
 * @param {object} invSpecs - Inverter specifications
 * @returns {Array} Array of design options
 */
export function generateStringOptions(panelCount, voc, vmp, invSpecs) {
    const options = [];
    const maxV = invSpecs.max_dc_voltage || 1000;
    const minV = invSpecs.min_mppt_voltage || 200;
    
    // Safety Factors
    const Voc_max = voc * 1.1; // Cold weather buffer
    const Vmp_min = vmp * 0.9; // Hot weather buffer

    const maxLen = Math.floor(maxV / Voc_max);
    const minLen = Math.ceil(minV / Vmp_min);

    // --- Option 1: High Efficiency (Longest Strings) ---
    // Fewer strings = Less Cable = Less Loss.
    const strCountEff = Math.ceil(panelCount / maxLen);
    const lenEff = Math.floor(panelCount / strCountEff);
    const remEff = panelCount % strCountEff;
    
    options.push({
        id: "str_eff",
        title: "⚡ High Efficiency",
        desc: "Max Voltage. Minimizes cable losses.",
        config: `${strCountEff} Strings (${remEff>0 ? `${remEff}x${lenEff+1}, ${strCountEff-remEff}x${lenEff}` : `All ${lenEff}`})`,
        valid: lenEff >= minLen && (lenEff + (remEff>0?1:0)) <= maxLen,
        warning: null
    });

    // --- Option 2: Balanced MPPT (Even Split) ---
    // Tries to make strings equal length for better MPPT tracking
    let strCountBal = strCountEff;
    // If efficient split is uneven (e.g. 19, 19, 10), try adding a string to balance (e.g. 12, 12, 12, 12)
    if (remEff !== 0) strCountBal++; 
    
    const lenBal = Math.floor(panelCount / strCountBal);
    const remBal = panelCount % strCountBal;

    options.push({
        id: "str_bal",
        title: "⚖️ Balanced MPPT",
        desc: "Equalized string lengths for stable tracking.",
        config: `${strCountBal} Strings (${remBal>0 ? `${remBal}x${lenBal+1}, ${strCountBal-remBal}x${lenBal}` : `All ${lenBal}`})`,
        valid: lenBal >= minLen,
        warning: lenBal < minLen ? "Strings would be too short." : null
    });

    // --- Option 3: Shade Tolerant (Shortest Strings) ---
    // More strings = less impact if one string is shaded.
    // We try to maximize string count up to MPPT input limit (assuming 2 inputs per MPPT usually)
    const maxPossStrings = (invSpecs.mppts || 2) * 2; 
    let strCountShade = Math.min(Math.floor(panelCount / minLen), maxPossStrings);
    if(strCountShade <= strCountBal) strCountShade = strCountBal + 1; // Ensure it's different

    const lenShade = Math.floor(panelCount / strCountShade);
    const remShade = panelCount % strCountShade;

    options.push({
        id: "str_shade",
        title: "☁️ Shade Tolerant",
        desc: "Shorter strings. Bypasses shade better.",
        config: `${strCountShade} Strings (${remShade>0 ? `${remShade}x${lenShade+1}, ${strCountShade-remShade}x${lenShade}` : `All ${lenShade}`})`,
        valid: lenShade >= minLen,
        warning: lenShade < minLen ? "Cannot shorten further (Min Voltage limit)." : null
    });

    return options;
}

/**
 * Render string inverter-specific configuration details
 * @param {object} option - Selected design option
 * @param {object} inverter - Inverter details
 * @param {number} invCount - Inverter count
 * @param {object} s1 - Stage 1 data
 */
export function renderStringConfig(option, inverter, invCount, s1) {
    console.log("Rendering String Configuration:", option);
    
    // Additional string-specific rendering logic can go here
    // For example, MPPT distribution diagrams, voltage/current calculations, etc.
    
    return {
        systemType: "string",
        inverterModel: inverter.name,
        inverterCount: invCount,
        selectedConfig: option.config,
        bom: [],
        stringPlan: option.id,
        isValid: option.valid
    };
}

/**
 * Validate string configuration against inverter limits
 * @param {number} stringLength - Panels per string
 * @param {number} voc - Panel open circuit voltage
 * @param {number} vmp - Panel max power voltage
 * @param {object} invSpecs - Inverter specifications
 * @returns {object} Validation result
 */
export function validateStringConfig(stringLength, voc, vmp, invSpecs) {
    const maxV = invSpecs.max_dc_voltage || 1000;
    const minV = invSpecs.min_mppt_voltage || 200;
    
    const Voc_max = voc * 1.1; // Cold weather
    const Vmp_min = vmp * 0.9; // Hot weather
    
    const stringVoc = voc * stringLength * 1.1;
    const stringVmp = vmp * stringLength * 0.9;
    
    const vocValid = stringVoc <= maxV;
    const vmpValid = stringVmp >= minV;
    const isValid = vocValid && vmpValid;
    
    return {
        isValid,
        stringVoc,
        stringVmp,
        maxVoltage: maxV,
        minVoltage: minV,
        warning: !isValid ? 
            (!vocValid ? `String Voc (${stringVoc.toFixed(0)}V) exceeds max (${maxV}V)` :
             `String Vmp (${stringVmp.toFixed(0)}V) below min (${minV}V)`) :
            null
    };
}

/**
 * Calculate string current and power
 * @param {number} stringLength - Panels per string
 * @param {number} panelIsc - Panel short circuit current
 * @param {number} panelImp - Panel max power current
 * @param {number} panelWattage - Panel wattage
 * @returns {object} Current and power calculations
 */
export function calculateStringPower(stringLength, panelIsc, panelImp, panelWattage) {
    return {
        stringIsc: panelIsc,
        stringImp: panelImp,
        stringPower: panelWattage * stringLength,
        totalPanels: stringLength
    };
}

/**
 * Distribute strings across MPPT inputs
 * @param {number} totalStrings - Total number of strings
 * @param {number} mpptCount - Number of MPPT inputs
 * @returns {Array} Array showing strings per MPPT
 */
export function distributeStringsToMPPT(totalStrings, mpptCount) {
    const stringsPerMPPT = Math.floor(totalStrings / mpptCount);
    const remainder = totalStrings % mpptCount;
    
    const distribution = [];
    for (let i = 0; i < mpptCount; i++) {
        distribution.push({
            mpptIndex: i + 1,
            stringCount: stringsPerMPPT + (i < remainder ? 1 : 0)
        });
    }
    
    return distribution;
}