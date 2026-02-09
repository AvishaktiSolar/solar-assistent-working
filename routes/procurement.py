from flask import Blueprint, render_template, request, redirect, url_for, session, jsonify
import json
import os
import math  # Required for engineering calculations

procurement_bp = Blueprint('procurement', __name__)

DATA_FILE = 'materials.json'

# --- Helper: Load/Save JSON Data ---
def load_data():
    """Safely loads data from materials.json"""
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return [] # Return empty list if file is corrupt

def save_data(data):
    """Safely saves data to materials.json"""
    try:
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except IOError as e:
        print(f"Error saving data: {e}")

# --- Pages ---

@procurement_bp.route('/procurement')
def dashboard():
    # Security Check
    if not session.get('logged_in') or session.get('role') != 'procurement':
        return redirect(url_for('auth.login'))
        
    materials = load_data()
    return render_template('procurement.html', materials=materials)

# --- API Endpoints (For Dropdowns) ---

@procurement_bp.route('/procurement/api/get_panels', methods=['GET'])
def get_solar_panels():
    """Returns Solar Panels for Stage 1"""
    if not session.get('logged_in'): return jsonify({'error': 'Unauthorized'}), 401
    materials = load_data()
    panels = [m for m in materials if m.get('category') == 'Solar Panel']
    return jsonify(panels)

@procurement_bp.route('/procurement/api/get_inverters', methods=['GET'])
def get_inverters():
    """Returns Inverters for Stage 2"""
    if not session.get('logged_in'): return jsonify({'error': 'Unauthorized'}), 401
    materials = load_data()
    inverters = [m for m in materials if m.get('category') == 'Inverter']
    return jsonify(inverters)

@procurement_bp.route('/procurement/api/get_optimizers', methods=['GET'])
def get_optimizers():
    """Returns Optimizers for Stage 2"""
    if not session.get('logged_in'): return jsonify({'error': 'Unauthorized'}), 401
    materials = load_data()
    opts = [m for m in materials if m.get('category') == 'Optimizer']
    return jsonify(opts)

# --- API: PHYSICS ENGINE (The Calculation Logic) ---
@procurement_bp.route('/api/calculate-strings', methods=['POST'])
def calculate_strings():
    """
    Calculates string sizing limits based on Panel Specs, Inverter Limits, and Temperature.
    Returns safe string lengths and MPPT safety data.
    """
    if not session.get('logged_in'): return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    materials = load_data()
    
    # 1. Find Selected Components
    try:
        # We convert IDs to strings for robust comparison
        panel = next(p for p in materials if str(p['id']) == str(data.get('panel_id')))
        inverter = next(i for i in materials if str(i['id']) == str(data.get('inverter_id')))
    except StopIteration:
        return jsonify({'error': 'Component not found'}), 400

    p_spec = panel.get('specifications', {})
    i_spec = inverter.get('specifications', {})

    # 2. Extract Values (Use Safe Defaults if data missing)
    voc = float(p_spec.get('voc', 0))
    vmp = float(p_spec.get('vmp', 0))
    isc = float(p_spec.get('isc', 0))
    imp = float(p_spec.get('imp', 0))
    
    # Coefficients: Handle typical formats (-0.29 vs -0.29%)
    raw_beta = float(p_spec.get('voc_coeff', -0.29))
    beta_voc = raw_beta / 100 if abs(raw_beta) > 1 else raw_beta
    
    raw_gamma = float(p_spec.get('pmax_coeff', -0.35))
    gamma_pmax = raw_gamma / 100 if abs(raw_gamma) > 1 else raw_gamma
    
    vmax_inv = float(i_spec.get('vmax', 1000))
    vmin_inv = float(i_spec.get('vmin', 160))
    
    # Inverter Current Limits (Critical for Parallel String check)
    # If 'imax' is missing, assume a standard 15A per MPPT
    imax_input_per_mppt = float(i_spec.get('imax', 15)) 

    # User Inputs (Temperature)
    t_min = float(data.get('temp_min', 10))
    t_max = float(data.get('temp_max', 70))

    # --- 3. PHYSICS CALCULATION ---
    
    # A. Check for SolarEdge (requires Optimizer logic, not String logic)
    if "SolarEdge" in inverter.get('name', ''):
        return jsonify({ 'type': 'solaredge', 'message': 'Optimizer logic required' })

    # B. Temperature Correction
    # Voc rises in cold (Safety Risk)
    voc_max_cold = voc * (1 + beta_voc * (t_min - 25))
    # Vmp drops in heat (Performance Risk)
    vmp_min_hot = vmp * (1 + gamma_pmax * (t_max - 25))

    # C. String Sizing Limits
    # Max strings: Voltage must stay below Inverter Vmax
    max_string = math.floor(vmax_inv / voc_max_cold) if voc_max_cold > 0 else 0
    # Min strings: Voltage must stay above Inverter Start/MPPT Min
    min_string = math.ceil(vmin_inv / vmp_min_hot) if vmp_min_hot > 0 else 0

    return jsonify({
        'type': 'string',
        'min_string': min_string,
        'max_string': max_string,
        'voc_cold': round(voc_max_cold, 2),
        'vmp_hot': round(vmp_min_hot, 2),
        'mppt_count': int(i_spec.get('mppt', 1)),
        'max_current_per_mppt': imax_input_per_mppt,
        'panel_isc': isc,
        'panel_imp': imp
    })

