"""
Admin API routes for SentinelStream
"""
from flask import jsonify, request, send_file
from datetime import datetime
from cryptography.fernet import Fernet
import io
import base64
import hashlib
import os


def register_admin_routes(app, pool):
    """Register all admin-related routes"""
    
    @app.route('/api/admin/log-retention', methods=['GET', 'POST'])
    def handle_log_retention():
        data = request.get_json() if request.method == 'POST' else None
        user_id = data.get('user_id') if data else request.args.get('user_id')
        
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            if request.method == 'POST':
                days = data.get('days')
                cursor.execute("""
                    INSERT INTO admin_settings (user_id, log_retention_days)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE log_retention_days = VALUES(log_retention_days)
                """, (user_id, days))
                conn.commit()
                
                cursor.execute("INSERT INTO audit_log (user_id, action, description) VALUES (%s, %s, %s)",
                             (user_id, 'LOG_RETENTION_CHANGED', f'Changed log retention to {days} days'))
                conn.commit()
                
                return jsonify({"status": "success", "days": days}), 200
            else:
                cursor.execute("SELECT log_retention_days FROM admin_settings WHERE user_id = %s", (user_id,))
                result = cursor.fetchone()
                retention_days = result['log_retention_days'] if result else 30
                return jsonify({"days": retention_days}), 200
        except Exception as e:
            print(f"Error handling log retention: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            cursor.close()
            conn.close()
    
    
    @app.route('/api/admin/clear-data', methods=['POST'])
    def clear_all_data():
        data = request.get_json()
        user_id = data.get('user_id')
        
        conn = pool.get_connection()
        cursor = conn.cursor()
        
        try:
            # Delete event logs and related data
            cursor.execute("DELETE FROM event_logs")
            cursor.execute("DELETE FROM log_hashes")
            cursor.execute("DELETE FROM alerts")
            
            # Log the action
            cursor.execute("INSERT INTO audit_log (user_id, action, description) VALUES (%s, %s, %s)",
                         (user_id, 'DATA_CLEARED', 'All data purged'))
            
            conn.commit()
            return jsonify({"status": "success", "message": "All data cleared"}), 200
        except Exception as e:
            print(f"Error clearing data: {e}")
            conn.rollback()
            return jsonify({"error": str(e)}), 500
        finally:
            cursor.close()
            conn.close()
    
    
    @app.route('/api/admin/profile', methods=['GET', 'POST'])
    def handle_profile():
        data = request.get_json() if request.method == 'POST' else None
        user_id = data.get('user_id') if data else request.args.get('user_id')
        
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            if request.method == 'POST':
                full_name = data.get('full_name')
                phone = data.get('phone')
                organization = data.get('organization')
                notification_email = data.get('notification_email')
                
                cursor.execute("""
                    INSERT INTO user_profiles (user_id, full_name, phone, organization, notification_email)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE 
                        full_name = VALUES(full_name),
                        phone = VALUES(phone),
                        organization = VALUES(organization),
                        notification_email = VALUES(notification_email)
                """, (user_id, full_name, phone, organization, notification_email))
                conn.commit()
                
                cursor.execute("INSERT INTO audit_log (user_id, action, description) VALUES (%s, %s, %s)",
                             (user_id, 'PROFILE_UPDATED', 'User profile updated'))
                conn.commit()
                
                return jsonify({"status": "success"}), 200
            else:
                cursor.execute("""
                    SELECT * FROM user_profiles WHERE user_id = %s
                """, (user_id,))
                profile = cursor.fetchone()
                
                if not profile:
                    cursor.execute("SELECT username, email FROM users WHERE id = %s", (user_id,))
                    user = cursor.fetchone()
                    profile = {
                        'user_id': user_id,
                        'full_name': None,
                        'phone': None,
                        'organization': None,
                        'notification_email': user['email'] if user else None,
                        'username': user['username'] if user else None,
                        'email': user['email'] if user else None
                    }
                
                return jsonify(profile), 200
        except Exception as e:
            print(f"Error handling profile: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            cursor.close()
            conn.close()
    
    
    @app.route('/api/admin/audit-log', methods=['GET'])
    def get_audit_log():
        user_id = request.args.get('user_id')
        password = request.args.get('password', '').encode('utf-8')
        
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            cursor.execute("""
                SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 1000
            """)
            logs = cursor.fetchall()
            
            if not logs:
                return jsonify({"error": "No audit logs found"}), 404
            
            # Convert logs to readable format
            log_content = "SentinelStream AUDIT LOG\n"
            log_content += f"Generated: {datetime.now().isoformat()}\n"
            log_content += "=" * 80 + "\n\n"
            
            for log in logs:
                log_content += f"[{log['timestamp']}] {log['action']}\n"
                if log['description']:
                    log_content += f"Description: {log['description']}\n"
                if log['ip_address']:
                    log_content += f"IP: {log['ip_address']}\n"
                log_content += "-" * 80 + "\n"
            
            # Create an encrypted file (using AES encryption with user password)
            # Derive key from password
            key = base64.urlsafe_b64encode(hashlib.sha256(password).digest())
            cipher = Fernet(key)
            encrypted_content = cipher.encrypt(log_content.encode())
            
            # Send as file
            buffer = io.BytesIO(encrypted_content)
            buffer.seek(0)
            
            return send_file(
                buffer,
                mimetype="application/octet-stream",
                as_attachment=True,
                download_name=f"audit_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.enc"
            )
        except Exception as e:
            print(f"Error generating audit log: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            cursor.close()
            conn.close()

