"""
Google OAuth Configuration for PRD-SYS
"""
import os
from google.auth.transport import requests
from google.oauth2 import id_token

GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', 'your-google-client-id.apps.googleusercontent.com')

def verify_google_token(token):
    """Verify Google OAuth token and return user info"""
    try:
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')
        
        return {
            'user_id': idinfo['sub'],
            'email': idinfo['email'],
            'name': idinfo.get('name', ''),
            'picture': idinfo.get('picture', ''),
            'verified': idinfo.get('email_verified', False)
        }
    except Exception as e:
        print(f"Error verifying Google token: {e}")
        return None
