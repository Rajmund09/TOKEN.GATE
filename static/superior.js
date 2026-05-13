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
  purgeAllBtn: document.getElementById('masterPurgeBtn'),
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

const showLoader = (msg = "SYNCING PROTOCOLS...") => {
  const loader = document.getElementById('bootLoader');
  const text = loader?.querySelector('.terminal-text');
  if (text) text.textContent = msg;
  loader?.classList.remove('hidden');
};

const hideLoader = () => {
  const loader = document.getElementById('bootLoader');
  loader?.classList.add('hidden');
};

const api = async (url, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (!options.silent) showLoader(options.loaderMsg || "TRANSMITTING DATA...");
  try {
    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get("content-type");
    if (!options.silent) hideLoader();
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
      return data;
    } else {
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);
      return {};
    }
  } catch (err) {
    if (!options.silent) hideLoader();
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

const fetchAllEvents = async (options = {}) => {
  try {
    const data = await api('/api/events', options);
    const countEl = document.getElementById('activeNodesCount');
    if (countEl) countEl.textContent = data.events.length;
    renderEvents(data.events);
  } catch (err) {
    if (!options.silent) showToast(err.message);
  }
};

const renderEvents = (events) => {
  UI.eventsList.innerHTML = events.length ? events.map((evt, i) => `
    <div class="request-item stagger-enter" style="animation-delay: ${i * 0.05}s">
      <div class="request-info">
        <h4>${evt.event_name} <span class="badge">${evt.event_id}</span></h4>
        <p>${evt.manager_name} (${evt.manager_email})</p>
        <p class="dim-text">Created: ${formatDate(evt.created_at)}</p>
      </div>
      <div class="request-actions">
        <button class="btn-outline btn-purge" style="padding: 0.5rem 1rem; font-size:0.7rem;" onclick="deleteEvent('${evt.event_id}')">PURGE SESSION</button>
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

const fetchHistory = async (options = {}) => {
  try {
    const data = await api('/api/terminal/history', options);
    const countEl = document.getElementById('totalSignalsCount');
    if (countEl) countEl.textContent = data.history.length;
    renderHistory(data.history);
  } catch (err) {
    if (!options.silent) showToast(err.message);
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
        detailsStr = `<span style="color:var(--status-pending);">[INIT]</span> Event <strong>${log.details.event_name}</strong> created by ${log.details.manager}`;
    } else if (log.action === 'GUEST_REGISTERED') {
        detailsStr = `<span style="color:var(--accent-primary);">[REG]</span> Guest <strong>${log.details.name}</strong> (${log.details.email}) registered for <strong>${log.details.event_name}</strong>`;
    } else if (log.action === 'GATE_ENTRY') {
        detailsStr = `<span style="color:var(--status-approved);">[ENTRY]</span> Entry Granted: <strong>${log.details.name}</strong> for <strong>${log.details.event_name}</strong>`;
    } else if (log.action === 'SYSTEM_WIPE') {
        detailsStr = `<span style="color:var(--status-rejected);">[CRITICAL]</span> TOTAL SYSTEM WIPE BY ROOT ADMIN`;
    } else {
        detailsStr = `<span style="color:var(--text-dim);">[LOG]</span> ${JSON.stringify(log.details)}`;
    }

    return `
      <div class="request-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <span class="badge" style="font-size:0.5rem;">${log.action}</span>
            <p style="margin-top:0.5rem; font-size:0.85rem; font-family:'JetBrains Mono', monospace;">${detailsStr}</p>
          </div>
          <span class="dim-text" style="font-size:0.6rem; font-family:monospace;">${date}</span>
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

  // SYSTEM BOOT COMPLETE
  setTimeout(() => {
    document.getElementById('bootLoader')?.classList.add('hidden');
  }, 1000);

  try {
    const data = await api('/api/session', { silent: true });
    if (data.authenticated && data.owner) {
      state.authenticated = true;
      UI.adminLogin.classList.add('hidden');
      UI.adminDashboard.classList.remove('hidden');
      fetchAllEvents();
      fetchHistory();
    }
  } catch (err) {}

  // Periodic polling for updates
  setInterval(() => {
    if (state.authenticated) {
      fetchAllEvents({ silent: true });
      fetchHistory({ silent: true });
    }
  }, 10000);
});
