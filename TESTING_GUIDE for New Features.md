# SentinelStream Phase 2 - Quick Testing Guide

## Quick Start Testing

### 1. Setup Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```

The backend should start on `http://localhost:5000`

### 2. Setup Frontend
```bash
cd frontend
npm install  # if dependencies need updating
npm start
```

The frontend should open at `http://localhost:3000`

---

## Test Scenarios

### ✅ Test 1: Profile Save Functionality
**Objective**: Verify profile settings can be saved

1. Login with credentials
2. Click ADMIN button
3. Select "Profile Settings"
4. Update Full Name, Phone, Organization
5. Click Save
6. ✅ **Expected**: Green success message fades after 4 seconds

---

### ✅ Test 2: Error Messages Fade Automatically
**Objective**: Verify all error notifications disappear after 3-5 seconds

1. Try each feature with invalid input:
   - **Settings**: Try clear data (will show confirmation)
   - **Login**: Enter wrong credentials
   - **Profile**: Leave required field empty (if any)
   - **Audit Log**: Don't match passwords

2. Observe error messages in red notification
3. ✅ **Expected**: Messages fade out smoothly after 4 seconds
4. **Visual**: Should see slight upward movement as fading

---

### ✅ Test 3: Session Persistence (Page Refresh)
**Objective**: Verify login session survives page refresh

1. Login successfully
2. Verify "Admin: Active" status shows in top-right
3. **Open DevTools** → Application → Local Storage
4. Verify `jwtToken` and `userId` present
5. **Press F5** to refresh page
6. ✅ **Expected**: 
   - Page refreshes
   - No login prompt appears
   - Dashboard loads immediately
   - User remains logged in
   - Status still shows "Admin: Active"

---

### ✅ Test 4: Session Timeout (30 minutes)
**Objective**: Verify session extends automatically

1. Login and note the time
2. Leave application idle for 25+ minutes
3. **Check Network tab in DevTools**
4. ✅ **Expected**: Token refresh request sent automatically at 25-minute mark
5. Session continues without interruption

*Note: For testing, modify `App.jsx` to use shorter intervals (e.g., 1 minute)*

---

### ✅ Test 5: Google OAuth Login
**Objective**: Verify single sign-on with Google

**Prerequisites**:
- Set GOOGLE_CLIENT_ID in `.env`
- Google account available for testing

1. Click "Sign in with Google" button on login page
2. Complete Google authentication flow
3. ✅ **Expected**:
   - Redirected to SentinelStream dashboard
   - User logged in automatically
   - Admin status shows
   - No re-login required on page refresh

---

### ✅ Test 6: Token Refresh in Background
**Objective**: Verify session stays active without user action

1. Login successfully
2. Open DevTools → Application → Local Storage
3. Note the current `jwtToken` value
4. Wait for automatic refresh (25 minutes or modified interval)
5. ✅ **Expected**:
   - jwtToken value changes (new token generated)
   - No interruption to user experience
   - Session continues seamlessly

---

### ✅ Test 7: Log Out & Clear Session
**Objective**: Verify logout clears session properly

1. Click user profile menu (top-right "SOC-Admin")
2. Click "Logout"
3. ✅ **Expected**:
   - Redirected to login page
   - localStorage cleared (check DevTools)
   - Cannot access dashboard without re-login

---

### ✅ Test 8: Admin Features Work
**Objective**: Verify all admin features accessible after login

1. Login successfully
2. Click ADMIN button
3. ✅ **Expected**: Dropdown shows 3 options:
   - Profile Settings
   - View Audit Log
   - System Health
4. Click each option
5. ✅ **Expected**: Each page loads and displays correctly

---

## Debugging Tips

### Check Authentication Status
```javascript
// In browser console
localStorage.getItem('jwtToken')       // Should show token
localStorage.getItem('userId')         // Should show user ID
localStorage.getItem('detector_token') // Should show detector token
```

### Monitor Network Requests
1. Open DevTools → Network tab
2. Filter by "admin" to see admin API calls
3. Filter by "token/refresh" to see session extensions
4. Check response status (200 = success, 401 = unauthorized)

### Check Timeouts (Console)
```javascript
// Should see logs like:
// "Token refresh scheduled for 25 minutes from now"
// Check for any errors related to fetch or JSON parsing
```

### Test Component State
```javascript
// In browser console (during session)
document.title  // Should show app title
// Check localStorage for persistence
```

---

## Expected Behavior Summary

| Feature | Before | After |
|---------|--------|-------|
| Error Messages | Persist forever | Fade after 4 seconds |
| Profile Save | Fails silently | Shows success/error, then fades |
| Page Refresh | Logs out user | Maintains session |
| Session Duration | Unknown | 30 minutes (auto-refresh at 25 min) |
| Google Login | Not available | Works seamlessly |
| Admin Routes | Not accessible | All routes working |
| Token | Not stored | Stored in localStorage |

---

## Common Test Data

### Test Credentials
```
Username: test_user
Password: Test@123
Email: test@example.com
```

### Test Profile Data
```
Full Name: Test User
Phone: +1-234-567-8900
Organization: Test Organization
Notification Email: notify@example.com
```

---

## Success Criteria

- ✅ All error messages fade after 4 seconds
- ✅ Profile can be saved successfully
- ✅ Page refresh doesn't log out user
- ✅ Session lasts 30 minutes with auto-refresh
- ✅ Google OAuth login works
- ✅ All admin features accessible
- ✅ No JavaScript errors in console
- ✅ All API calls return proper status codes

---

## Troubleshooting

**Problem**: Admin routes not found (404)
- **Solution**: Verify `register_admin_routes` called in app.py after pool init

**Problem**: "Token invalid or expired" on refresh
- **Solution**: Check token expiry time, verify jwt_utils.py correctly configured

**Problem**: Session lost on refresh
- **Solution**: Verify localStorage not cleared, check useEffect dependencies

**Problem**: Google OAuth fails
- **Solution**: Set GOOGLE_CLIENT_ID, verify token verification endpoint

**Problem**: Error messages not fading
- **Solution**: Check browser console, verify CSS animation syntax

---

## Performance Notes

- Initial load: ~2 seconds
- Admin page load: ~1 second
- Token refresh: < 500ms
- Profile save: ~1-2 seconds (depending on network)

---

## Next Steps

After testing:
1. [ ] Verify all features work as documented
2. [ ] Check browser console for errors
3. [ ] Test on different browsers (Chrome, Firefox, Safari)
4. [ ] Test on mobile devices
5. [ ] Load test with multiple concurrent users
6. [ ] Security audit of authentication flow

