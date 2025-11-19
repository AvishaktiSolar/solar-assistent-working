from flask import Flask, render_template, session, redirect, url_for
import os
from routes.auth import auth_bp
from routes.api import api_bp

# Initialize Flask App
app = Flask(__name__, template_folder='templates', static_folder='static')

# Set Secret Key (Required for session)
# In production, ensure this key is set via environment variables for security
app.secret_key = os.environ.get('SECRET_KEY', 'super_secret_key_change_this_in_production')

# --- Register Blueprints ---
# This connects your routes/auth.py and routes/api.py files to the main app
app.register_blueprint(auth_bp)
app.register_blueprint(api_bp)

# --- Main Index Route ---
@app.route('/')
def index():
    # Protect the home route: Redirect to login if not authenticated
    if not session.get('logged_in'):
        return redirect(url_for('auth.login'))
        
    return render_template('index.html')

if __name__ == '__main__':
    # Use environment variables for port and set debug=False for production
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Flask server on port {port}...")
    app.run(debug=True, host='0.0.0.0', port=port)