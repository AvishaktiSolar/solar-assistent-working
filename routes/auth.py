from flask import Blueprint, render_template, request, redirect, url_for, flash, session
import os

# Create a Blueprint named 'auth'
auth_bp = Blueprint('auth', __name__)

# --- Master Admin Credentials (from environment variables) ---
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'avishaktiSolar')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'avishaktiSolar2025')

# --- Routes ---

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # Master Admin Check
        if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session['logged_in'] = True
            session['username'] = "Master Admin"
            flash('Login successful!', 'success')
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error="Invalid username or password")
            
    return render_template('login.html')

@auth_bp.route('/logout')
def logout():
    session.pop('logged_in', None)
    session.pop('username', None)
    flash('Logged out successfully.', 'success')
    return redirect(url_for('auth.login'))



# from flask import Blueprint, render_template, request, redirect, url_for, flash, session
# from werkzeug.security import generate_password_hash, check_password_hash
# import json
# import os
# import uuid
# import datetime
# import smtplib
# from email.mime.text import MIMEText
# from email.mime.multipart import MIMEMultipart

# # Create a Blueprint named 'auth'
# auth_bp = Blueprint('auth', __name__)

# # --- JSON Data Storage Logic ---
# USERS_FILE = 'users.json'

# def load_users():
#     if not os.path.exists(USERS_FILE):
#         return {}
#     try:
#         with open(USERS_FILE, 'r') as f:
#             return json.load(f)
#     except (json.JSONDecodeError, IOError):
#         return {}

# def save_users(users):
#     with open(USERS_FILE, 'w') as f:
#         json.dump(users, f, indent=4)

# # --- Email Configuration ---
# # We use environment variables first, but fallback to the hardcoded values for local testing
# SMTP_SERVER = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
# SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
# SMTP_USERNAME = os.environ.get('SMTP_USERNAME', 'gmail here') 
# # IMPORTANT: Ensure this is your 16-character Google App Password
# SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', 'password here')   
# SENDER_EMAIL = SMTP_USERNAME

# def send_verification_email(to_email, token):
#     # Check if credentials are valid (simple check to see if they are defaults)
#     if not SMTP_USERNAME or not SMTP_PASSWORD:
#         print("⚠️ Email credentials not set. Skipping email sending.")
#         print(f"-> Verification Link: {request.host_url}verify/{token}")
#         return False

#     subject = "Verify your email for Avishakti Solar"
#     verification_url = url_for('auth.verify_email', token=token, _external=True)
    
#     html = f"""
#     <html>
#         <body>
#             <h2>Welcome to Avishakti Solar!</h2>
#             <p>Please click the link below to verify your email address:</p>
#             <a href="{verification_url}">Verify Email</a>
#             <p>Or copy this link: {verification_url}</p>
#         </body>
#     </html>
#     """

#     msg = MIMEMultipart()
#     msg['From'] = SENDER_EMAIL
#     msg['To'] = to_email
#     msg['Subject'] = subject
#     msg.attach(MIMEText(html, 'html'))

#     try:
#         server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
#         server.starttls()
#         server.login(SMTP_USERNAME, SMTP_PASSWORD)
#         server.sendmail(SENDER_EMAIL, to_email, msg.as_string())
#         server.quit()
#         print(f"✅ Verification email sent to {to_email}")
#         return True
#     except Exception as e:
#         print(f"❌ Error sending email: {e}")
#         return False

# # --- Routes ---

# @auth_bp.route('/register', methods=['GET', 'POST'])
# def register():
#     if request.method == 'POST':
#         username = request.form.get('username')
#         password = request.form.get('password')
#         email = request.form.get('email')
        
#         users = load_users()
        
#         if username in users:
#             return render_template('register.html', error="Username already exists.")
        
#         for user in users.values():
#             if user.get('email') == email:
#                 return render_template('register.html', error="Email already registered.")

#         verification_token = str(uuid.uuid4())
#         hashed_password = generate_password_hash(password)
        
#         users[username] = {
#             'password': hashed_password,
#             'email': email,
#             'verified': False,
#             'verification_token': verification_token,
#             'created_at': str(datetime.datetime.now())
#         }
        
#         save_users(users)
        
#         if send_verification_email(email, verification_token):
#             flash('Registration successful! Please check your email to verify your account.', 'success')
#         else:
#             flash('Registration successful, but failed to send email. (Check console for link)', 'warning')
            
#         return redirect(url_for('auth.login'))
        
#     return render_template('register.html')

# @auth_bp.route('/verify/<token>')
# def verify_email(token):
#     users = load_users()
#     verified = False
    
#     for username, data in users.items():
#         if data.get('verification_token') == token:
#             users[username]['verified'] = True
#             users[username]['verification_token'] = None
#             verified = True
#             break
    
#     if verified:
#         save_users(users)
#         flash('Email verified successfully! You can now login.', 'success')
#     else:
#         flash('Invalid or expired verification token.', 'error')
        
#     return redirect(url_for('auth.login'))

# @auth_bp.route('/login', methods=['GET', 'POST'])
# def login():
#     if request.method == 'POST':
#         username = request.form.get('username')
#         password = request.form.get('password')

#         # --- MASTER ADMIN CHECK (Bypasses DB and Verification) ---
#         if username == "avishaktiSolar" and password == "avishaktiSolar2025":
#             session['logged_in'] = True
#             session['username'] = "Master Admin"
#             return redirect(url_for('index'))
#         # ---------------------------------------------------------
        
#         # Normal User Check
#         users = load_users()
#         user_data = users.get(username)
        
#         if user_data and check_password_hash(user_data['password'], password):
#             if not user_data.get('verified', False):
#                 return render_template('login.html', error="Please verify your email first.")
                
#             session['logged_in'] = True
#             session['username'] = username
#             return redirect(url_for('index')) # Redirects to the main index route
#         else:
#             return render_template('login.html', error="Invalid username or password")
            
#     return render_template('login.html')

# @auth_bp.route('/logout')
# def logout():
#     session.pop('logged_in', None)
#     session.pop('username', None)
#     return redirect(url_for('auth.login'))