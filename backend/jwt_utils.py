"""
JWT and Session Management for SelectShans
"""
import jwt
import os
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import request, jsonify, g

def get_jwt_secret():
    secret = os.getenv('JWT_SECRET')
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is required")
    return secret

JWT_ALGORITHM = 'HS256'
MAX_SESSION_SECONDS = 450  # 7.5 minutes hard limit

def get_token_expiry_timedelta():
    expires_in = os.getenv("JWT_EXPIRES_IN", "450s").strip().lower()
    if expires_in.endswith('s'):
        seconds = int(expires_in[:-1])
    elif expires_in.endswith('m'):
        seconds = int(expires_in[:-1]) * 60
    elif expires_in.endswith('h'):
        seconds = int(expires_in[:-1]) * 3600
    elif expires_in.endswith('d'):
        seconds = int(expires_in[:-1]) * 86400
    else:
        seconds = int(expires_in) * 60
    return timedelta(seconds=min(seconds, MAX_SESSION_SECONDS))

def create_token(user_id, username, email, role='user', expiry_timedelta=None):
    """Create JWT token with strict 7.5-minute maximum expiry"""
    delta = expiry_timedelta if expiry_timedelta is not None else get_token_expiry_timedelta()
    payload = {
        'user_id': user_id,
        'username': username,
        'email': email,
        'role': role or 'user',
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + delta
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def verify_token(token):
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError as e:
        print(f"InvalidTokenError: {e}")
        return None

def token_required(f):
    """Decorator to protect endpoints with token validation"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                parts = auth_header.split(" ")
                token = parts[1] if len(parts) > 1 else parts[0]
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401

        if not token or token in ('null', 'undefined', ''):
            return jsonify({'error': 'Token missing'}), 401

        payload = verify_token(token)
        if not payload:
            return jsonify({'error': 'Token invalid or expired'}), 401

        g.user = payload
        return f(*args, **kwargs)

    return decorated_function