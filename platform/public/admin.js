'use strict';

const loginPanel=document.getElementById('loginPanel');
const dashboardPanel=document.getElementById('dashboardPanel');
const loginForm=document.getElementById('loginForm');
const loginMessage=document.getElementById('loginMessage');
const dashboardMessage=document.getElementById('dashboardMessage');
const logoutButton=document.getElementById('logoutButton');
const refreshButton=document.getElementById('refreshButton');
const requestList=document.getElementById('requestList');
const emptyState=document.getElementById('emptyState');
const searchInput=document.getElementById('searchInput');
const statusFilter=document.getElementById('statusFilter');
let requests=[];
let appointments=[];
let availabilityRules=[];
let lawyers=[];
let paymentItems=[];

const requestStatuses={new:'جديد',triage:'فرز أولي',awaiting_client:'بانتظار العميل',assigned:'تم الإسناد',in_progress:'قيد التنفيذ',awaiting_payment:'بانتظار الدفع',scheduled:'مجدول',completed:'مكتمل',declined:'مرفوض',cancelled:'ملغي',archived:'مؤرشف'};
const appointmentStatuses={requested:'بانتظار التأكيد',confirmed:'مؤكد',rescheduled:'أعيدت جدولته',completed:'مكتمل',cancelled:'ملغي',no_show:'لم يحضر'};
const appointmentTransitions={requested:['confirmed','cancelled'],confirmed:['rescheduled','completed','cancelled','no_show'],rescheduled:['confirmed','completed','cancelled','no_show'],completed:[],cancelled:[],no_show:[]};
const weekdayNames=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

