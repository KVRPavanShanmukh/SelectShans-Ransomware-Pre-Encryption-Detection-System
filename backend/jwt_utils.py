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

def get_token_expiry_timedelta():
    expires_in = os.getenv("JWT_EXPIRES_IN", "30m")
    if expires_in.endswith('d'):
        return timedelta(days=int(expires_in[:-1]))
    elif expires_in.endswith('h'):
        return timedelta(hours=int(expires_in[:-1]))
    elif expires_in.endswith('m'):
        return timedelta(minutes=int(expires_in[:-1]))
    else:
        return timedelta(minutes=int(expires_in)) # Default to minutes if no suffix

def create_token(user_id, username, email, role='user', expiry_timedelta=None):
    """Create JWT token with configurable expiry or custom duration and role claim"""
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
        print("ExpiredSignatureError")
        return None
    except jwt.InvalidTokenError as e:
        print(f"InvalidTokenError: {e}")
        return None

def decode_token_ignore_exp(token):
    """Decode token payload without verifying expiration (for session grace/extension evaluation)"""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
        return payload
    except jwt.InvalidTokenError as e:
        print(f"InvalidTokenError in ignore_exp: {e}")
        return None

def refresh_token(token):
    """Refresh an existing token"""
    payload = verify_token(token)
    if not payload:
        return None
    
    return create_token(payload['user_id'], payload['username'], payload['email'], role=payload.get('role', 'user'))

def token_required(f):
    """Decorator to protect endpoints with token validation"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        
        # Check Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                parts = auth_header.split(" ")
                if len(parts) > 1:
                    token = parts[1]
                else:
                    token = parts[0]
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token or token in ('null', 'undefined', ''):
            print("Token missing in headers")
            return jsonify({'error': 'Token missing'}), 401
        
        payload = verify_token(token)
        if not payload:
            print(f"Token invalid or expired: {token}")
            return jsonify({'error': 'Token invalid or expired'}), 401
        
        g.user = payload
        return f(*args, **kwargs)
    
    return decorated_function
