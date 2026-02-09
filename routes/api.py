from flask import Blueprint, request, jsonify, session
import requests

# Create a Blueprint named 'api'
api_bp = Blueprint('api', __name__)

# 🔑 NREL API Key
API_KEY = "oaT4eQqmbGkxXXUXeHBo7de2MQYTE0VF8LKUlbVF"
NREL_URL = "https://developer.nrel.gov/api/pvwatts/v8.json"

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
            base_temp = 25 - abs(lat) * 0.5
            temp_avg = [base_temp + 5 * (i % 6) - 10 for i in range(12)]
        
        temp_min = [t - 7 for t in temp_avg]
        temp_max = [t + 8 for t in temp_avg]
        
        if not poa_monthly: poa_monthly = solar_rad
        if not dc_monthly: dc_monthly = [0] * 12
        if not ac_energy: ac_energy = [0] * 12
        if not tcell_monthly: tcell_monthly = [t + 25 for t in temp_avg]
        
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