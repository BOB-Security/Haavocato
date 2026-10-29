'use strict';

const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const dashboardMessage = document.getElementById('dashboardMessage');
const logoutButton = document.getElementById('logoutButton');
const refreshButton = document.getElementById('refreshButton');
const requestList = document.getElementById('requestList');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
let requests = [];

const labels = {
  new:'جديد',triage:'فرز أولي',awaiting_client:'بانتظار العميل',assigned:'تم الإسناد',
  in_progress:'قيد التنفيذ',awaiting_payment:'بانتظار الدفع',scheduled:'مجدول',
  completed:'مكتمل',declined:'مرفوض',cancelled:'ملغي',archived:'مؤرشف'
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'تعذر تنفيذ الطلب.');
  return body;
}

function showLogin() {
  dashboardPanel.classList.add('hidden');
  loginPanel.classList.remove('hidden');
  logoutButton.classList.add('hidden');
}

function showDashboard() {
  loginPanel.classList.add('hidden');
  dashboardPanel.classList.remove('hidden');
  logoutButton.classList.remove('hidden');
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderRequests() {
  const term = searchInput.value.trim().toLocaleLowerCase();
  const status = statusFilter.value;
  const filtered = requests.filter((item) => {
    const searchable = [item.reference_code,item.requester_name,item.requester_email,item.requester_phone,item.service_name_snapshot].join(' ').toLocaleLowerCase();
    return (!term || searchable.includes(term)) && (status === 'all' || item.status === status);
  });

  document.getElementById('totalCount').textContent = String(requests.length);
  document.getElementById('newCount').textContent = String(requests.filter((x) => x.status === 'new').length);
  document.getElementById('triageCount').textContent = String(requests.filter((x) => ['triage','awaiting_client'].includes(x.status)).length);
  document.getElementById('progressCount').textContent = String(requests.filter((x) => ['assigned','in_progress','scheduled'].includes(x.status)).length);
  requestList.replaceChildren();
  emptyState.classList.toggle('hidden', filtered.length !== 0);

  filtered.forEach((item) => {
    const card = node('article','request-card');
    const head = node('div','request-head');
    const titleWrap = node('div','');
    const heading = node('div','request-heading');
    heading.append(node('h3','',item.requester_name || '—'),node('span','reference-code',item.reference_code || '—'));
    titleWrap.append(heading,node('div','request-meta',(item.service_name_snapshot || '—') + ' · ' + formatDate(item.submitted_at)));
    const pill = node('span','status-pill status-' + safeStatus(item.status),labels[item.status] || item.status || '—');
    head.append(titleWrap,pill);
    const fields = node('div','request-fields');
    fields.append(field('البريد الإلكتروني',item.requester_email),field('رقم الهاتف',item.requester_phone),field('الخدمة',item.service_name_snapshot));
    const description = node('div','request-description','ملخص الطلب: ' + (item.description || '—'));
    const controls = node('div','request-controls');
    const label = node('label','','تحديث الحالة');
    const select = document.createElement('select');
    select.setAttribute('aria-label','تحديث حالة ' + (item.reference_code || 'الطلب'));
    Object.entries(labels).forEach(([value,text]) => {
      const option = new Option(text,value);
      option.selected = value === item.status;
      select.add(option);
    });
    label.append(select);
    const save = node('button','button button-outline','حفظ الحالة');
    save.type = 'button';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const result = await api('/api/admin/requests/' + encodeURIComponent(item.id) + '/status', {
          method:'PATCH',
          body:JSON.stringify({status:select.value,publicMessage:null,internalNote:null})
        });
        item.status = result.request.status;
        renderRequests();
        setMessage('تم تحديث حالة الطلب بنجاح.',true);
      } catch (error) {
        setMessage(error.message,false);
      } finally {
        save.disabled = false;
      }
    });
    controls.append(label,save);
    card.append(head,fields,description,controls);
    requestList.append(card);
  });
}

function safeStatus(value) {
  return Object.hasOwn(labels,value) ? value : 'new';
}
function field(title,value) {
  const item = node('div','request-field');
  item.append(node('span','',title),node('div','',value || '—'));
  return item;
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-EG');
}
function setMessage(message,success) {
  dashboardMessage.textContent = message;
  dashboardMessage.classList.toggle('success',Boolean(success));
}

async function loadRequests() {
  refreshButton.disabled = true;
  setMessage('جارٍ تحميل الطلبات…',true);
  try {
    const data = await api('/api/admin/requests?limit=100');
    requests = Array.isArray(data.requests) ? data.requests : [];
    renderRequests();
    setMessage(requests.length ? 'تم تحميل الطلبات.' : 'لا توجد طلبات مسجلة بعد.',true);
  } catch (error) {
    setMessage(error.message,false);
    if (/Authentication required/i.test(error.message)) showLogin();
  } finally {
    refreshButton.disabled = false;
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type=submit]');
  button.disabled = true;
  loginMessage.textContent = 'جارٍ التحقق…';
  try {
    await api('/api/auth/login',{method:'POST',body:JSON.stringify({
      email:document.getElementById('email').value,
      password:document.getElementById('password').value
    })});
    document.getElementById('password').value = '';
    showDashboard();
    await loadRequests();
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  try { await api('/api/auth/logout',{method:'POST',body:'{}'}); } catch {}
  requests = [];
  showLogin();
  loginMessage.textContent = 'تم تسجيل الخروج.';
});

refreshButton.addEventListener('click',loadRequests);
searchInput.addEventListener('input',renderRequests);
statusFilter.addEventListener('change',renderRequests);

(async function init() {
  try {
    await api('/api/auth/me');
    showDashboard();
    await loadRequests();
  } catch {
    showLogin();
  }
})();
