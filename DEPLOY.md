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

## 5. Security Headers
The system is pre-configured with:
- **X-Frame-Options: DENY** (Prevents Clickjacking)
- **X-Content-Type-Options: nosniff** (Prevents MIME sniffing)
- **X-XSS-Protection: 1; mode=block** (Blocks Cross-Site Scripting)

## 6. Theme Persistence
The terminal uses `localStorage` to persist the user's "Paper 3D" theme preference (Day/Night) across all terminal nodes. Ensure your browser allows storage for the domain.

---
**Your system is now hardened and ready for the world.**
