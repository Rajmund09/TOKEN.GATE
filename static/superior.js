/**
 * SUPERIOR TERMINAL LOGIC
 * Isolated functions for Root Admin (Global Control & Purging)
 */

const UI = {
  adminLogin: document.getElementById('adminLogin'),
  adminLoginForm: document.getElementById('adminLoginForm'),
  adminDashboard: document.getElementById('adminDashboard'),
  eventsList: document.getElementById('eventsList'),
  historyLog: document.getElementById('historyLog'),
  purgeAllBtn: document.getElementById('purgeAllBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  toast: document.getElementById('toast'),
  confirmModal: document.getElementById('confirmModal'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmProceedBtn: document.getElementById('confirmProceedBtn')
};

const state = {
  authenticated: false
};

// --- UTILS ---

const api = async (url, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  try {
    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
      return data;
    } else {
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);
      return {};
    }
  } catch (err) {
    if (err.message.includes('Network')) throw new Error('Network Transmission Failed');
    throw err;
  }
};

const showToast = (msg, duration = 4000) => {
  if (!UI.toast) return;
  UI.toast.textContent = msg;
  UI.toast.classList.add('show');
  setTimeout(() => UI.toast.classList.remove('show'), duration);
};

const formatDate = (iso) => {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const showConfirm = (title, message) => {
  return new Promise((resolve) => {
    UI.confirmTitle.textContent = title;
    UI.confirmMessage.textContent = message;
    UI.confirmModal.showModal();

    const cleanup = (val) => {
      UI.confirmCancelBtn.onclick = null;
      UI.confirmProceedBtn.onclick = null;
      UI.confirmModal.close();
      resolve(val);
    };

    UI.confirmCancelBtn.onclick = () => cleanup(false);
    UI.confirmProceedBtn.onclick = () => cleanup(true);
  });
};

// --- AUTH ---

const handleLogin = async (e) => {
  e.preventDefault();
  try {
    const formData = new FormData(UI.adminLoginForm);
    const payload = Object.fromEntries(formData.entries());

    const res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    state.authenticated = true;
    showToast('Root Uplink Established');
    
    UI.adminLogin.classList.add('hidden');
    UI.adminDashboard.classList.remove('hidden');
    
    fetchAllEvents();
    fetchHistory();
  } catch (err) {
    showToast(err.message);
  }
};

const handleLogout = async () => {
  try {
    await api('/api/logout', { method: 'POST' });
    window.location.reload();
  } catch (err) {
    showToast('Disconnection Failed');
  }
};

// --- GLOBAL REGISTRY ---

const fetchAllEvents = async () => {
  try {
    const data = await api('/api/events');
    renderEvents(data.events);
  } catch (err) {
    showToast(err.message);
  }
};

const renderEvents = (events) => {
  UI.eventsList.innerHTML = events.length ? events.map((evt, i) => `
    <div class="request-item stagger-enter" style="animation-delay: ${i * 0.05}s">
      <div class="request-info">
        <h4>${evt.event_name} <span class="badge" style="background:var(--accent-dim);">${evt.event_id}</span></h4>
        <p>Manager: ${evt.manager_name} (${evt.manager_email})</p>
        <p class="dim-text">Created: ${formatDate(evt.created_at)}</p>
      </div>
      <div class="request-actions">
        <button class="btn-outline" style="border-color:var(--secondary); color:var(--secondary);" onclick="deleteEvent('${evt.event_id}')">PURGE SESSION</button>
      </div>
    </div>
  `).join('') : '<div class="dim-text" style="padding:2rem; text-align:center;">NO ACTIVE SESSIONS</div>';
};

window.deleteEvent = async (eid) => {
  const ok = await showConfirm('Permanent Deletion', `Execute protocol to purge session ${eid} and all associated guest transmissions?`);
  if (!ok) return;
  try {
    await api(`/api/events/${eid}`, { method: 'DELETE' });
    showToast('Session purged from database');
    fetchAllEvents();
    fetchHistory();
  } catch (err) {
    showToast(err.message);
  }
};

// --- AUDIT VAULT ---

const fetchHistory = async () => {
  try {
    const data = await api('/api/terminal/history');
    renderHistory(data.history);
  } catch (err) {
    showToast(err.message);
  }
};

const renderHistory = (logs) => {
  if (!logs || logs.length === 0) {
    UI.historyLog.innerHTML = '<div class="empty-state">No audit records found in vault.</div>';
    return;
  }

  UI.historyLog.innerHTML = logs.slice().reverse().map(log => {
    const date = new Date(log.timestamp).toLocaleString();
    let detailsStr = '';
    if (log.action === 'EVENT_CREATED') {
        detailsStr = `Event <strong>${log.details.event_name}</strong> created by ${log.details.manager}`;
    } else if (log.action === 'GUEST_REGISTERED') {
        detailsStr = `Guest <strong>${log.details.name}</strong> (${log.details.email}) registered for <strong>${log.details.event_name}</strong>`;
    } else if (log.action === 'GATE_ENTRY') {
        detailsStr = `Entry Granted: <strong>${log.details.name}</strong> for <strong>${log.details.event_name}</strong>`;
    } else if (log.action === 'SYSTEM_WIPE') {
        detailsStr = `<span style="color:var(--secondary);">TOTAL SYSTEM WIPE BY ROOT ADMIN</span>`;
    } else {
        detailsStr = JSON.stringify(log.details);
    }

    return `
      <div class="request-card" style="border-bottom:1px solid rgba(255,255,255,0.05); padding:1rem 0;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <span class="badge" style="font-size:0.5rem; background:rgba(0,242,255,0.1); color:var(--accent);">${log.action}</span>
            <p style="margin-top:0.5rem; font-size:0.85rem;">${detailsStr}</p>
          </div>
          <span style="font-size:0.6rem; color:var(--secondary); font-family:monospace;">${date}</span>
        </div>
      </div>
    `;
  }).join('');
};

const purgeAllData = async () => {
  const ok = await showConfirm('MASTER OVERRIDE', 'Are you absolutely sure? This will permanently wipe EVERY session and EVERY participant record from the global terminal. This action is irreversible.');
  if (!ok) return;

  try {
    await api('/api/terminal/purge-all', { method: 'POST' });
    showToast('TOTAL SYSTEM WIPE COMPLETE');
    fetchAllEvents();
    fetchHistory();
  } catch (err) {
    showToast(err.message);
  }
};

// --- INIT ---

document.addEventListener('DOMContentLoaded', async () => {
  UI.adminLoginForm.onsubmit = handleLogin;
  UI.logoutBtn.onclick = handleLogout;
  UI.purgeAllBtn.onclick = purgeAllData;

  try {
    const data = await api('/api/session');
    if (data.authenticated && data.owner) {
      UI.adminLogin.classList.add('hidden');
      UI.adminDashboard.classList.remove('hidden');
      fetchAllEvents();
      fetchHistory();
    }
  } catch (err) {}

  setTimeout(() => {
    document.getElementById('bootLoader')?.classList.add('hidden');
  }, 800);
});
