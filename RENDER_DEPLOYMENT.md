# Render Deployment Guide

## Backend Render Settings

**Service Type:** Web Service
**Root Directory:** `backend`
**Build Command:** `pip install -r requirements.txt`
**Start Command:** `gunicorn app:app`

## Required Environment Variables

The backend requires the following environment variables. Do not share your actual secrets!

- `APP_ENV`: Set to `production`.
- `DB_HOST`: Your MySQL host (e.g., from a managed database provider). Do not use `localhost` in production.
- `DB_PORT`: `3306` (or your specific port).
- `DB_USER`: Your database username.
- `DB_PASSWORD`: Your database password (REQUIRED).
- `DB_NAME`: The database name, usually `RANSOMWARE`.
- `JWT_SECRET`: A secure random string for signing JWT tokens (REQUIRED).
- `DETECTOR_SECRET`: A secure random string for detector token generation (REQUIRED).
- `FRONTEND_URL`: The URL of your deployed frontend (e.g., `https://selectshans.onrender.com`).
- `MAIL_HOST`: SMTP server host for sending emails.
- `MAIL_PORT`: SMTP server port (usually `587`).
- `MAIL_USER`: SMTP user/email address.
- `MAIL_PASS`: SMTP password.

## Deployment Steps

1. **Push repository to GitHub:** Ensure your latest code is on GitHub.
2. **Open Render Dashboard:** Go to [Render](https://render.com/) and create a new **Web Service**.
3. **Connect GitHub repository:** Select this repository.
4. **Select the correct branch:** Typically `main` or `master`.
5. **Set Root Directory to:** `backend`
6. **Set Build Command:** `pip install -r requirements.txt`
7. **Set Start Command:** `gunicorn app:app`
8. **Add Environment Variables:** Add all the required environment variables listed above. Note that `DB_PASSWORD`, `JWT_SECRET`, and `DETECTOR_SECRET` are mandatory.
9. **Deploy:** Click the Create Web Service button.
10. **Test:** Once deployed, visit `https://<your-render-url>/api/health`. You should see `{"status": "ok"}`.
11. **Configure Frontend:** Ensure your frontend's `VITE_API_URL` environment variable is set to the newly created Render backend URL.
12. **Configure Backend's FRONTEND_URL:** Make sure the backend's `FRONTEND_URL` is set to the frontend's deployed URL to allow CORS.

## MySQL Database Configuration

Ensure your `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` point to a real, accessible MySQL server. `localhost` is only for local development.

The database name is expected to be `RANSOMWARE`. The application will NOT automatically create the database on Render if `APP_ENV=production` or `VERCEL=1`, so ensure the database is pre-created or the server has permissions.
