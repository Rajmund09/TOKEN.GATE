/**
 * HOSTER TERMINAL LOGIC
 * Isolated functions for Event Managers (Gate Control & Local Guests)
 */

const UI = {
  adminLogin: document.getElementById('adminLogin'),
  adminLoginForm: document.getElementById('adminLoginForm'),
  adminDashboard: document.getElementById('adminDashboard'),
  adminNameDisplay: document.getElementById('adminNameDisplay'),
  logoutBtn: document.getElementById('logoutBtn'),
  requestsList: document.getElementById('requestsList'),
  adminSearch: document.getElementById('adminSearch'),
  manualVerifyToken: document.getElementById('manualVerifyToken'),
  verifyTokenBtn: document.getElementById('verifyTokenBtn'),
  verifyLog: document.getElementById('verifyLog'),
  scannerStatus: document.getElementById('scannerStatus'),
  toast: document.getElementById('toast')
};

const state = {
  authenticated: false,
  requests: [],
  scanner: null
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
  showLoader(options.loaderMsg || "TRANSMITTING DATA...");
  try {
    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get("content-type");
    hideLoader();
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
      return data;
    } else {
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);
      return {};
    }
  } catch (err) {
    hideLoader();
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
    showToast('Hoster Terminal Linked');
    
    // Hide login, show dashboard
    UI.adminLogin.classList.add('hidden');
    UI.adminDashboard.classList.remove('hidden');
    UI.adminNameDisplay.textContent = res.event_name;
    
    fetchRequests();
    initScanner();
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

// --- REQUESTS ---

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

  UI.requestsList.innerHTML = filtered.length ? filtered.map((req, i) => `
    <div class="request-item stagger-enter" style="animation-delay: ${i * 0.05}s">
      <div class="request-info">
        <h4>${req.name} 
          <span class="status-badge status-${req.status}">${req.status}</span>
          ${req.entered_at ? `<span class="status-badge status-approved">ENTERED</span>` : ''}
        </h4>
        <p>${req.email}</p>
        <p class="dim-text">ID: ${req.token} | Sync: ${formatDate(req.created_at)}</p>
      </div>
      <div class="request-actions">
        ${req.status === 'pending' ? `
          <button class="btn-primary btn-approve" style="padding: 0.5rem 1rem; font-size:0.7rem;" onclick="updateStatus('${req.token}', 'approved')">ALLOW</button>
          <button class="btn-outline btn-deny" style="padding: 0.5rem 1rem; font-size:0.7rem;" onclick="updateStatus('${req.token}', 'rejected')">DENY</button>
        ` : `
          <button class="btn-purge" style="padding: 0.5rem 1rem; font-size:0.7rem;" onclick="deleteEntry('${req.token}')">PURGE</button>
        `}
      </div>
    </div>
  `).join('') : '<div class="dim-text" style="padding:2rem; text-align:center;">NO PENDING SIGNALS</div>';
};

window.updateStatus = async (token, status) => {
  try {
    await api(`/api/requests/${token}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, expiry_minutes: 1440 })
    });
    showToast(`Protocol: ${status.toUpperCase()}`);
    fetchRequests();
  } catch (err) {
    showToast(err.message);
  }
};

window.deleteEntry = (token) => {
  const modal = document.getElementById('confirmModal');
  const msg = document.getElementById('confirmMessage');
  const acceptBtn = document.getElementById('acceptConfirmBtn');
  const cancelBtn = document.getElementById('cancelConfirmBtn');

  msg.textContent = `Purge identity ${token} from terminal?`;
  modal.showModal();

  const handleAccept = async () => {
    cleanup();
    try {
      await api(`/api/customers/${token}`, { method: 'DELETE' });
      showToast('Identity purged');
      fetchRequests();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleCancel = () => {
    cleanup();
  };

  const cleanup = () => {
    modal.close();
    acceptBtn.removeEventListener('click', handleAccept);
    cancelBtn.removeEventListener('click', handleCancel);
  };

  acceptBtn.addEventListener('click', handleAccept);
  cancelBtn.addEventListener('click', handleCancel);
};

// --- SCANNER & VERIFICATION ---

const initScanner = () => {
  if (!document.getElementById('reader') || state.scanner) return;

  state.scanner = new Html5QrcodeScanner("reader", { 
    fps: 10, 
    qrbox: { width: 250, height: 250 }
  });

  state.scanner.render(async (decodedText) => {
    let token = decodedText;
    try {
      const url = new URL(decodedText);
      const urlToken = url.searchParams.get("token");
      if (urlToken) token = urlToken;
    } catch (e) {}

    UI.scannerStatus.textContent = "SIGNAL ACQUIRED";
    
    try {
      const data = await api(`/api/verify?token=${token}`);
      logVerify(data.message, 'success', data.is_first_entry);
      showToast(data.message);
      fetchRequests();
      
      UI.scannerStatus.textContent = "ACCESS GRANTED";
      UI.scannerStatus.style.color = "var(--status-approved)";
      setTimeout(() => {
          UI.scannerStatus.textContent = "AWAITING SIGNAL";
          UI.scannerStatus.style.color = "";
      }, 3000);
    } catch (err) {
      logVerify(err.message, 'error');
      showToast(err.message);
      UI.scannerStatus.textContent = "ACCESS DENIED";
      UI.scannerStatus.style.color = "var(--status-rejected)";
      setTimeout(() => {
          UI.scannerStatus.textContent = "AWAITING SIGNAL";
          UI.scannerStatus.style.color = "";
      }, 3000);
    }
  });
};

const verifyManual = async () => {
  const token = UI.manualVerifyToken.value.trim();
  if (!token) return;
  try {
    const data = await api(`/api/verify?token=${token}`);
    logVerify(data.message, 'success', data.is_first_entry);
    showToast(data.message);
    fetchRequests(); 
  } catch (err) {
    logVerify(err.message, 'error');
    showToast(err.message);
  }
  UI.manualVerifyToken.value = '';
};

const logVerify = (msg, type, isFirst = true) => {
  if (!UI.verifyLog) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  let prefix = '<span class="log-prefix" style="color:var(--status-approved);">[OK]</span>';
  if (type === 'error') {
    prefix = '<span class="log-prefix" style="color:var(--status-rejected);">[FAIL]</span>';
  } else if (!isFirst) {
    prefix = '<span class="log-prefix" style="color:var(--status-pending);">[RE-ENTRY]</span>';
  }
  
  entry.innerHTML = `
    ${prefix} 
    <div style="flex:1;">
      <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
      ${msg}
    </div>
  `;
  
  UI.verifyLog.appendChild(entry);
  UI.verifyLog.scrollTop = UI.verifyLog.scrollHeight;
};

// --- INIT ---

document.addEventListener('DOMContentLoaded', async () => {
  UI.adminLoginForm.onsubmit = handleLogin;
  UI.logoutBtn.onclick = handleLogout;
  UI.adminSearch.oninput = renderRequests;
  UI.verifyTokenBtn.onclick = verifyManual;

  // SYSTEM BOOT COMPLETE
  setTimeout(() => {
    document.getElementById('bootLoader')?.classList.add('hidden');
  }, 1000);

  // Check existing session
  try {
    const data = await api('/api/session');
    if (data.authenticated && data.event_id) {
      UI.adminLogin.classList.add('hidden');
      UI.adminDashboard.classList.remove('hidden');
      UI.adminNameDisplay.textContent = data.event_name;
      fetchRequests();
      initScanner();
    }
  } catch (err) {}
});
