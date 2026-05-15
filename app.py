from flask import Flask, render_template, session, redirect, url_for, request, jsonify
import os
from datetime import timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

# --- Import Routes ---
from routes.auth import auth_bp
from routes.api import api_bp
from routes.procurement import procurement_bp

# Initialize Flask App
app = Flask(__name__, template_folder='templates', static_folder='static')

# Load environment variables from .env (if present)
load_dotenv()

# Set Secret Key
app.secret_key = os.environ.get('SECRET_KEY', 'avishakti_secure_key')

# --- MongoDB Configuration ---
MONGO_URI = os.environ.get('MONGO_URI')

def init_mongo_connection(flask_app):
    """Initialize and validate a MongoDB connection.
    Returns True if connected, False otherwise.
    """
    try:
        if not MONGO_URI:
            raise ValueError("MONGO_URI is missing. Set it in your environment or .env file.")

        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # Force connection now so startup/runtime failures are explicit.
        client.admin.command('ping')

        flask_app.config['MONGO_CLIENT'] = client
        flask_app.config['DB'] = client['avishakti_solar']
        print("Connected to MongoDB Atlas successfully!")
        return True
    except Exception as e:
        flask_app.config['MONGO_CLIENT'] = None
        flask_app.config['DB'] = None
        print(f"MongoDB connection failed: {e}")
        return False

init_mongo_connection(app)

# ============================================
# SESSION CONFIGURATION - UPDATED TO FIX AUTO-LOGOUT
# ============================================
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)
app.config['SESSION_PERMANENT'] = True

# --- Register Blueprints ---
app.register_blueprint(auth_bp)
app.register_blueprint(api_bp)
app.register_blueprint(procurement_bp)

# --- Global Route Protection ---
@app.before_request
def require_login():
    # If DB dropped during runtime/startup, try reconnecting automatically.
    if app.config.get('DB') is None:
        init_mongo_connection(app)

    # List of endpoints that don't require login 
    allowed_endpoints = [
        'auth.login',      # Allow login page
        'auth.logout',     # Allow logout
        'static',          # Allow static files (CSS, JS, images)
        'api.get_data',    # Allow API data
        'api.ping'         # Allow keep-alive ping
    ]
    
    # Allow static files (CSS, JS, images, etc.)
    if request.endpoint and request.endpoint == 'static':
        return
    
    # Allow whitelisted endpoints
    if request.endpoint in allowed_endpoints:
        return
    
    # Check if user is logged in
    is_logged_in = session.get('logged_in')
    
    # If NOT logged in, redirect to login page
    if not is_logged_in:
        return redirect(url_for('auth.login'))

# --- Main Index Route (Role-Based Dispatcher) ---
@app.route('/')
def index():
    # Check if logged in (redundant but safe)
    if not session.get('logged_in'):
        return redirect(url_for('auth.login'))
    
    # 1. If Procurement User -> Redirect to Inventory Dashboard
    if session.get('role') == 'procurement':
        return redirect(url_for('procurement.dashboard'))
    
    # 2. If Master Admin -> Show Solar Design Tool
    return render_template('index.html')

# ============================================
# OPTIONAL: KEEP-ALIVE ENDPOINT
# ============================================
@app.route('/api/ping')
def ping():
    """Keep-alive endpoint to prevent session timeout"""
    from datetime import datetime
    return jsonify({
        'status': 'alive', 
        'timestamp': datetime.now().isoformat(),
        'logged_in': session.get('logged_in', False)
    })

# --- Error Handling ---
@app.errorhandler(400)
def bad_request(e):
    return jsonify(error=str(e)), 400

@app.errorhandler(500)
def server_error(e):
    return jsonify(error="Internal Server Error: " + str(e)), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Flask server on port {port}...")
    app.run(debug=True, host='0.0.0.0', port=port)