# --- SMART STAGE 3 API (Fuzzy Matching) ---
@procurement_bp.route('/procurement/api/get_stage3_materials', methods=['GET'])
def get_stage3_materials():
    """
    Returns consolidated electrical materials for Stage 3.
    Uses 'Fuzzy Matching' to sort generic items into DC/AC buckets.
    """
    if not session.get('logged_in'): return jsonify({'error': 'Unauthorized'}), 401

    materials = load_data()
    
    def has(text, keyword):
        if not text: return False
        return keyword.upper() in str(text).upper()

    response = {
        "cables_dc": [m for m in materials if 
                      (has(m.get('category'), 'Cable') or has(m.get('category'), 'Wire')) 
                      and (has(m.get('name'), 'DC') or has(m.get('name'), 'Solar') or has(m.get('subcategory'), 'DC'))],
        
        "cables_ac": [m for m in materials if 
                      (has(m.get('category'), 'Cable') or has(m.get('category'), 'Wire')) 
                      and (has(m.get('name'), 'AC') or has(m.get('name'), 'Arm') or has(m.get('name'), 'Copper') or has(m.get('name'), 'Alu') or has(m.get('subcategory'), 'AC'))],
        
        "protection_dc": [m for m in materials if 
                          (has(m.get('category'), 'Protection') or has(m.get('category'), 'Switchgear') or has(m.get('category'), 'Breaker'))
                          and (has(m.get('name'), 'DC') or has(m.get('subcategory'), 'DC') or has(m.get('name'), 'Fuse'))],
                          
        "protection_ac": [m for m in materials if 
                          (has(m.get('category'), 'Protection') or has(m.get('category'), 'Switchgear') or has(m.get('category'), 'Breaker'))
                          and (has(m.get('name'), 'AC') or has(m.get('name'), 'MCB') or has(m.get('name'), 'MCCB') or has(m.get('subcategory'), 'AC'))],
        
        "boxes": [m for m in materials if 
                  has(m.get('category'), 'Box') or has(m.get('category'), 'DB') or has(m.get('category'), 'Enclosure') 
                  or has(m.get('name'), 'DB') or has(m.get('name'), 'Box')]
    }
    
    return jsonify(response)

# --- Actions (Add / Edit / Delete) ---

@procurement_bp.route('/procurement/save', methods=['POST'])
def save_material():
    if not session.get('logged_in'): return redirect(url_for('auth.login'))
    
    materials = load_data()
    
    # 1. Get Basic Data
    material_id = request.form.get('id')
    category = request.form.get('category')
    subcategory = request.form.get('subcategory', '-')
    name = request.form.get('name')
    
    # Handle numbers carefully
    try:
        stock = int(request.form.get('stock'))
    except (ValueError, TypeError):
        stock = 0
        
    try:
        rate = float(request.form.get('rate'))
    except (ValueError, TypeError):
        rate = 0.0
        
    unit = request.form.get('unit')

    # 2. Handle Specifications (JSON String -> Object)
    specs_input = request.form.get('specs')
    specifications = {}
    
    if specs_input:
        try:
            specifications = json.loads(specs_input)
        except json.JSONDecodeError:
            specifications = {"details": specs_input}

    if material_id: 
        # --- UPDATE EXISTING ---
        try:
            material_id = int(material_id)
            for item in materials:
                if item['id'] == material_id:
                    item['category'] = category
                    item['subcategory'] = subcategory
                    item['name'] = name
                    item['specifications'] = specifications 
                    item['stock'] = stock
                    item['unit'] = unit
                    item['rate'] = rate
                    break
        except ValueError:
            pass 
    else:
        # --- CREATE NEW ---
        new_id = 1
        if materials:
            new_id = max(item['id'] for item in materials) + 1
            
        new_item = {
            "id": new_id,
            "category": category,
            "subcategory": subcategory,
            "name": name,
            "specifications": specifications,
            "stock": stock,
            "unit": unit,
            "rate": rate
        }
        materials.append(new_item)
    
    save_data(materials)
    return redirect(url_for('procurement.dashboard'))

@procurement_bp.route('/procurement/delete/<int:id>')
def delete_material(id):
    if not session.get('logged_in'): return redirect(url_for('auth.login'))
    
    materials = load_data()
    materials = [m for m in materials if m['id'] != id]
    save_data(materials)
    
    return redirect(url_for('procurement.dashboard'))