from flask import Blueprint, render_template, request, redirect, url_for, session
import os

# Create a Blueprint named 'auth'
auth_bp = Blueprint('auth', __name__)

# --- Credentials ---
ADMIN_USERNAME = "avishaktiSolar"
ADMIN_PASSWORD = "avishaktiSolar2025"  # Your Master Password

# NEW: Procurement Credentials
PROCURE_USERNAME = "procure"
PROCURE_PASSWORD = "procure2025"

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # 1. Master Admin Check -> Goes to Design Tool
        if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session['logged_in'] = True
            session['role'] = 'admin'
            session['username'] = "Master Admin"
            return redirect(url_for('index'))
            
        # 2. Procurement Check -> Goes to Material Dashboard
        elif username == PROCURE_USERNAME and password == PROCURE_PASSWORD:
            session['logged_in'] = True
            session['role'] = 'procurement'
            session['username'] = "Procurement Officer"
            return redirect(url_for('procurement.dashboard')) 
            
        else:
            error = "Invalid Credentials"
            
    return render_template('login.html', error=error)

@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth.login'))


