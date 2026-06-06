"""
JWT and Session Management for SentinelStream
"""
import jwt
import os
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import request, jsonify

JWT_SECRET = os.getenv('JWT_SECRET', 'sentinelstream_super_secret_jwt_key_2024')
JWT_ALGORITHM = 'HS256'
TOKEN_EXPIRY_MINUTES = 30

def create_token(user_id, username, email):
    """Create JWT token with 30-minute expiry"""
    payload = {
        'user_id': user_id,
        'username': username,
        'email': email,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRY_MINUTES)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token):
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def refresh_token(token):
    """Refresh an existing token"""
    payload = verify_token(token)
    if not payload:
        return None
    
    return create_token(payload['user_id'], payload['username'], payload['email'])

def token_required(f):
    """Decorator to protect endpoints with token validation"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        
        # Check Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'error': 'Token missing'}), 401
        
        payload = verify_token(token)
        if not payload:
            return jsonify({'error': 'Token invalid or expired'}), 401
        
        request.user = payload
        return f(*args, **kwargs)
    
    return decorated_function
