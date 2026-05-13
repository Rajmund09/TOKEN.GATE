/**
 * TOKEN.GATE Core Logic
 * Public Portal (Guest & Host Registration)
 */

const state = {
  view: 'user', // user | host
  activeEvents: []
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
  dynamicFieldsContainer: document.getElementById('dynamicFieldsContainer'),

  // Host Section
  hostForm: document.getElementById('hostForm'),
  addFieldBtn: document.getElementById('addFieldBtn'),
  fieldBuilderList: document.getElementById('fieldBuilderList'),

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

  // Global
  toast: document.getElementById('toast'),
};

// --- UTILS ---

const api = async (url, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  showLoader(options.loaderMsg || "TRANSMITTING DATA...");
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    hideLoader();
    throw new Error('Network Transmission Failed');
  }

  const contentType = response.headers.get("content-type");
  hideLoader();
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  } else {
    if (!response.ok) {
      if (response.status === 401) throw new Error('Session Expired: Please Re-authenticate');
      if (response.status === 404) throw new Error('Protocol Endpoint Not Found (404)');
      throw new Error(`Server Error: ${response.status}`);
    }
    return {};
  }
};

const showToast = (msg, duration = 4000) => {
  if (!UI.toast) return;
  UI.toast.textContent = msg;
  UI.toast.classList.add('show');
  setTimeout(() => UI.toast.classList.remove('show'), duration);
};

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
    // Update theme
    document.body.classList.remove('theme-guest', 'theme-host');
    document.body.classList.add(view === 'user' ? 'theme-guest' : 'theme-host');

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
      <div class="form-group reveal-text" style="border-left:2px solid var(--accent-primary); padding-left:1rem;">
        <label>${field.label}</label>
        ${inputHtml}
      </div>
    `;
  }).join('');
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
    UI.dynamicFieldsContainer.innerHTML = ''; // Reset dynamic fields
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

const addFieldBuilderRow = () => {
  const row = document.createElement('div');
  row.className = 'field-builder-row panel reveal-text';
  row.style.padding = '1.2rem';
  row.style.background = 'rgba(0, 242, 255, 0.02)';
  row.style.borderLeft = '4px solid var(--accent-primary)';
  row.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:0.8rem;">
      <div class="form-group">
        <label style="font-size:0.6rem; color:var(--accent-primary);">FIELD LABEL</label>
        <input type="text" class="f-label" placeholder="e.g. Gender" required>
      </div>
      <div class="form-group">
        <label style="font-size:0.6rem; color:var(--accent-primary);">INPUT TYPE</label>
        <select class="f-type">
          <option value="text">TEXT LINE</option>
          <option value="dropdown">DROPDOWN LIST</option>
          <option value="radio">SELECTION RADIO</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label style="font-size:0.6rem; color:var(--accent-primary);">OPTIONS (COMMA SEPARATED)</label>
      <input type="text" class="f-options" placeholder="Male, Female, Other">
    </div>
    <button type="button" class="btn-outline" style="margin-top:0.8rem; width:100%; color:var(--status-rejected); border-color:var(--status-rejected); font-size:0.6rem;" onclick="this.parentElement.remove()">DESTROY FIELD RECORD</button>
  `;
  UI.fieldBuilderList.appendChild(row);
};

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
    UI.fieldBuilderList.innerHTML = ''; // Reset fields
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
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

window.openQrModal = openQrModal;

// --- INITIALIZATION ---

const init = () => {
  // Navigation
  if (UI.viewSwitchUser) UI.viewSwitchUser.onclick = () => switchView('user');
  if (UI.viewSwitchHost) UI.viewSwitchHost.onclick = () => switchView('host');

  // User Section
  if (UI.requestForm) UI.requestForm.onsubmit = handleRequestSubmit;
  if (UI.reqEventSelect) UI.reqEventSelect.onchange = (e) => renderDynamicFields(e.target.value);
  if (UI.checkStatusBtn) UI.checkStatusBtn.onclick = checkStatus;

  // Host Section
  if (UI.hostForm) UI.hostForm.onsubmit = handleHostSubmit;
  if (UI.addFieldBtn) UI.addFieldBtn.onclick = addFieldBuilderRow;
  if (UI.copyEventId) UI.copyEventId.onclick = () => copyToClipboard(UI.displayEventId.textContent);
  if (UI.closeSuccessBtn) UI.closeSuccessBtn.onclick = () => {
    UI.successModal.close();
    window.location.href = '/hoster';
  };

  // QR Modal
  if (UI.closeQrModal) UI.closeQrModal.onclick = () => UI.qrDialog.close();
  if (UI.copyTokenBtn) UI.copyTokenBtn.onclick = () => copyToClipboard(UI.modalToken.textContent);

  // Initial Data Load
  if (UI.reqEventSelect) {
    loadActiveEvents();
    switchView('user'); 
  }

  // SYSTEM BOOT COMPLETE
  setTimeout(() => {
    const loader = document.getElementById('bootLoader');
    if (loader) loader.classList.add('hidden');
  }, 1000);
};

document.addEventListener('DOMContentLoaded', init);
