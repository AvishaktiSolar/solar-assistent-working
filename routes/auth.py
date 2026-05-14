from flask import Blueprint, render_template, request, redirect, url_for, session, current_app

# Create a Blueprint named 'auth'
auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        db = current_app.config.get('DB')
        if db is None:
            error = "Database unavailable. Please try again later."
            return render_template('login.html', error=error)

        user = db.users.find_one({"username": username})

        if user and user.get('password') == password:
            session['logged_in'] = True
            session['user_id'] = str(user['_id'])
            session['username'] = user.get('username', '')
            session['role'] = user.get('role', '')

            if user.get('role') == 'admin':
                return redirect(url_for('index'))
            return redirect(url_for('procurement.dashboard'))

        error = "Invalid Credentials"
            
    return render_template('login.html', error=error)

@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth.login'))


