from flask import Flask, render_template, session, redirect, url_for, request, jsonify
import os
from datetime import timedelta
from routes.auth import auth_bp
from routes.api import api_bp

# Initialize Flask App
app = Flask(__name__, template_folder='templates', static_folder='static')

# Set Secret Key
app.secret_key = os.environ.get('SECRET_KEY', 'super_secret_key_change_this_in_production')

# --- STRICT SESSION CONFIGURATION ---
# 1. session.permanent = False (Default): Session dies when browser closes.
# 2. Short Lifetime: Even if browser stays open, kill session after 15 mins of inactivity.
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=15)

# --- Register Blueprints ---
app.register_blueprint(auth_bp)
app.register_blueprint(api_bp)

# --- Global Route Protection ---
# This runs before EVERY request to ensure security
@app.before_request
def require_login():
    # List of endpoints that don't require login
    allowed_endpoints = ['auth.login', 'static', 'auth.logout']
    
    # Check if user is logged in
    is_logged_in = session.get('logged_in')
    
    # If NOT logged in AND trying to access a protected route
    if not is_logged_in:
        # Allow static files (css/js/images) to load so the login page looks right
        if request.endpoint and 'static' in request.endpoint:
            return
        
        # Allow access to the login page itself
        if request.endpoint in allowed_endpoints:
            return
            
        # Force redirect to login for everything else
        return redirect(url_for('auth.login'))

# --- Main Index Route ---
@app.route('/')
def index():
    # The @before_request handler protects this, but double-check is fine
    return render_template('index.html')

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