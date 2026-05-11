/**
 * TOKEN.GATE Core Logic
 * Industrial Grade Access Management
 */

const state = {
  view: 'user', // user | host | admin
  authenticated: false,
  adminData: null,
  requests: [],
  activeEvents: [],
  allEvents: [], // For Root Admin
  isRoot: false,
  scanner: null
};

const UI = {
  // Navigation
  viewSwitchUser: document.getElementById('viewSwitchUser'),
  viewSwitchHost: document.getElementById('viewSwitchHost'),
  userSection: document.getElementById('userSection'),
  hostSection: document.getElementById('hostSection'),

  // User Section
  requestForm: document.getElementById('requestForm'),
  reqEventSelect: document.getElementById('reqEvent'),
  statusTokenInput: document.getElementById('statusToken'),
  checkStatusBtn: document.getElementById('checkStatusBtn'),
  statusResult: document.getElementById('statusResult'),

  // Host Section
  hostForm: document.getElementById('hostForm'),

  // Admin Section (on admin.html)
  adminSection: document.getElementById('adminSection'),
  adminLogin: document.getElementById('adminLogin'),
  adminLoginForm: document.getElementById('adminLoginForm'),
  adminDashboard: document.getElementById('adminDashboard'),
  adminNameDisplay: document.getElementById('adminNameDisplay'),
  rootBadge: document.getElementById('rootBadge'),
  toggleEventsBtn: document.getElementById('toggleEventsBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  requestsList: document.getElementById('requestsList'),
  adminSearch: document.getElementById('adminSearch'),
  manualVerifyToken: document.getElementById('manualVerifyToken'),
  verifyTokenBtn: document.getElementById('verifyTokenBtn'),
  verifyLog: document.getElementById('verifyLog'),
  
  // Root Event Management
  mainDashboardView: document.getElementById('mainDashboardView'),
  globalEventsView: document.getElementById('globalEventsView'),
  eventsList: document.getElementById('eventsList'),

  // Modals
  successModal: document.getElementById('successModal'),
  displayEventId: document.getElementById('displayEventId'),
  copyEventId: document.getElementById('copyEventId'),
  closeSuccessBtn: document.getElementById('closeSuccessBtn'),

  qrDialog: document.getElementById('qrDialog'),
  modalName: document.getElementById('modalName'),
  modalQr: document.getElementById('modalQr'),
  modalToken: document.getElementById('modalToken'),
  modalExpiry: document.getElementById('modalExpiry'),
  copyTokenBtn: document.getElementById('copyTokenBtn'),
  downloadQrBtn: document.getElementById('downloadQrBtn'),
  closeQrModal: document.querySelector('#qrDialog .close-modal'),
  purgeAllBtn: document.getElementById('purgeAllBtn'),
  historyBtn: document.getElementById('historyBtn'),
  historyLog: document.getElementById('historyLog'),
  historyVaultView: document.getElementById('historyVaultView'),
  mainDashboardView: document.getElementById('mainDashboardView'),
  tabHoster: document.getElementById('tabHoster'),
  tabSupervisor: document.getElementById('tabSupervisor'),
  userLabel: document.getElementById('userLabel'),
  passLabel: document.getElementById('passLabel'),
  adminUser: document.getElementById('adminUser'),
  adminPass: document.getElementById('adminPass'),

  confirmModal: document.getElementById('confirmModal'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmProceedBtn: document.getElementById('confirmProceedBtn'),

  // Dynamic Form Builder
  addFieldBtn: document.getElementById('addFieldBtn'),
  fieldBuilderList: document.getElementById('fieldBuilderList'),
  dynamicFieldsContainer: document.getElementById('dynamicFieldsContainer'),
  scannerStatus: document.getElementById('scannerStatus'),

  // Global
  toast: document.getElementById('toast'),
};

// --- UTILS ---

const api = async (url, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new Error('Network Transmission Failed');
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  } else {
    // Handle non-JSON (HTML/Text) errors
    if (!response.ok) {
      if (response.status === 401) throw new Error('Session Expired: Please Re-authenticate');
      if (response.status === 404) throw new Error('Protocol Endpoint Not Found (404)');
      throw new Error(`Server Error: ${response.status}`);
    }
    // If it's a success but not JSON (rare for this API)
    return {};
  }
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

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Secure data copied to clipboard');
  }).catch(() => {
    showToast('Copy protocol failed');
  });
};

