# TOKEN.GATE | Production Deployment Guide

This document outlines the steps to take your Industrial Access Management system from local development to a live, secure URL.

## 1. Safety Checklist (CRITICAL)
- [ ] **.gitignore Verified**: Ensure `.env` and `data/` are listed in `.gitignore` so they are never pushed to GitHub.
- [ ] **Admin Credentials**: Change your `ADMIN_USER` and `ADMIN_PASS` in the `.env` file to something strong.
- [ ] **Email App Password**: Never use your main Gmail password. Use a "Google App Password" for the `SMTP_PASS` field.

## 2. Environment Configuration (`.env`)
On your live server, create a `.env` file with the following variables:
```env
# SECURITY
APP_SECRET_KEY=generate-a-long-random-string-here
ADMIN_USER=prabhushankarmund
ADMIN_PASS=ChooseAStrongPassword

# EMAIL ALERTS
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-google-app-password
EMAIL_FROM="TOKEN.GATE <noreply@tokengate.com>"
```

## 3. Recommended Hosting Platforms
- **PythonAnywhere**: Easiest for Flask. Offers free and cheap tiers.
- **Render / Railway**: Modern platforms that handle auto-deployment from GitHub.
- **DigitalOcean / AWS / Google Cloud**: For full control over a VPS.

## 4. Live Server Setup
1. **Clone your code**: Upload your code to the server (excluding the `data/` folder).
2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Initialize Data**: Create an empty `data` directory on the server.
4. **Run with Gunicorn**: For production, do NOT use `python app.py`. Use a WSGI server:
   ```bash
   gunicorn -w 4 -b 0.0.0.0:5000 app:app
   ```

## 5. Data Persistence (CRITICAL for Render/Railway/Heroku)
The database is stored in a local SQLite file (`data/token_gate.db`). If you deploy to hosting providers with ephemeral filesystems (like Render or Railway), the database file will be deleted whenever the container restarts, sleeps, or redeploys.

To prevent your events and guests from disappearing, you **MUST** attach a persistent disk/volume to the `/data` directory:
* **Render**: 
  1. Go to your Web Service dashboard, click **Disks**, and click **Add Disk**.
  2. Name it `token-gate-disk`.
  3. Set the **Mount Path** to `/opt/render/project/src/data` (which maps to your `data` folder).
  4. Set size to `1 GB` (free/cheap).
* **Railway**:
  1. Click **Add Service** -> **Volume**.
  2. Set the **Mount Path** to `/app/data` (or the folder where your code runs).
* **Self-hosted VPS**: Ensure the `data/` directory has write permissions (`chmod -R 755 data`).

## 6. Security Headers
The system is pre-configured with:
- **X-Frame-Options: DENY** (Prevents Clickjacking)
- **X-Content-Type-Options: nosniff** (Prevents MIME sniffing)
- **X-XSS-Protection: 1; mode=block** (Blocks Cross-Site Scripting)

## 7. Theme Persistence
The terminal uses `localStorage` to persist the user's "Paper 3D" theme preference (Day/Night) across all terminal nodes. Ensure your browser allows storage for the domain.

---
**Your system is now hardened and ready for the world.**
