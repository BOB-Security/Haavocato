'use strict';

const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const codeForm = document.getElementById('codeForm');
let authMode = 'login';
const dashboardMessage = document.getElementById('dashboardMessage');
const logoutButton = document.getElementById('logoutButton');
const refreshButton = document.getElementById('refreshButton');
const requestList = document.getElementById('requestList');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
let requests = [];

const statusLabels = { new: 'جديد', reviewing: 'قيد المراجعة', contacted: 'تم التواصل', closed: 'مغلق' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'تعذر تنفيذ الطلب. حاول مرة أخرى.');
  return body;
}

function showDashboard() {
  loginPanel.classList.add('hidden');
  dashboardPanel.classList.remove('hidden');
  logoutButton.classList.remove('hidden');
}

function showLogin() {
  dashboardPanel.classList.add('hidden'); loginPanel.classList.remove('hidden'); logoutButton.classList.add('hidden');
}
function setAuthMode(mode) {
  authMode = mode; loginForm.classList.toggle('hidden', mode !== 'login'); codeForm.classList.toggle('hidden', mode === 'login');
  loginMessage.classList.remove('success'); loginMessage.textContent = '';
  if (mode !== 'login') {
    document.getElementById('codeInstructions').textContent = mode === 'setup' ? 'سيصلك رمز تفعيل على البريد المعتمد. أدخله واختر كلمة مرور دائمة.' : 'سيصلك رمز إعادة تعيين على البريد المعتمد. أدخله واختر كلمة مرور جديدة.';
    api('/api/admin/request-code', {method:'POST', body:JSON.stringify({purpose:mode})})
      .then(x=>{loginMessage.textContent=x.message;loginMessage.classList.add('success');})
      .catch(e=>{loginMessage.textContent=e.message;});
  }
}
document.getElementById('showLogin').addEventListener('click',()=>setAuthMode('login'));
document.getElementById('showSetup').addEventListener('click',()=>setAuthMode('setup'));
document.getElementById('showReset').addEventListener('click',()=>setAuthMode('reset'));
codeForm.addEventListener('submit', async (event)=>{
  event.preventDefault(); const button=codeForm.querySelector('button[type=submit]'); button.disabled=true;
  try { const x=await api('/api/admin/complete-password',{method:'POST',body:JSON.stringify({code:document.getElementById('code').value,password:document.getElementById('newPassword').value})});
    codeForm.reset(); setAuthMode('login'); loginMessage.textContent=x.message; loginMessage.classList.add('success');
  } catch(e){loginMessage.textContent=e.message;} finally{button.disabled=false;}
});

function renderRequests() {
  const term = searchInput.value.trim().toLocaleLowerCase();
  const selectedStatus = statusFilter.value;
  const filtered = requests.filter((item) => {
    const searchable = [item.full_name, item.email, item.phone, item.service, item.details].join(' ').toLocaleLowerCase();
    return (!term || searchable.includes(term)) && (selectedStatus === 'all' || item.status === selectedStatus);
  });

  document.getElementById('totalCount').textContent = String(requests.length);
  document.getElementById('newCount').textContent = String(requests.filter((x) => x.status === 'new').length);
  document.getElementById('reviewingCount').textContent = String(requests.filter((x) => x.status === 'reviewing').length);
  document.getElementById('closedCount').textContent = String(requests.filter((x) => x.status === 'closed').length);
  requestList.replaceChildren();
  emptyState.classList.toggle('hidden', filtered.length !== 0);

  for (const item of filtered) {
    const card = document.createElement('article');
    card.className = 'request-card';
    const date = item.created_at ? new Date(item.created_at).toLocaleString('ar-EG') : '—';
    card.innerHTML = `
      <div class="request-head">
        <div><h2>طلب #${escapeHtml(item.id)} — ${escapeHtml(item.full_name)}</h2><div class="request-meta">تاريخ الاستلام: ${escapeHtml(date)}</div></div>
        <span class="status-pill status-${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</span>
      </div>
      <div class="request-fields">
        <div><span>البريد الإلكتروني</span>${escapeHtml(item.email)}</div>
        <div><span>الهاتف</span>${escapeHtml(item.phone)}</div>
        <div><span>نوع الخدمة</span>${escapeHtml(item.service)}</div>
      </div>
      <p class="details">${escapeHtml(item.details)}</p>
      <div class="request-footer">
        <label>تحديث حالة الطلب
          <select data-status-for="${escapeHtml(item.id)}">
            ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${item.status === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <button class="button secondary" type="button" data-save-status="${escapeHtml(item.id)}">حفظ الحالة</button>
      </div>`;
    requestList.append(card);
  }
}

async function loadRequests() {
  dashboardMessage.textContent = 'جارٍ تحميل الطلبات…';
  dashboardMessage.classList.remove('success');
  refreshButton.disabled = true;
  try {
    const data = await api('/api/admin/consultations');
    requests = data.requests || [];
    renderRequests();
    dashboardMessage.textContent = requests.length ? 'تم تحديث الطلبات.' : 'لا توجد طلبات مسجلة بعد.';
    dashboardMessage.classList.add('success');
  } catch (error) {
    dashboardMessage.textContent = error.message;
    dashboardMessage.classList.remove('success');
    if (/تسجيل الدخول|الجلسة/.test(error.message)) showLogin();
  } finally {
    refreshButton.disabled = false;
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  loginMessage.textContent = 'جارٍ التحقق…';
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({
      email: document.getElementById('email').value,
      password: document.getElementById('password').value
    }) });
    document.getElementById('password').value = '';
    loginMessage.textContent = '';
    showDashboard();
    await loadRequests();
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  requests = [];
  showLogin();
  loginMessage.textContent = 'تم تسجيل الخروج.';
});
refreshButton.addEventListener('click', loadRequests);
searchInput.addEventListener('input', renderRequests);
statusFilter.addEventListener('change', renderRequests);

requestList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-save-status]');
  if (!button) return;
  const id = button.getAttribute('data-save-status');
  const select = requestList.querySelector(`[data-status-for="${CSS.escape(id)}"]`);
  if (!select) return;
  button.disabled = true;
  try {
    await api(`/api/admin/consultations/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: select.value })
    });
    const item = requests.find((x) => String(x.id) === id);
    if (item) item.status = select.value;
    renderRequests();
    dashboardMessage.textContent = 'تم حفظ حالة الطلب.';
    dashboardMessage.classList.add('success');
  } catch (error) {
    dashboardMessage.textContent = error.message;
    dashboardMessage.classList.remove('success');
  } finally {
    button.disabled = false;
  }
});

(async function init() {
  setAuthMode('login');
  try {
    await api('/api/admin/consultations');
    showDashboard();
    await loadRequests();
  } catch {
    showLogin();
  }
})();
