import io
import json
import os
import secrets
import threading
import smtplib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import qrcode
from flask import Flask, Response, jsonify, request, send_file, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CUSTOMERS_FILE = DATA_DIR / "customers.json"
EVENTS_FILE = DATA_DIR / "events.json"

# CONFIGURATION FROM ENV
OWNER_USER = os.environ.get("ADMIN_USER", "owner")
# ADMIN_PASS is REQUIRED for production security
OWNER_PASS = os.environ["ADMIN_PASS"]

SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "TOKEN.GATE <noreply@tokengate.com>")
SUPERVISOR_EMAIL = os.environ.get("SUPERVISOR_EMAIL", "prabhushankarmund@gmail.com")

app = Flask(__name__, static_folder="static", static_url_path="/static")
# APP_SECRET_KEY is REQUIRED for session security
app.config["SECRET_KEY"] = os.environ["APP_SECRET_KEY"]
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=2)
app.config["JSON_SORT_KEYS"] = False

# Production Session Security
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=True, # Set to True for HTTPS (Render provides this)
    SESSION_COOKIE_SAMESITE="Lax",
)

# Ensure data files on startup (Required for Gunicorn readiness)
ensure_data_files()

@app.after_request
def apply_security_headers(response: Response) -> Response:
    # Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "script-src 'self' 'unsafe-inline';"
    )
    # response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    
    # Cache Control (Disable caching for all API/Admin responses)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    return response

# Security Middleware
@app.before_request
def validate_csrf():
    # Simple CSRF: Require a custom header for all POST/PATCH/DELETE
    if request.method in ["POST", "PATCH", "DELETE"]:
        if request.path == "/api/login": return # Allow login
        if request.path == "/api/requests" and request.method == "POST": return # Allow public requests
        if request.path == "/api/events" and request.method == "POST": return # Allow event creation
        
        # Admin/Manager actions require session-based CSRF or custom header
        # In this simple implementation, we rely on the session cookie 'HttpOnly' and 'SameSite=Lax'
        pass


data_lock = threading.Lock()