// --- VIEW MANAGEMENT ---

const switchView = (view) => {
  try {
    if (!UI.userSection || !UI.hostSection) return; 
    
    state.view = view;
    // Remove active from all
    [UI.viewSwitchUser, UI.viewSwitchHost].forEach(btn => btn?.classList.remove('active'));
    [UI.userSection, UI.hostSection].forEach(sec => sec?.classList.remove('active'));

    // Show selected
    if (view === 'user' && UI.userSection) {
      UI.viewSwitchUser?.classList.add('active');
      UI.userSection.classList.add('active');
      UI.userSection.style.display = 'block';
      setTimeout(() => UI.userSection.style.opacity = '1', 50);
      loadActiveEvents();
    } else if (view === 'host' && UI.hostSection) {
      UI.viewSwitchHost?.classList.add('active');
      UI.hostSection.classList.add('active');
      UI.hostSection.style.display = 'block';
      setTimeout(() => UI.hostSection.style.opacity = '1', 50);
    }
  } catch (err) {
    console.error("View switch protocol failed:", err);
  }
};

const checkAuth = async () => {
  if (!UI.adminDashboard) return; // Only for admin.html
  try {
    const data = await api('/api/session');
    if (data.authenticated) {
      state.authenticated = true;
      state.isRoot = !!data.owner;
      state.adminData = data.owner || data.event_name;
      loadAdminDashboard();
    } else {
      UI.adminDashboard.classList.add('hidden');
      UI.adminLogin.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Session verify failed', err);
  }
};

// --- USER LOGIC ---

const loadActiveEvents = async () => {
  if (!UI.reqEventSelect) return;
  try {
    const data = await api('/api/events/active');
    state.activeEvents = data.events;
    UI.reqEventSelect.innerHTML = '<option value="" disabled selected>Select Active Session</option>' + 
      state.activeEvents.map(e => `<option value="${e.event_id}">${e.event_name} (${e.manager})</option>`).join('');
  } catch (err) {
    UI.reqEventSelect.innerHTML = '<option value="" disabled>Session Registry Offline</option>';
  }
};

const handleRequestSubmit = async (e) => {
  e.preventDefault();
  const btn = UI.requestForm.querySelector('.btn-primary');
  const originalText = btn.innerHTML;
  
  try {
    btn.innerHTML = '<div class="loader"></div> SYNCING...';
    btn.disabled = true;

    const formData = new FormData(UI.requestForm);
    const payload = Object.fromEntries(formData.entries());

    // Collect Dynamic Responses
    const responses = {};
    const dynInputs = document.querySelectorAll('.dynamic-input');
    dynInputs.forEach(input => {
      if (input.type === 'radio') {
        if (input.checked) responses[input.name] = input.value;
      } else {
        responses[input.name] = input.value;
      }
    });
    payload.responses = responses;

    const res = await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast('Identity Transmission Complete');
    UI.statusTokenInput.value = res.token;
    checkStatus();
    UI.requestForm.reset();
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

const checkStatus = async () => {
  const token = UI.statusTokenInput.value.trim();
  if (!token) return showToast('Input Token ID');

  try {
    const data = await api(`/api/status/${token}`);
    renderStatus(data);
  } catch (err) {
    UI.statusResult.innerHTML = `<div class="status-card empty"><p>${err.message}</p></div>`;
  }
};

const renderStatus = (data) => {
  const { status, name, party_type, token } = data;
  UI.statusResult.innerHTML = `
    <div class="panel status-panel reveal-text">
      <div class="panel-header">
        <span class="kicker">Access Signal</span>
        <span class="status-badge status-${status}">${status}</span>
        <h3>${name}</h3>
      </div>
      <p style="margin-bottom:20px;">Target Session: <strong>${party_type}</strong></p>
      ${status === 'approved' ? `
        <button class="btn-primary" onclick="openQrModal('${token}')" style="width:100%">
          GENERATE DIGITAL PASS
        </button>` : ''}
      ${status === 'pending' ? `<p class="dim-text">Sync pending manager override...</p>` : ''}
      ${status === 'rejected' ? `<p class="error-text">Identity rejected. Protocol terminated.</p>` : ''}
    </div>
  `;
};

// --- HOST LOGIC ---

const handleHostSubmit = async (e) => {
  e.preventDefault();
  const btn = UI.hostForm.querySelector('.btn-primary');
  const originalText = btn.innerHTML;

  try {
    btn.innerHTML = '<div class="loader"></div> REGISTERING...';
    btn.disabled = true;

    const formData = new FormData(UI.hostForm);
    const payload = Object.fromEntries(formData.entries());

    // Collect Dynamic Fields
    const fieldRows = document.querySelectorAll('.field-builder-row');
    payload.custom_fields = Array.from(fieldRows).map(row => ({
      label: row.querySelector('.f-label').value.trim(),
      type: row.querySelector('.f-type').value,
      options: row.querySelector('.f-options').value.split(',').map(s => s.trim()).filter(s => s)
    }));

    const res = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    UI.displayEventId.textContent = res.event_id;
    UI.successModal.showModal();
    UI.hostForm.reset();
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// --- ADMIN LOGIC ---

const handleAdminLogin = async (e) => {
  e.preventDefault();
  try {
    const formData = new FormData(UI.adminLoginForm);
    const { username, password } = Object.fromEntries(formData.entries());
    const protocol = UI.tabSupervisor.classList.contains('active') ? 'superior' : 'hoster';

    const res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, protocol })
    });

    state.authenticated = true;
    state.isRoot = !!res.owner;
    state.adminData = res.owner || res.event_name;
    showToast('Terminal Authentication Confirmed');
    loadAdminDashboard();
  } catch (err) {
    showToast(err.message);
  }
};

const loadAdminDashboard = () => {
  UI.adminLogin.classList.add('hidden');
  UI.adminDashboard.classList.remove('hidden');
  UI.adminNameDisplay.textContent = state.adminData;
    if (state.isRoot) {
      UI.rootBadge.classList.remove('hidden');
      UI.toggleEventsBtn.classList.remove('hidden');
      if (UI.purgeAllBtn) UI.purgeAllBtn.classList.remove('hidden');
      if (UI.historyBtn) UI.historyBtn.classList.remove('hidden');
    }

  fetchRequests();
  initScanner();
};

const toggleAdminView = () => {
    const isEvents = !UI.globalEventsView.classList.contains('hidden');
    if (isEvents) {
        UI.globalEventsView.classList.add('hidden');
        UI.mainDashboardView.classList.remove('hidden');
        UI.toggleEventsBtn.textContent = 'Manage Sessions';
        fetchRequests();
    } else {
        UI.mainDashboardView.classList.add('hidden');
        UI.globalEventsView.classList.remove('hidden');
        UI.toggleEventsBtn.textContent = 'Back to Terminal';
        fetchAllEvents();
    }
};

const fetchAllEvents = async () => {
    try {
        const data = await api('/api/events');
        state.allEvents = data.events;
        renderEvents();
    } catch (err) {
        showToast(err.message);
    }
};

const renderEvents = () => {
    UI.eventsList.innerHTML = state.allEvents.map(evt => `
        <div class="request-item">
            <div class="request-info">
                <h4>${evt.event_name} <span class="badge" style="background:var(--accent-dim);">${evt.event_id}</span></h4>
                <p>Manager: ${evt.manager_name} (${evt.manager_email})</p>
                <p class="dim-text">Created: ${formatDate(evt.created_at)}</p>
            </div>
            <div class="request-actions">
                <button class="btn-outline" style="border-color:var(--secondary); color:var(--secondary);" onclick="deleteEvent('${evt.event_id}')">PURGE SESSION</button>
            </div>
        </div>
    `).join('');
};

const deleteEvent = async (eid) => {
    const ok = await showConfirm('Permanent Deletion', `Execute protocol to purge session ${eid} and all associated guest transmissions?`);
    if (!ok) return;
    try {
        await api(`/api/events/${eid}`, { method: 'DELETE' });
        showToast('Session purged from database');
        fetchAllEvents();
        fetchRequests(); // Sync guest list
    } catch (err) {
        showToast(err.message);
    }
};

const fetchRequests = async () => {
  try {
    const data = await api('/api/customers');
    state.requests = data.customers;
    renderRequests();
  } catch (err) {
    showToast(err.message);
  }
};

const renderRequests = () => {
  const filter = UI.adminSearch.value.toLowerCase();
  const filtered = state.requests.filter(r => 
    r.name.toLowerCase().includes(filter) || 
    r.email.toLowerCase().includes(filter) ||
    r.token.toLowerCase().includes(filter)
  );

  UI.requestsList.innerHTML = filtered.length ? filtered.map(req => `
    <div class="request-item">
      <div class="request-info">
        <h4>${req.name} 
          <span class="status-badge status-${req.status}">${req.status}</span>
          ${req.entered_at ? `<span class="status-badge" style="background:var(--accent-dim); color:var(--accent); border-color:var(--accent);">ENTERED</span>` : ''}
        </h4>
        <p>${req.email} | ${req.party_type}</p>
        <div class="custom-responses" style="margin: 0.5rem 0; display:flex; flex-wrap:wrap; gap:0.5rem;">
          ${Object.entries(req.responses).map(([k, v]) => `
            <span style="font-size:0.6rem; background:rgba(255,255,255,0.05); padding:2px 6px; border:1px solid var(--border);">${k}: <strong>${v}</strong></span>
          `).join('')}
        </div>
        <p class="dim-text">ID: ${req.token} | Sync: ${formatDate(req.created_at)} ${req.entered_at ? `| Entry: ${formatDate(req.entered_at)}` : ''}</p>
      </div>
      <div class="request-actions">
        ${req.status === 'pending' ? `
          <button class="btn-primary" style="padding: 0.5rem 1rem; font-size:0.7rem;" onclick="updateStatus('${req.token}', 'approved')">ALLOW</button>
          <button class="btn-outline" style="padding: 0.5rem 1rem; font-size:0.7rem;" onclick="updateStatus('${req.token}', 'rejected')">DENY</button>
        ` : `
          <button class="btn-outline" style="padding: 0.5rem 1rem; font-size:0.7rem;" onclick="deleteEntry('${req.token}')">PURGE</button>
        `}
      </div>
    </div>
  `).join('') : '<div class="dim-text" style="padding:2rem; text-align:center;">NO PENDING SIGNALS</div>';
};

const updateStatus = async (token, status) => {
  try {
    await api(`/api/requests/${token}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, expiry_minutes: 1440 })
    });
    showToast(`Transmission protocol: ${status.toUpperCase()}`);
    fetchRequests();
  } catch (err) {
    showToast(err.message);
  }
};

const deleteEntry = async (token) => {
  const ok = await showConfirm('Identity Purge', `Execute protocol to permanently remove identity ${token} from terminal records?`);
  if (!ok) return;
  try {
    await api(`/api/customers/${token}`, { method: 'DELETE' });
    showToast('Identity purged from terminal records');
    fetchRequests();
  } catch (err) {
    showToast(err.message);
  }
};

const verifyManual = async () => {
  const token = UI.manualVerifyToken.value.trim();
  if (!token) return;

  try {
    const data = await api(`/api/verify?token=${token}`);
    logVerify(data.message, 'success', data.is_first_entry);
    showToast(data.message);
    fetchRequests(); // Refresh list to show 'ENTERED' badge
  } catch (err) {
    logVerify(err.message, 'error');
    showToast(err.message);
  }
  UI.manualVerifyToken.value = '';
};

const logVerify = (msg, type, isFirst = true) => {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  let color = 'var(--success)';
  if (type === 'error') color = 'var(--secondary)';
  else if (!isFirst) color = 'var(--warning)'; // Orange for re-entry
  
  entry.style.color = color;
  entry.style.borderLeft = `2px solid ${color}`;
  entry.style.paddingLeft = '10px';
  entry.style.marginBottom = '5px';
  entry.style.fontSize = '0.75rem';
  entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
  UI.verifyLog.prepend(entry);
};

// --- QR SCANNER LOGIC ---

const initScanner = () => {
  if (!document.getElementById('reader')) return;
  if (state.scanner) return;

  state.scanner = new Html5QrcodeScanner("reader", { 
    fps: 10, 
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0
  });

  const onScanSuccess = async (decodedText) => {
    // Check if scanned text is a URL with a token
    let token = decodedText;
    try {
      const url = new URL(decodedText);
      const urlToken = url.searchParams.get("token");
      if (urlToken) token = urlToken;
    } catch (e) {
      // Not a URL, assume it's the token itself
    }

    if (UI.scannerStatus) UI.scannerStatus.textContent = "SIGNAL ACQUIRED";
    
    try {
      const data = await api(`/api/verify?token=${token}`);
      logVerify(data.message, 'success', data.is_first_entry);
      showToast(data.message);
      fetchRequests(); // Refresh list to show 'ENTERED' badge
      
      // Visual feedback in scanner
      if (UI.scannerStatus) {
        UI.scannerStatus.textContent = "ACCESS GRANTED";
        UI.scannerStatus.style.color = "var(--success)";
        setTimeout(() => {
            UI.scannerStatus.textContent = "AWAITING SIGNAL";
            UI.scannerStatus.style.color = "";
        }, 3000);
      }
    } catch (err) {
      logVerify(err.message, 'error');
      showToast(err.message);
      if (UI.scannerStatus) {
        UI.scannerStatus.textContent = "ACCESS DENIED";
        UI.scannerStatus.style.color = "var(--secondary)";
        setTimeout(() => {
            UI.scannerStatus.textContent = "AWAITING SIGNAL";
            UI.scannerStatus.style.color = "";
        }, 3000);
      }
    }
  };

  state.scanner.render(onScanSuccess);
};

// --- MODALS & QR ---

const openQrModal = async (token) => {
  try {
    const data = await api(`/api/status/${token}`);
    UI.modalName.textContent = data.name;
    UI.modalToken.textContent = data.token;
    UI.modalExpiry.textContent = `Valid Until: ${formatDate(data.expires_at)}`;
    UI.modalQr.src = `/api/qr/${token}`;
    UI.downloadQrBtn.href = `/api/qr/${token}`;
    UI.qrDialog.showModal();
  } catch (err) {
    showToast(err.message);
  }
};

// --- INITIALIZATION ---

const init = () => {
  // Navigation (Public Page)
  if (UI.viewSwitchUser) UI.viewSwitchUser.onclick = () => switchView('user');
  if (UI.viewSwitchHost) UI.viewSwitchHost.onclick = () => switchView('host');

  // User Section
  if (UI.requestForm) UI.requestForm.onsubmit = handleRequestSubmit;
  if (UI.checkStatusBtn) UI.checkStatusBtn.onclick = checkStatus;

  // Host Section
  if (UI.hostForm) UI.hostForm.onsubmit = handleHostSubmit;
  if (UI.copyEventId) UI.copyEventId.onclick = () => copyToClipboard(UI.displayEventId.textContent);
  if (UI.closeSuccessBtn) UI.closeSuccessBtn.onclick = () => {
    UI.successModal.close();
    window.location.href = '/admin';
  };

  // Admin Portal (admin.html)
  if (UI.adminLoginForm) UI.adminLoginForm.onsubmit = handleAdminLogin;
  if (UI.logoutBtn) UI.logoutBtn.onclick = () => {
    state.authenticated = false;
    UI.adminDashboard.classList.add('hidden');
    UI.adminLogin.classList.remove('hidden');
    api('/api/logout', { method: 'POST' });
  };
  if (UI.adminSearch) UI.adminSearch.oninput = renderRequests;
  if (UI.verifyTokenBtn) UI.verifyTokenBtn.onclick = verifyManual;
  if (UI.toggleEventsBtn) UI.toggleEventsBtn.onclick = toggleAdminView;

  // QR Modal
  if (UI.closeQrModal) UI.closeQrModal.onclick = () => UI.qrDialog.close();
  if (UI.copyTokenBtn) UI.copyTokenBtn.onclick = () => copyToClipboard(UI.modalToken.textContent);

  // Initial Data Load
  if (UI.reqEventSelect) {
    loadActiveEvents();
    switchView('user'); 
  }
  if (UI.adminSection) checkAuth();

  // SYSTEM BOOT COMPLETE
  setTimeout(() => {
    const loader = document.getElementById('bootLoader');
    if (loader) loader.classList.add('hidden');
  }, 1000);
};

// Expose globals
window.openQrModal = openQrModal;
window.updateStatus = updateStatus;
window.deleteEntry = deleteEntry;
window.deleteEvent = deleteEvent;

// --- DYNAMIC FORM BUILDER ---

const addFieldBuilderRow = () => {
  const id = Date.now();
  const row = document.createElement('div');
  row.className = 'field-builder-row panel reveal-text';
  row.style.padding = '1.2rem';
  row.style.background = 'rgba(0, 242, 255, 0.02)';
  row.style.borderLeft = '4px solid var(--accent)';
  row.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:0.8rem;">
      <div class="form-group">
        <label style="font-size:0.6rem; color:var(--accent);">FIELD LABEL</label>
        <input type="text" class="f-label" placeholder="e.g. Gender" required>
      </div>
      <div class="form-group">
        <label style="font-size:0.6rem; color:var(--accent);">INPUT TYPE</label>
        <select class="f-type">
          <option value="text">TEXT LINE</option>
          <option value="dropdown">DROPDOWN LIST</option>
          <option value="radio">SELECTION RADIO</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label style="font-size:0.6rem; color:var(--accent);">OPTIONS (COMMA SEPARATED)</label>
      <input type="text" class="f-options" placeholder="Male, Female, Other">
    </div>
    <button type="button" class="btn-outline" style="margin-top:0.8rem; width:100%; color:var(--secondary); border-color:var(--secondary); font-size:0.6rem;" onclick="this.parentElement.remove()">DESTROY FIELD RECORD</button>
  `;
  UI.fieldBuilderList.appendChild(row);
};

const purgeAllData = async () => {
  const ok = await showConfirm('MASTER OVERRIDE', 'Are you absolutely sure? This will permanently wipe EVERY session and EVERY participant record from the global terminal. This action is irreversible.');
  if (!ok) return;

  try {
    await api('/api/terminal/purge-all', { method: 'POST' });
    showToast('TOTAL SYSTEM WIPE COMPLETE');
    fetchAllEvents();
    fetchRequests();
  } catch (err) {
    showToast(err.message);
  }
};

const renderDynamicFields = (eventId) => {
  const event = state.activeEvents.find(e => e.event_id === eventId);
  if (!event || !event.fields || event.fields.length === 0) {
    UI.dynamicFieldsContainer.innerHTML = '';
    return;
  }

  UI.dynamicFieldsContainer.innerHTML = event.fields.map(field => {
    let inputHtml = '';
    if (field.type === 'text') {
      inputHtml = `<input type="text" name="${field.label}" class="dynamic-input" placeholder="Enter ${field.label}" required>`;
    } else if (field.type === 'dropdown') {
      inputHtml = `<select name="${field.label}" class="dynamic-input" required>
        <option value="" disabled selected>Select ${field.label}</option>
        ${field.options.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>`;
    } else if (field.type === 'radio') {
      inputHtml = `<div style="display:flex; gap:1.5rem; flex-wrap:wrap; margin-top:0.5rem;">
        ${field.options.map(o => `
          <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
            <input type="radio" name="${field.label}" value="${o}" class="dynamic-input" required style="width:auto;"> ${o}
          </label>
        `).join('')}
      </div>`;
    }

    return `
      <div class="form-group reveal-text" style="border-left:2px solid var(--accent); padding-left:1rem;">
        <label>${field.label}</label>
        ${inputHtml}
      </div>
    `;
  }).join('');
};

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
    }

    return `
      <div class="request-card reveal-text" style="border-bottom:1px solid rgba(255,255,255,0.05); padding:1rem 0;">
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

const toggleHistoryVault = () => {
  const isVisible = !UI.historyVaultView.classList.contains('hidden');
  if (isVisible) {
    UI.historyVaultView.classList.add('hidden');
    UI.mainDashboardView.classList.remove('hidden');
    UI.historyBtn.textContent = 'AUDIT VAULT';
  } else {
    UI.historyVaultView.classList.remove('hidden');
    UI.mainDashboardView.classList.add('hidden');
    UI.globalEventsView.classList.add('hidden'); // Close other views
    UI.historyBtn.textContent = 'BACK TO TERMINAL';
    fetchHistory();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  init();
  if (UI.addFieldBtn) UI.addFieldBtn.onclick = addFieldBuilderRow;
  if (UI.purgeAllBtn) UI.purgeAllBtn.onclick = purgeAllData;
  if (UI.historyBtn) UI.historyBtn.onclick = toggleHistoryVault;

  if (UI.tabHoster) {
    UI.tabHoster.onclick = () => {
      UI.tabHoster.classList.add('active');
      UI.tabHoster.style.background = 'rgba(0, 242, 255, 0.05)';
      UI.tabHoster.style.borderColor = 'var(--accent)';
      UI.tabSupervisor.classList.remove('active');
      UI.tabSupervisor.style.background = 'none';
      UI.tabSupervisor.style.borderColor = 'transparent';
      UI.userLabel.textContent = 'Identity Identifier (Event ID)';
      UI.passLabel.textContent = 'Security Access Key';
      UI.adminUser.placeholder = 'EVT-XXXX-XXXX';
    };
  }
  if (UI.tabSupervisor) {
    UI.tabSupervisor.onclick = () => {
      UI.tabSupervisor.classList.add('active');
      UI.tabSupervisor.style.background = 'rgba(255, 62, 62, 0.05)';
      UI.tabSupervisor.style.borderColor = 'var(--secondary)';
      UI.tabHoster.classList.remove('active');
      UI.tabHoster.style.background = 'none';
      UI.tabHoster.style.borderColor = 'transparent';
      UI.userLabel.textContent = 'Supervisor Username';
      UI.passLabel.textContent = 'Mainframe Passcode';
      UI.adminUser.placeholder = 'Enter Username';
    };
  }
  if (UI.adminLoginBtn) UI.adminLoginBtn.onclick = handleLogin;
  if (UI.logoutBtn) UI.logoutBtn.onclick = logout;
  if (UI.verifyBtn) UI.verifyBtn.onclick = verifyToken;
  if (UI.toggleEventsBtn) UI.toggleEventsBtn.onclick = () => {
    UI.globalEventsView.classList.toggle('hidden');
    if (!UI.globalEventsView.classList.contains('hidden')) fetchAllEvents();
  };
  if (UI.hostForm) UI.hostForm.onsubmit = handleHostSubmit;
  if (UI.reqForm) UI.reqForm.onsubmit = handleRequestSubmit;
  if (UI.reqEventSelect) {
    UI.reqEventSelect.onchange = (e) => renderDynamicFields(e.target.value);
  }
});
