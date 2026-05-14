from flask import Blueprint, request, jsonify, session, current_app
import requests
from datetime import datetime
from bson.objectid import ObjectId

# Create a Blueprint named 'api'
api_bp = Blueprint('api', __name__)

# 🔑 NREL API Key
API_KEY = "oaT4eQqmbGkxXXUXeHBo7de2MQYTE0VF8LKUlbVF"
NREL_URL = "https://developer.nlr.gov/api/pvwatts/v8.json"

@api_bp.route('/get_data', methods=['POST'])
def get_data():
    # Protect API route
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    lat = data.get('latitude')
    lon = data.get('longitude')
    tilt = data.get('tilt', 19)

    # Validation
    if not lat or not lon:
        return jsonify({'error': 'Latitude and Longitude are required.'}), 400
    
    try:
        lat = float(lat)
        lon = float(lon)
        tilt = float(tilt)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid latitude, longitude, or tilt value.'}), 400

    params = {
        'api_key': API_KEY,
        'lat': lat,
        'lon': lon,
        'system_capacity': 1,
        'azimuth': 180,
        'tilt': tilt,
        'array_type': 1,
        'module_type': 1,
        'losses': 0
    }

    try:
        res = requests.get(NREL_URL, params=params, timeout=10)
        res.raise_for_status()
        result = res.json()

        outputs = result.get('outputs', {})
        
        # --- Extract ALL data points ---
        solar_rad = outputs.get('solrad_monthly', [])
        poa_monthly = outputs.get('poa_monthly', [])
        ac_energy = outputs.get('ac_monthly', [])
        dc_monthly = outputs.get('dc_monthly', [])
        temp_avg = outputs.get('tamb_monthly', [])
        tcell_monthly = outputs.get('tcell_monthly', [])
        
        capacity_factor = outputs.get('capacity_factor', 0)
        annual_ac = outputs.get('ac_annual', 0)

        if not solar_rad or len(solar_rad) != 12:
            return jsonify({'error': 'No valid solar data found for this location.'}), 404

        if not temp_avg or len(temp_avg) != 12:
            # Prefer deriving ambient from cell temperature if API provides tcell.
            if tcell_monthly and len(tcell_monthly) == 12:
                temp_avg = [t - 25 for t in tcell_monthly]
            else:
                # Sheet-like fallback: keep ambient near 26-31C if no API temp is returned.
                # Use available solar profile to shape month-to-month variation.
                if solar_rad and len(solar_rad) == 12:
                    s_min = min(solar_rad)
                    s_max = max(solar_rad)
                    span = (s_max - s_min) if (s_max - s_min) > 0 else 1
                    temp_avg = [26 + ((s - s_min) / span) * 5 for s in solar_rad]  # 26..31
                else:
                    temp_avg = [28.0] * 12
        
        temp_min = [t - 7 for t in temp_avg]
        temp_max = [t + 8 for t in temp_avg]
        
        if not poa_monthly: poa_monthly = solar_rad
        if not dc_monthly: dc_monthly = [0] * 12
        if not ac_energy: ac_energy = [0] * 12
        if not tcell_monthly:
            tcell_monthly = [t + 25 for t in temp_avg]
        
        months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

        annual_solar = round(sum(solar_rad) / 12, 2)
        annual_poa = round(sum(poa_monthly) / 12, 2)
        annual_temp = round(sum(temp_avg) / 12, 2)
        annual_min = round(sum(temp_min) / 12, 2)
        annual_max = round(sum(temp_max) / 12, 2)
        annual_dc = round(sum(dc_monthly), 0)
        annual_tcell = round(sum(tcell_monthly) / 12, 1)

        monthly_data = []
        for i in range(12):
            monthly_data.append({
                "month": months[i],
                "solar": round(solar_rad[i], 2),
                "poa": round(poa_monthly[i], 2),
                "ac_energy": round(ac_energy[i], 0),
                "dc_energy": round(dc_monthly[i], 0),
                "temp_avg": round(temp_avg[i], 1),
                "temp_min": round(temp_min[i], 1),
                "temp_max": round(temp_max[i], 1),
                "tcell": round(tcell_monthly[i], 1)
            })

        return jsonify({
            "monthly_data": monthly_data,
            "annual": {
                "solar": annual_solar,
                "poa": annual_poa,
                "temp_avg": annual_temp,
                "temp_min": annual_min,
                "temp_max": annual_max,
                "dc_energy": annual_dc,
                "tcell": annual_tcell,
                "capacity_factor": capacity_factor,
                "ac_annual": annual_ac
            },
            "location": {
                "latitude": lat,
                "longitude": lon,
                "tilt": tilt
            }
        })

    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500


@api_bp.route('/projects', methods=['GET'])
def list_projects():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    db = current_app.config.get('DB')
    if db is None:
        return jsonify({'error': 'Database unavailable'}), 503

    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'User session missing'}), 400

    docs = db.projects.find(
        {'user_id': user_id},
        {'project_number': 1, 'project_name': 1, 'updated_at': 1}
    ).sort('updated_at', -1)

    projects = []
    for d in docs:
        projects.append({
            'id': str(d.get('_id')),
            'project_number': d.get('project_number', ''),
            'project_name': d.get('project_name', ''),
            'updated_at': d.get('updated_at')
        })
    return jsonify(projects)


@api_bp.route('/projects/<project_number>', methods=['GET'])
def get_project(project_number):
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    db = current_app.config.get('DB')
    if db is None:
        return jsonify({'error': 'Database unavailable'}), 503

    user_id = session.get('user_id')
    project = db.projects.find_one({'user_id': user_id, 'project_number': project_number})
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    project['_id'] = str(project['_id'])
    return jsonify(project)


@api_bp.route('/projects/upsert-stage1', methods=['POST'])
def upsert_stage1_project():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    db = current_app.config.get('DB')
    if db is None:
        return jsonify({'error': 'Database unavailable'}), 503

    payload = request.get_json() or {}
    project_number = str(payload.get('project_number', '')).strip()
    project_name = str(payload.get('project_name', '')).strip()
    stage11 = payload.get('stage11', {})
    stage12 = payload.get('stage12', {})

    if not project_number:
        return jsonify({'error': 'project_number is required'}), 400
    if not project_name:
        return jsonify({'error': 'project_name is required'}), 400

    user_id = session.get('user_id')
    update_doc = {
        '$set': {
            'user_id': user_id,
            'username': session.get('username'),
            'project_number': project_number,
            'project_name': project_name,
            'stage11': stage11,
            'stage12': stage12,
            'updated_at': datetime.utcnow().isoformat()
        },
        '$setOnInsert': {
            'created_at': datetime.utcnow().isoformat()
        }
    }
    db.projects.update_one(
        {'user_id': user_id, 'project_number': project_number},
        update_doc,
        upsert=True
    )
    return jsonify({'ok': True, 'project_number': project_number})