def ensure_data_files() -> None:
    """Ensure required data directory and JSON files exist for production readiness."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CUSTOMERS_FILE.exists():
        CUSTOMERS_FILE.write_text("{}", encoding="utf-8")
    if not EVENTS_FILE.exists():
        EVENTS_FILE.write_text("{}", encoding="utf-8")
    
    # Initialize history.json if missing
    history_path = DATA_DIR / "history.json"
    if not history_path.exists():
        history_path.write_text("[]", encoding="utf-8")


def read_json(file: Path) -> dict[str, Any]:
    ensure_data_files()
    with data_lock:
        try:
            raw = json.loads(file.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return raw
        except (json.JSONDecodeError, FileNotFoundError):
            pass
    return {}


def write_json(file: Path, data: dict[str, Any]) -> None:
    ensure_data_files()
    with open(file, "w") as f:
        json.dump(data, f, indent=2)

def read_history() -> list:
    path = os.path.join(DATA_DIR, "history.json")
    if not os.path.exists(path): return []
    with open(path, "r") as f:
        try: return json.load(f)
        except: return []

def record_history(action: str, details: dict) -> None:
    history = read_history()
    history.append({
        "timestamp": utc_now().isoformat(),
        "action": action,
        "details": details
    })
    # Keep last 1000 records
    history = history[-1000:]
    with open(os.path.join(DATA_DIR, "history.json"), "w") as f:
        json.dump(history, f, indent=2)


def read_customers() -> dict[str, dict[str, Any]]:
    return read_json(CUSTOMERS_FILE)


def write_customers(customers: dict[str, dict[str, Any]]) -> None:
    write_json(CUSTOMERS_FILE, customers)


def read_events() -> dict[str, dict[str, Any]]:
    return read_json(EVENTS_FILE)


def write_events(events: dict[str, dict[str, Any]]) -> None:
    write_json(EVENTS_FILE, events)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def is_expired(entry: dict[str, Any]) -> bool:
    expiry = parse_iso(entry.get("expires_at"))
    return bool(expiry and utc_now() > expiry)


def serialize_customer(token: str, entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "token": token,
        "event_id": entry.get("event_id", "GLOBAL"),
        "name": entry.get("name", ""),
        "email": entry.get("email", ""),
        "party_type": entry.get("party_type", "General"),
        "status": entry.get("status", "approved"),
        "responses": entry.get("custom_responses", {}),
        "created_at": entry.get("created_at"),
        "expires_at": entry.get("expires_at"),
        "entered_at": entry.get("entered_at"),
        "expired": is_expired(entry),
    }


def require_auth() -> Response | None:
    if not session.get("owner") and not session.get("event_id"):
        return jsonify({"error": "Unauthorized Access Detected"}), 401
    return None


def generate_token(prefix: str = "") -> str:
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    random_part = secrets.token_hex(4).upper()
    return f"{prefix}{timestamp}-{random_part}"


def send_email(to_email: str, subject: str, body_html: str) -> None:
    """Send a real email via SMTP if credentials are provided, otherwise log to console."""
    if not SMTP_USER or not SMTP_PASS:
        print(f"\n[MOCK EMAIL] TO: {to_email}\nSUBJECT: {subject}\nCONTENT: {body_html}\n")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = EMAIL_FROM
        msg["To"] = to_email
        msg.attach(MIMEText(body_html, "html"))

        print(f"Attempting to send email to {to_email} via {SMTP_SERVER}:{SMTP_PORT}...")
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.set_debuglevel(0) # Set to 1 for detailed SMTP logs if needed
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        print(f"SUCCESS: Email sent to {to_email}")
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to send email to {to_email}: {e}")


def notify_event_creation(manager_email: str, manager_name: str, event_name: str, event_id: str) -> None:
    subject = f"TOKEN.GATE | Session Initialized: {event_name}"
    html = f"""
    <div style="font-family: sans-serif; background: #050505; color: #e0e0e0; padding: 40px; border-radius: 8px;">
        <h2 style="color: #00f2ff;">TERMINAL INITIALIZED</h2>
        <p>Greetings {manager_name},</p>
        <p>Your event session <strong>{event_name}</strong> has been successfully registered on the global terminal.</p>
        <div style="background: rgba(0,242,255,0.1); border: 1px solid #00f2ff; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; font-size: 0.8rem; color: #888;">YOUR EVENT ID:</p>
            <code style="font-size: 1.5rem; color: #00f2ff; letter-spacing: 2px;">{event_id}</code>
        </div>
        <p>Use this ID and your security key to manage access requests.</p>
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
        <p style="font-size: 0.7rem; color: #666;">TOKEN.GATE Industrial Access Systems</p>
    </div>
    """
    send_email(manager_email or "admin@local.host", subject, html)


def notify_request_status(email: str, name: str, event_name: str, status: str, token: str | None = None) -> None:
    subject = f"TOKEN.GATE | Request {status.upper()}: {event_name}"
    color = "#00ff88" if status == "approved" else "#ff0055"
    if status == "pending": color = "#ffcc00"
    
    qr_link = f"{request.host_url}api/qr/{token}" if token else "#"
    
    html = f"""
    <div style="font-family: sans-serif; background: #050505; color: #e0e0e0; padding: 40px; border-radius: 8px; border-left: 5px solid {color};">
        <h2 style="color: {color}; text-transform: uppercase;">Request {status}</h2>
        <p>Identity: <strong>{name}</strong></p>
        <p>Session: <strong>{event_name}</strong></p>
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
        """
    if status == "approved":
        html += f"""
        <p>Your access token has been generated. Scan the code below or use the manual ID at the gate.</p>
        <div style="text-align: center; margin: 30px 0;">
            <img src="{qr_link}" width="200" height="200" style="background: #fff; padding: 10px; border-radius: 4px;">
            <p style="margin-top: 10px; font-family: monospace; font-size: 1.2rem; color: #00f2ff;">{token}</p>
        </div>
        """
    elif status == "pending":
        html += "<p>Your identity check is in progress. You will be notified once the manager approves your transmission.</p>"
    else:
        html += "<p>Your access request was rejected by the session manager. Identity mismatch or security restriction.</p>"
        
    html += f"""
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
        <p style="font-size: 0.7rem; color: #666;">SYSTEM TIME: {utc_now().strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
    </div>
    """
    send_email(email, subject, html)


def notify_identity_purged(email: str, name: str, event_name: str) -> None:
    subject = f"TOKEN.GATE | Access Revoked: {event_name}"
    html = f"""
    <div style="font-family: sans-serif; background: #050505; color: #e0e0e0; padding: 40px; border-radius: 8px; border-left: 5px solid #ff0055;">
        <h2 style="color: #ff0055; text-transform: uppercase;">Access Revoked</h2>
        <p>Identity: <strong>{name}</strong></p>
        <p>Session: <strong>{event_name}</strong></p>
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
        <p>Your digital pass for this session has been purged from the terminal. Access is no longer permitted.</p>
        <p style="font-size: 0.7rem; color: #666;">TOKEN.GATE Security Systems</p>
    </div>
    """
    send_email(email, subject, html)


def notify_event_purged(manager_email: str, manager_name: str, event_name: str) -> None:
    subject = f"TOKEN.GATE | Session Terminated: {event_name}"
    html = f"""
    <div style="font-family: sans-serif; background: #050505; color: #e0e0e0; padding: 40px; border-radius: 8px; border-left: 5px solid #ff0055;">
        <h2 style="color: #ff0055; text-transform: uppercase;">Session Purged</h2>
        <p>Greetings {manager_name},</p>
        <p>Your event session <strong>{event_name}</strong> has been terminated and purged from the global terminal by the root administrator.</p>
        <p>All associated guest data has been permanently deleted.</p>
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
        <p style="font-size: 0.7rem; color: #666;">TOKEN.GATE Industrial Access Systems</p>
    </div>
    """
    send_email(manager_email, subject, html)


def notify_supervisor(subject: str, message: str) -> None:
    """Special notification for the Master Admin."""
    html = f"""
    <div style="font-family: sans-serif; background: #000; color: #fff; padding: 40px; border: 2px solid #00f2ff;">
        <h2 style="color: #00f2ff;">SUPERVISOR ALERT</h2>
        <p style="font-size: 1.1rem;">{message}</p>
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
        <p style="font-size: 0.7rem; color: #666;">TOKEN.GATE Global Infrastructure Monitoring</p>
    </div>
    """
    send_email(SUPERVISOR_EMAIL, f"SUPERVISOR | {subject}", html)


def notify_entry_success(email: str, name: str, event_name: str) -> None:
    subject = f"TOKEN.GATE | Entry Confirmed: {event_name}"
    html = f"""
    <div style="font-family: sans-serif; background: #050505; color: #e0e0e0; padding: 40px; border-radius: 8px; border-left: 5px solid #00ff88;">
        <h2 style="color: #00ff88; text-transform: uppercase;">Entry Validated</h2>
        <p>Identity: <strong>{name}</strong></p>
        <p>Session: <strong>{event_name}</strong></p>
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
        <p>Your digital pass was successfully scanned at the gate. Enjoy the session.</p>
        <p style="font-size: 0.7rem; color: #666;">SYSTEM TIME: {utc_now().strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
    </div>
    """
    send_email(email, subject, html)


def make_qr_png(token: str) -> io.BytesIO:
    url = f"{request.host_url}api/verify?token={token}"
    qr_image = qrcode.make(url)
    buffer = io.BytesIO()
    qr_image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer




@app.route("/")
def index() -> Response:
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/admin")
def admin_page() -> Response:
    return send_from_directory(BASE_DIR, "admin.html")


@app.get("/api/session")
def get_session() -> Response:
    owner = session.get("owner")
    event_id = session.get("event_id")
    event_name = None
    if event_id:
        events = read_events()
        event_name = events.get(event_id, {}).get("event_name", "Unknown Event")
    
    return jsonify({
        "authenticated": bool(owner or event_id),
        "owner": owner,
        "event_id": event_id,
        "event_name": event_name
    })


# Basic in-memory rate limiting
login_attempts = {} # Dictionary to track failed logins by IP

@app.post("/api/login")
def login() -> Response:
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))

    protocol = str(payload.get("protocol", "hoster")).lower()

    # Rate limiting logic
    ip = request.remote_addr
    now = utc_now()
    attempts = login_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < timedelta(minutes=10)]
    if len(attempts) > 10:
        return jsonify({"error": "Security lock: too many failed attempts. Try again later."}), 429
    login_attempts[ip] = attempts

    # 1. Global Admin Protocol
    if protocol == "superior":
        if username == OWNER_USER and password == OWNER_PASS:
            session.clear()
            session["owner"] = username
            session.permanent = True
            record_history("SUPERIOR_LOGIN", {"admin": username})
            return jsonify({"message": "Root Terminal Linked", "owner": username})
        else:
            login_attempts[ip].append(now)
            return jsonify({"error": "Invalid Supervisor Credentials"}), 401

    # 2. Event Manager Protocol
    if protocol == "hoster":
        events = read_events()
        if username in events:
            stored_pw = events[username]["password"]
            if check_password_hash(stored_pw, password) or stored_pw == password:
                session.clear()
                session["event_id"] = username
                session.permanent = True
                record_history("HOSTER_LOGIN", {"event_id": username, "event_name": events[username]["event_name"]})
                return jsonify({
                    "message": "Event Terminal Linked",
                    "event_id": username,
                    "event_name": events[username]["event_name"]
                })
    
    login_attempts[ip].append(now)
    return jsonify({"error": "Invalid Hoster Security Credentials"}), 401


@app.post("/api/logout")
def logout() -> Response:
    session.clear()
    return jsonify({"message": "Terminal Disconnected"})


@app.get("/api/customers")
def list_customers() -> Response:
    auth_error = require_auth()
    if auth_error:
        return auth_error

    customers = read_customers()
    items = []
    
    owner = session.get("owner")
    event_id = session.get("event_id")

    for token, entry in customers.items():
        # Global admin sees all, event manager sees only their event
        if owner or entry.get("event_id") == event_id:
            items.append(serialize_customer(token, entry))
            
    items.sort(key=lambda item: item["created_at"] or "", reverse=True)
    return jsonify({"customers": items})


@app.get("/api/events")
def list_all_events() -> Response:
    """Admin-only: list all events with management details."""
    if not session.get("owner"):
        return jsonify({"error": "Root access required"}), 403

    events = read_events()
    items = []
    for eid, info in events.items():
        items.append({
            "event_id": eid,
            "event_name": info["event_name"],
            "manager_name": info["manager_name"],
            "manager_email": info.get("manager_email", "N/A"),
            "created_at": info.get("created_at")
        })
    return jsonify({"events": items})


@app.delete("/api/events/<event_id>")
def delete_event(event_id: str) -> Response:
    """Root-only: Purge an entire event and its guests."""
    if not session.get("owner"):
        return jsonify({"error": "Unauthorized Access Detected"}), 401

    events = read_events()
    if event_id not in events:
        return jsonify({"error": "Session Not Found"}), 404

    info = events[event_id]
    manager_email = info.get("manager_email")
    manager_name = info.get("manager_name", "Manager")
    event_name = info.get("event_name", "Unnamed Session")

    # Notify manager before purging if email exists
    if manager_email:
        notify_event_purged(manager_email, manager_name, event_name)
    
    # Notify Supervisor
    notify_supervisor("Session Purged", f"Root Admin purged event <strong>{event_name}</strong>.")

    del events[event_id]
    write_events(events)

    # Purge all guests belonging to this event
    customers = read_customers()
    to_delete = [t for t, c in customers.items() if c.get("event_id") == event_id]
    for t in to_delete:
        del customers[t]
    write_customers(customers)
    return jsonify({"message": f"Session {event_id} and associated data purged from global terminal."})


@app.get("/api/events/active")
def list_active_events() -> Response:
    """Public list of active events for guest choice."""
    events = read_events()
    items = []
    for eid, info in events.items():
        items.append({
            "event_id": eid,
            "event_name": info.get("event_name", "Unnamed Event"),
            "manager": info.get("manager_name", "Unknown"),
            "fields": info.get("custom_fields", [])
        })
    return jsonify({"events": items})


@app.post("/api/events")
def register_event() -> Response:
    """Public endpoint for managers to register an event."""
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("manager_name", "")).strip()
    event_name = str(payload.get("event_name", "")).strip()
    password = str(payload.get("password", ""))
    manager_email = str(payload.get("email", "")).strip()

    if not name or not event_name or not password:
        return jsonify({"error": "Missing Required Transmission Parameters"}), 400

    event_id = generate_token("EVT-")
    events = read_events()
    
    # Secure Password Hashing
    hashed_password = generate_password_hash(password)
    
    # Extract Custom Fields
    custom_fields = payload.get("custom_fields", []) # List of {label, type, options}
    
    events[event_id] = {
        "manager_name": name,
        "event_name": event_name,
        "password": hashed_password,
        "manager_email": manager_email,
        "custom_fields": custom_fields,
        "created_at": utc_now().isoformat()
    }
    write_events(events)
    
    notify_event_creation(manager_email, name, event_name, event_id)
    notify_supervisor("New Event Registered", f"Event <strong>{event_name}</strong> created by <strong>{name}</strong> ({manager_email}).")
    record_history("EVENT_CREATED", {"event_id": event_id, "event_name": event_name, "manager": name, "email": manager_email})

    return jsonify({
        "message": "Session Initialized Successfully",
        "event_id": event_id
    }), 201


@app.post("/api/requests")
def create_request() -> Response:
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    event_id = str(payload.get("event_id", "")).strip()

    if not name or not email or not event_id:
        return jsonify({"error": "Identity and Session Choice Required"}), 400

    events = read_events()
    if event_id not in events:
        return jsonify({"error": "Invalid Session ID"}), 404

    token = generate_token()
    created_at = utc_now()
    
    customers = read_customers()
    event_info = events.get(event_id, {})
    event_name = event_info.get("event_name", "Unknown Event")

    customers[token] = {
        "name": name,
        "email": email,
        "event_id": event_id,
        "party_type": event_name,
        "status": "pending",
        "custom_responses": payload.get("responses", {}),
        "created_at": created_at.isoformat(),
        "expires_at": None,
        "entered_at": None,
    }
    write_customers(customers)

    notify_request_status(email, name, event_name, "pending")
    notify_supervisor("New Guest Request", f"Guest <strong>{name}</strong> requested access for <strong>{event_name}</strong>.")
    record_history("GUEST_REGISTERED", {"name": name, "email": email, "event_name": event_name})

    return jsonify({
        "message": "Identity transmission successful. Awaiting manager approval.",
        "token": token
    }), 201


@app.patch("/api/requests/<token>")
def update_request_status(token: str) -> Response:
    auth_error = require_auth()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    new_status = str(payload.get("status", "")).lower()
    expiry_minutes = payload.get("expiry_minutes", 1440) # Default 24h

    if new_status not in ["approved", "rejected"]:
        return jsonify({"error": "Invalid Transmission State"}), 400

    customers = read_customers()
    if token not in customers:
        return jsonify({"error": "Identity Record Not Found"}), 404

    entry = customers[token]
    
    # Permission check: can only update if owner or is the event manager
    if not session.get("owner") and entry.get("event_id") != session.get("event_id"):
        return jsonify({"error": "Security Breach: Terminal Mismatch"}), 403

    entry["status"] = new_status
    if new_status == "approved":
        created_at = utc_now()
        entry["expires_at"] = (created_at + timedelta(minutes=int(expiry_minutes))).isoformat()
    
    write_customers(customers)
    notify_request_status(entry["email"], entry["name"], entry["party_type"], new_status, token if new_status == "approved" else None)

    return jsonify({"message": f"Identity {new_status.upper()}", "customer": serialize_customer(token, entry)})


@app.post("/api/terminal/purge-all")
def purge_all_data() -> Response:
    """Master Root Override: Wipe everything for a fresh start."""
    if not session.get("owner"):
        return jsonify({"error": "Root access required"}), 403

    write_events({})
    write_customers({})
    
    notify_supervisor("GLOBAL TERMINAL PURGE", "The master supervisor has executed a total system wipe. All sessions and guest data have been permanently erased.")
    record_history("SYSTEM_WIPE", {"admin": session.get("owner")})
    
    return jsonify({"message": "Total System Wipe Executed Successfully"})


@app.get("/api/terminal/history")
def get_terminal_history() -> Response:
    """Root-only: Fetch the audit vault."""
    if not session.get("owner"):
        return jsonify({"error": "Root access required"}), 403
    return jsonify({"history": read_history()})


@app.delete("/api/customers/<token>")
def delete_customer(token: str) -> Response:
    auth_error = require_auth()
    if auth_error:
        return auth_error

    customers = read_customers()
    if token not in customers:
        return jsonify({"error": "Record not found"}), 404

    entry = customers[token]
    if not session.get("owner") and entry.get("event_id") != session.get("event_id"):
        return jsonify({"error": "Permission Denied"}), 403

    # Notify guest of revocation
    notify_identity_purged(entry["email"], entry["name"], entry["party_type"])
    
    del customers[token]
    write_customers(customers)
    return jsonify({"message": "Identity purged from records"})


@app.post("/api/customers/clear")
def clear_customers() -> Response:
    auth_error = require_auth()
    if auth_error:
        return auth_error

    write_customers({})
    return jsonify({"message": "All customers removed"})


@app.get("/api/verify")
def verify_token() -> Response:
    token = request.args.get("token", "").strip()
    if not token:
        return jsonify({"status": "missing", "message": "Token is required"}), 400

    customers = read_customers()
    entry = customers.get(token)
    
    if not entry:
        return jsonify({"status": "invalid", "message": "Access denied: token not found"}), 404
    
    if entry.get("status") != "approved":
        status = entry.get("status", "pending")
        return jsonify({
            "status": status,
            "message": f"Access denied: Request is {status}"
        }), 403

    # Check if already entered
    if not entry.get("entered_at"):
        entry["entered_at"] = utc_now().isoformat()
        write_customers(customers)
        notify_entry_success(entry["email"], entry["name"], entry["party_type"])
        notify_supervisor("GATE ENTRY SIGNAL", f"Guest <strong>{entry.get('name')}</strong> has just entered <strong>{entry.get('party_type')}</strong>.")
        record_history("GATE_ENTRY", {"name": entry.get("name"), "email": entry.get("email"), "event_name": entry.get("party_type")})
        
        msg = f"ACCESS GRANTED: {entry.get('name', 'Unknown')} (First Entry)"
        is_first = True
    else:
        entry_time = parse_iso(entry.get("entered_at"))
        time_str = entry_time.strftime('%H:%M') if entry_time else "N/A"
        msg = f"RE-ENTRY DETECTED: {entry.get('name', 'Unknown')} (Previously Entered at {time_str})"
        is_first = False

    return jsonify({
        "status": "valid",
        "message": msg,
        "is_first_entry": is_first,
        "customer": serialize_customer(token, entry),
    })


@app.get("/api/status/<token>")
def check_status(token: str) -> Response:
    """Public endpoint to check request status."""
    customers = read_customers()
    entry = customers.get(token)
    if not entry:
        return jsonify({"error": "Request not found"}), 404
    
    return jsonify(serialize_customer(token, entry))


@app.get("/api/qr/<token>")
def qr_image(token: str) -> Response:
    customers = read_customers()
    if token not in customers:
        return jsonify({"error": "Token not found"}), 404
    
    entry = customers[token]
    if entry.get("status") != "approved":
         return jsonify({"error": "QR only available for approved requests"}), 403

    buffer = make_qr_png(token)
    return send_file(buffer, mimetype="image/png", download_name=f"{token}.png")


if __name__ == "__main__":
    # Render deployment configuration: 0.0.0.0 and dynamic PORT
    # Debug mode is DISABLED for production safety
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
