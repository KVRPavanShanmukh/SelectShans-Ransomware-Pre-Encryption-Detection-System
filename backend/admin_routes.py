"""
Admin API routes for SentinelStream / SelectShans SOC
"""
from flask import jsonify, request, send_file
from datetime import datetime
from werkzeug.security import generate_password_hash
import io
import base64
import hashlib
import os

# ReportLab PDF imports
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch


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
        
        if not user_id:
            return jsonify({"error": "user_id is required"}), 400

        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            if request.method == 'POST':
                username = data.get('username')
                full_name = data.get('full_name')
                phone = data.get('phone')
                organization = data.get('organization')
                address = data.get('address')
                dob = data.get('dob')
                notification_email = data.get('notification_email')
                new_password = data.get('new_password')
                
                # 1. Update users table (username, dob, new_password)
                if username or dob or new_password:
                    update_fields = []
                    update_params = []
                    
                    if username and username.strip():
                        # Check if username is taken by another user
                        cursor.execute("SELECT id FROM users WHERE username = %s AND id != %s", (username.strip(), user_id))
                        if cursor.fetchone():
                            return jsonify({"error": "Username already taken by another user"}), 409
                        update_fields.append("username = %s")
                        update_params.append(username.strip())
                        
                    if dob is not None:
                        update_fields.append("dob = %s")
                        update_params.append(dob.strip())
                        
                    if new_password and new_password.strip():
                        update_fields.append("password_hash = %s")
                        update_params.append(generate_password_hash(new_password.strip()))
                        
                    if update_fields:
                        update_query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = %s"
                        update_params.append(user_id)
                        cursor.execute(update_query, tuple(update_params))
                
                # 2. Update user_profiles table (Note: email is locked and NOT updated)
                cursor.execute("""
                    INSERT INTO user_profiles (user_id, full_name, phone, organization, address, notification_email)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE 
                        full_name = VALUES(full_name),
                        phone = VALUES(phone),
                        organization = VALUES(organization),
                        address = VALUES(address),
                        notification_email = VALUES(notification_email)
                """, (user_id, full_name, phone, organization, address, notification_email))
                
                conn.commit()
                
                cursor.execute("INSERT INTO audit_log (user_id, action, description) VALUES (%s, %s, %s)",
                             (user_id, 'PROFILE_UPDATED', 'User profile updated (Username, Name, Phone, DOB, Address)'))
                conn.commit()
                
                return jsonify({"status": "success", "message": "Profile updated successfully"}), 200
            else:
                # GET profile
                cursor.execute("SELECT id, username, email, dob FROM users WHERE id = %s", (user_id,))
                user = cursor.fetchone()
                
                if not user:
                    return jsonify({"error": "User not found"}), 404
                    
                cursor.execute("SELECT * FROM user_profiles WHERE user_id = %s", (user_id,))
                profile = cursor.fetchone() or {}
                
                response_data = {
                    'user_id': user['id'],
                    'username': user['username'],
                    'email': user['email'], # Locked, read-only identity token
                    'dob': user.get('dob', '300706'),
                    'full_name': profile.get('full_name', ''),
                    'phone': profile.get('phone', ''),
                    'organization': profile.get('organization', ''),
                    'address': profile.get('address', ''),
                    'notification_email': profile.get('notification_email') or user['email']
                }
                
                return jsonify(response_data), 200
        except Exception as e:
            print(f"Error handling profile: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            cursor.close()
            conn.close()
    
    
    @app.route('/api/admin/audit-log', methods=['GET'])
    def get_audit_log():
        user_id = request.args.get('user_id')
        log_format = request.args.get('format', 'pdf').lower().strip() # 'pdf', 'txt', or 'json'
        
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            cursor.execute("""
                SELECT a.id, a.user_id, a.action, a.description, a.ip_address, a.timestamp, u.username, u.email
                FROM audit_log a
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.timestamp DESC LIMIT 1000
            """)
            logs = cursor.fetchall()
            
            # If JSON format requested (for live UI preview in frontend)
            if log_format == 'json':
                for l in logs:
                    if l.get('timestamp'):
                        l['timestamp'] = l['timestamp'].isoformat()
                return jsonify(logs), 200
                
            if not logs:
                logs = [{
                    "id": 1,
                    "user_id": user_id or 1,
                    "username": "SOC-Admin",
                    "email": "admin@selectshans.sec",
                    "action": "SYSTEM_INITIALIZED",
                    "description": "SOC Sentinel Audit System active and monitoring.",
                    "ip_address": "127.0.0.1",
                    "timestamp": datetime.now()
                }]
                
            def get_place(ip_str):
                if not ip_str or ip_str in ['127.0.0.1', 'localhost', '::1']:
                    return "127.0.0.1 (Local SOC Station)"
                return f"{ip_str} (Remote SOC Node)"

            # FORMAT = TXT (Plain text readable log file)
            if log_format == 'txt':
                txt_content = "=" * 85 + "\n"
                txt_content += "            SELECTSHANS SECURITY OPERATIONS CENTER (SOC) AUDIT LOG REPORT\n"
                txt_content += "=" * 85 + "\n"
                txt_content += f"Report Date  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
                txt_content += f"Target User  : User ID #{user_id or 'All'}\n"
                txt_content += f"Total Records: {len(logs)} Events Logged\n"
                txt_content += "=" * 85 + "\n\n"
                
                for idx, log in enumerate(logs, 1):
                    ts_val = log['timestamp']
                    date_str = ts_val.strftime('%Y-%m-%d') if isinstance(ts_val, datetime) else str(ts_val)[:10]
                    time_str = ts_val.strftime('%H:%M:%S UTC') if isinstance(ts_val, datetime) else str(ts_val)[11:19] + " UTC"
                    location_str = get_place(log.get('ip_address'))
                    username_str = log.get('username') or f"User #{log.get('user_id')}"
                    
                    txt_content += f"[RECORD #{idx}]\n"
                    txt_content += f"DATE        : {date_str}\n"
                    txt_content += f"TIME        : {time_str}\n"
                    txt_content += f"PLACE / IP  : {location_str}\n"
                    txt_content += f"USER        : {username_str} ({log.get('email', 'N/A')})\n"
                    txt_content += f"ACTION      : {log.get('action', 'N/A')}\n"
                    txt_content += f"DESCRIPTION : {log.get('description', 'No additional details')}\n"
                    txt_content += "-" * 85 + "\n\n"
                    
                buffer = io.BytesIO(txt_content.encode('utf-8'))
                buffer.seek(0)
                
                filename = f"SelectShans_AuditLog_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
                return send_file(
                    buffer,
                    mimetype="text/plain",
                    as_attachment=True,
                    download_name=filename
                )

            # FORMAT = PDF (Formatted ReportLab PDF Document)
            pdf_buffer = io.BytesIO()
            doc = SimpleDocTemplate(
                pdf_buffer,
                pagesize=A4,
                rightMargin=30,
                leftMargin=30,
                topMargin=36,
                bottomMargin=36
            )
            elements = []
            styles = getSampleStyleSheet()

            title_style = ParagraphStyle(
                'AuditTitle',
                parent=styles['Heading1'],
                fontName='Helvetica-Bold',
                fontSize=16,
                leading=20,
                textColor=colors.HexColor('#007CC3')
            )
            subtitle_style = ParagraphStyle(
                'AuditSubTitle',
                parent=styles['Normal'],
                fontName='Helvetica',
                fontSize=8.5,
                leading=12,
                textColor=colors.HexColor('#475569')
            )

            elements.append(Paragraph("SelectShans SOC - Comprehensive Audit Log Report", title_style))
            elements.append(Spacer(1, 4))
            elements.append(Paragraph(
                f"<b>Report Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')} &nbsp;|&nbsp; <b>Total Events:</b> {len(logs)} &nbsp;|&nbsp; <b>Classification:</b> CONFIDENTIAL AUDIT TRAIL",
                subtitle_style
            ))
            elements.append(Spacer(1, 10))

            # Audit log table
            table_data = [["Date & Time", "Place / IP", "User / Action", "Description & Event Details"]]
            for log in logs[:200]:
                ts_val = log['timestamp']
                ts_formatted = ts_val.strftime('%Y-%m-%d\n%H:%M:%S UTC') if isinstance(ts_val, datetime) else str(ts_val)
                loc_formatted = get_place(log.get('ip_address'))
                user_action = f"<b>{log.get('username') or 'User'}</b><br/><code>{log.get('action')}</code>"
                desc_formatted = str(log.get('description') or 'N/A')

                table_data.append([
                    Paragraph(ts_formatted, styles['Normal']),
                    Paragraph(loc_formatted, styles['Normal']),
                    Paragraph(user_action, styles['Normal']),
                    Paragraph(desc_formatted, styles['Normal'])
                ])

            t_audit = Table(table_data, colWidths=[95, 125, 120, 195])
            t_audit.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
                ('TEXTCOLOR', (0,0), (-1,0), colors.white),
                ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE', (0,0), (-1,-1), 8),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('PADDING', (0,0), (-1,-1), 5),
            ]))
            elements.append(t_audit)
            doc.build(elements)

            pdf_buffer.seek(0)
            filename = f"SelectShans_AuditLog_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            return send_file(
                pdf_buffer,
                mimetype="application/pdf",
                as_attachment=True,
                download_name=filename
            )

        except Exception as e:
            print(f"Error generating audit log: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": str(e)}), 500
        finally:
            cursor.close()
            conn.close()