async function api(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'تعذر تنفيذ الطلب.');
  return body;
}
function node(tag,className,text){
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
}
function showDashboard(){loginPanel.classList.add('hidden');dashboardPanel.classList.remove('hidden');logoutButton.classList.remove('hidden');}
function showLogin(){dashboardPanel.classList.add('hidden');loginPanel.classList.remove('hidden');logoutButton.classList.add('hidden');}
function setMessage(element,text,success=false){element.textContent=text;element.classList.toggle('success',Boolean(success));}
function formatDate(value){if(!value)return'—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('ar-EG');}
function field(title,value){const item=node('div','request-field');item.append(node('span','',title),node('div','',value||'—'));return item;}

function renderRequests(){
  const term=searchInput.value.trim().toLocaleLowerCase();
  const status=statusFilter.value;
  const filtered=requests.filter(item=>{
    const searchable=[item.reference_code,item.requester_name,item.requester_email,item.requester_phone,item.service_name_snapshot].join(' ').toLocaleLowerCase();
    return(!term||searchable.includes(term))&&(status==='all'||item.status===status);
  });
  document.getElementById('totalCount').textContent=String(requests.length);
  document.getElementById('newCount').textContent=String(requests.filter(x=>x.status==='new').length);
  document.getElementById('triageCount').textContent=String(requests.filter(x=>['triage','awaiting_client'].includes(x.status)).length);
  document.getElementById('progressCount').textContent=String(requests.filter(x=>['assigned','in_progress','scheduled'].includes(x.status)).length);
  requestList.replaceChildren();
  emptyState.classList.toggle('hidden',filtered.length!==0);
  filtered.forEach(item=>{
    const card=node('article','request-card');
    const head=node('div','request-head');
    const titleWrap=node('div','');
    const heading=node('div','request-heading');
    heading.append(node('h3','',item.requester_name||'—'),node('span','reference-code',item.reference_code||'—'));
    titleWrap.append(heading,node('div','request-meta',(item.service_name_snapshot||'—')+' · '+formatDate(item.submitted_at)));
    head.append(titleWrap,node('span','status-pill status-'+item.status,requestStatuses[item.status]||item.status||'—'));
    const fields=node('div','request-fields');
    fields.append(field('البريد الإلكتروني',item.requester_email),field('رقم الهاتف',item.requester_phone),field('الخدمة',item.service_name_snapshot));
    const description=node('div','request-description','ملخص الطلب: '+(item.description||'—'));
    const controls=node('div','request-controls');
    const label=node('label','','تحديث الحالة');
    const select=document.createElement('select');
    select.setAttribute('aria-label','تحديث حالة '+(item.reference_code||'الطلب'));
    Object.entries(requestStatuses).forEach(([value,text])=>{const option=new Option(text,value);option.selected=value===item.status;select.add(option);});
    label.append(select);
    const save=node('button','button button-outline','حفظ الحالة');save.type='button';
    save.addEventListener('click',async()=>{
      save.disabled=true;
      try{
        const result=await api('/api/admin/requests/'+encodeURIComponent(item.id)+'/status',{method:'PATCH',body:JSON.stringify({status:select.value,publicMessage:null,internalNote:null})});
        item.status=result.request.status;renderRequests();setMessage(dashboardMessage,'تم تحديث حالة الطلب بنجاح.',true);
      }catch(error){setMessage(dashboardMessage,error.message,false);}finally{save.disabled=false;}
    });
    controls.append(label,save);card.append(head,fields,description,controls);requestList.append(card);
  });
}

async function loadRequests(){
  refreshButton.disabled=true;setMessage(dashboardMessage,'جارٍ تحميل الطلبات…',true);
  try{
    const data=await api('/api/admin/requests?limit=100');requests=Array.isArray(data.requests)?data.requests:[];
    renderRequests();setMessage(dashboardMessage,requests.length?'تم تحميل الطلبات.':'لا توجد طلبات مسجلة بعد.',true);
  }catch(error){setMessage(dashboardMessage,error.message,false);if(/Authentication required/i.test(error.message))showLogin();}
  finally{refreshButton.disabled=false;}
}

async function loadAppointments(){
  const container=document.getElementById('adminAppointmentList');
  const message=document.getElementById('appointmentsMessage');
  container.replaceChildren();
  try{
    const data=await api('/api/admin/appointments');appointments=Array.isArray(data.appointments)?data.appointments:[];
    if(!appointments.length){container.append(node('p','request-meta','لا توجد مواعيد مسجلة.'));setMessage(message,'تم تحميل المواعيد.',true);return;}
    appointments.forEach(item=>{
      const card=node('article','request-card');
      const head=node('div','request-head');
      const left=node('div','');
      const heading=node('div','request-heading');
      heading.append(node('h3','',item.client_name||'عميل'),node('span','reference-code',item.reference_code||'بدون طلب مرتبط'));
      left.append(heading,node('div','request-meta',formatDate(item.starts_at)+' – '+formatDate(item.ends_at)+' · '+(item.lawyer_name||'لم يحدد محامٍ')));
      head.append(left,node('span','status-pill',appointmentStatuses[item.status]||item.status));
      const details=node('div','request-fields');
      details.append(field('نوع الاستشارة',item.consultation_mode==='video'?'فيديو':item.consultation_mode==='phone'?'هاتف':'حضوري'),field('الحالة',appointmentStatuses[item.status]||item.status),field('المنطقة الزمنية',item.timezone));
      const controls=node('div','admin-appointment-controls');
      const transitions=appointmentTransitions[item.status]||[];
      if(transitions.length){
        const label=node('label','','تغيير الحالة');
        const select=document.createElement('select');
        transitions.forEach(value=>select.add(new Option(appointmentStatuses[value],value)));
        label.append(select);
        const save=node('button','button button-outline','حفظ');save.type='button';
        save.addEventListener('click',async()=>{
          save.disabled=true;
          try{await api('/api/admin/appointments/'+encodeURIComponent(item.id)+'/status',{method:'PATCH',body:JSON.stringify({status:select.value})});setMessage(message,'تم تحديث حالة الموعد.',true);await loadAppointments();}
          catch(error){setMessage(message,error.message,false);}finally{save.disabled=false;}
        });
        controls.append(label,save);
      }else controls.append(node('span','request-meta','حالة نهائية'));
      card.append(head,details,controls);container.append(card);
    });
    setMessage(message,'تم تحميل المواعيد.',true);
  }catch(error){setMessage(message,error.message,false);}
}

async function loadLawyers(){
  const select=document.getElementById('availabilityLawyer');
  try{
    const data=await api('/api/admin/staff/lawyers');lawyers=Array.isArray(data.lawyers)?data.lawyers:[];
    select.replaceChildren(new Option(lawyers.length?'اختر المحامي':'لا توجد ملفات محامين نشطة',''));
    lawyers.forEach(lawyer=>select.add(new Option(lawyer.display_name,lawyer.user_id)));
    if(!lawyers.length)setMessage(document.getElementById('availabilityMessage'),'أضف ملف محامٍ نشطًا قبل إنشاء قواعد التوافر.',false);
  }catch(error){setMessage(document.getElementById('availabilityMessage'),error.message,false);}
}

async function loadAvailability(){
  const container=document.getElementById('availabilityRuleList');
  const message=document.getElementById('availabilityMessage');
  container.replaceChildren();
  try{
    const data=await api('/api/admin/appointments/availability');availabilityRules=Array.isArray(data.rules)?data.rules:[];
    if(!availabilityRules.length){container.append(node('p','request-meta','لا توجد قواعد توافر بعد.'));return;}
    availabilityRules.forEach(rule=>{
      const row=node('div','availability-rule');
      const info=node('div','');
      info.append(node('strong','',(rule.display_name||'محامٍ')+' · '+weekdayNames[Number(rule.weekday)]+' · '+String(rule.starts_local).slice(0,5)+'–'+String(rule.ends_local).slice(0,5)));
      info.append(node('small','',(rule.timezone||'Africa/Cairo')+(rule.is_active?' · نشط':' · متوقف')+(rule.valid_from?' · من '+rule.valid_from:'')+(rule.valid_until?' · حتى '+rule.valid_until:'')));
      row.append(info);
      if(rule.is_active){
        const deactivate=node('button','','إيقاف');deactivate.type='button';
        deactivate.addEventListener('click',async()=>{
          deactivate.disabled=true;
          try{await api('/api/admin/appointments/availability/'+encodeURIComponent(rule.id),{method:'DELETE'});setMessage(message,'تم إيقاف قاعدة التوافر.',true);await loadAvailability();}
          catch(error){setMessage(message,error.message,false);}finally{deactivate.disabled=false;}
        });
        row.append(deactivate);
      }
      container.append(row);
    });
  }catch(error){setMessage(message,error.message,false);}
}


const paymentLabels={pending:'معلق',submitted:'تم الإرسال',under_review:'قيد المراجعة',confirmed:'مؤكد',rejected:'مرفوض',refunded:'مسترد',cancelled:'ملغي'};
const paymentTransitions={pending:['submitted','cancelled'],submitted:['under_review','confirmed','rejected'],under_review:['confirmed','rejected'],confirmed:['refunded'],rejected:['submitted','cancelled'],refunded:[],cancelled:[]};
const paymentMethods={vodafone_cash:'Vodafone Cash',instapay:'InstaPay',bank_transfer:'Bank transfer',card:'Card',other:'Other'};
async function loadPayments(){
  const container=document.getElementById('adminPaymentList');
  const message=document.getElementById('adminPaymentsMessage');
  container.replaceChildren();
  try{
    const data=await api('/api/payments/admin');paymentItems=Array.isArray(data.payments)?data.payments:[];
    if(!paymentItems.length){container.append(node('p','request-meta','لا توجد سجلات مدفوعات بعد.'));setMessage(message,'تم تحميل السجلات.',true);return;}
    paymentItems.forEach(payment=>{
      const card=node('article','payment-admin-card');
      const top=node('div','payment-admin-top');
      const info=node('div','');
      info.append(node('h3','',(payment.client_name||'عميل')+' · '+(payment.reference_code||'طلب')));
      info.append(node('p','',(paymentMethods[payment.method]||payment.method)+' · '+(payment.amount==null?'المبلغ غير محدد':Number(payment.amount).toFixed(2)+' '+payment.currency)+' · '+formatDate(payment.created_at)));
      top.append(info,node('span','status-pill',paymentLabels[payment.status]||payment.status));
      card.append(top);
      card.append(node('div','payment-admin-note','مرجع التحويل: '+(payment.provider_reference||'—')+(payment.client_note?'\nملاحظة العميل: '+payment.client_note:'')));
      const transitions=paymentTransitions[payment.status]||[];
      if(transitions.length){
        const controls=node('div','payment-admin-controls');
        const label=node('label','','قرار المراجعة');
        const select=document.createElement('select');
        transitions.forEach(value=>select.add(new Option(paymentLabels[value],value)));
        label.append(select);
        const noteLabel=node('label','','ملاحظة داخلية (اختياري)');
        const note=document.createElement('input');note.maxLength=2000;note.placeholder='سبب القرار أو ملاحظة المراجعة';noteLabel.append(note);
        const save=node('button','button button-outline','حفظ القرار');save.type='button';
        save.addEventListener('click',async()=>{
          save.disabled=true;
          try{
            await api('/api/payments/admin/'+encodeURIComponent(payment.id)+'/status',{method:'PATCH',body:JSON.stringify({status:select.value,internalNote:note.value||null})});
            setMessage(message,'تم حفظ قرار المراجعة.',true);await loadPayments();
          }catch(error){setMessage(message,error.message,false);}finally{save.disabled=false;}
        });
        controls.append(label,noteLabel,save);card.append(controls);
      }
      container.append(card);
    });
    setMessage(message,'تم تحميل سجلات المدفوعات.',true);
  }catch(error){setMessage(message,error.message,false);}
}

document.getElementById('availabilityForm').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
  const payload={
    staffUserId:document.getElementById('availabilityLawyer').value,
    weekday:Number(document.getElementById('availabilityWeekday').value),
    startsLocal:document.getElementById('availabilityStart').value,
    endsLocal:document.getElementById('availabilityEnd').value,
    timezone:document.getElementById('availabilityTimezone').value
  };
  try{
    await api('/api/admin/appointments/availability',{method:'POST',body:JSON.stringify(payload)});
    setMessage(document.getElementById('availabilityMessage'),'تمت إضافة قاعدة التوافر.',true);
    await loadAvailability();
  }catch(error){setMessage(document.getElementById('availabilityMessage'),error.message,false);}
  finally{button.disabled=false;}
});

loginForm.addEventListener('submit',async(event)=>{
  event.preventDefault();const button=loginForm.querySelector('button[type="submit"]');button.disabled=true;loginMessage.textContent='جارٍ التحقق…';
  try{
    await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});
    document.getElementById('password').value='';loginMessage.textContent='';showDashboard();
    await Promise.all([loadRequests(),loadAppointments(),loadLawyers(),loadAvailability(),loadPayments()]);
  }catch(error){loginMessage.textContent=error.message;}
  finally{button.disabled=false;}
});
logoutButton.addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}requests=[];appointments=[];showLogin();loginMessage.textContent='تم تسجيل الخروج.';});
refreshButton.addEventListener('click',loadRequests);
document.getElementById('refreshAppointments').addEventListener('click',loadAppointments);
document.getElementById('refreshPayments').addEventListener('click',loadPayments);
searchInput.addEventListener('input',renderRequests);
statusFilter.addEventListener('change',renderRequests);

(async function init(){
  try{
    await api('/api/auth/me');showDashboard();
    await Promise.all([loadRequests(),loadAppointments(),loadLawyers(),loadAvailability(),loadPayments()]);
  }catch{showLogin();}
})();
