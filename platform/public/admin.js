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



const documentScanLabels={pending:'بانتظار الفحص',clean:'اجتاز الفحص',quarantined:'معزول',failed:'فشل الفحص',not_scanned:'لم يُفحص'};
async function loadDocuments(){
  const container=document.getElementById('adminDocumentList');
  const message=document.getElementById('adminDocumentsMessage');
  container.replaceChildren();
  try{
    const data=await api('/api/documents/admin');
    const documents=Array.isArray(data.documents)?data.documents:[];
    if(!documents.length){container.append(node('p','request-meta','لا توجد مستندات مسجلة.'));setMessage(message,'تم تحميل قائمة المستندات.',true);return;}
    documents.forEach(docItem=>{
      const card=node('article','staff-document-card');
      const info=node('div','');
      info.append(node('strong','',docItem.original_filename||'مستند'));
      info.append(node('small','',(docItem.client_name||'عميل')+' · '+(docItem.reference_code||'طلب')+' · '+formatDate(docItem.created_at)+' · '+formatBytesAdmin(docItem.byte_size)));
      const actions=node('div','staff-document-actions');
      actions.append(node('span','document-status '+docItem.scan_status,documentScanLabels[docItem.scan_status]||docItem.scan_status));
      if(docItem.scan_status==='clean'){
        const download=node('button','','تنزيل الملف');download.type='button';
        download.addEventListener('click',async()=>{
          download.disabled=true;
          try{
            const response=await fetch('/api/documents/admin/'+encodeURIComponent(docItem.id)+'/download',{credentials:'same-origin'});
            if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'تعذر تنزيل المستند.');}
            const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=docItem.original_filename||'document';anchor.click();URL.revokeObjectURL(url);
          }catch(error){setMessage(message,error.message,false);}
          finally{download.disabled=false;}
        });
        actions.append(download);
      }
      card.append(info,actions);container.append(card);
    });
    setMessage(message,'تم تحميل قائمة المستندات.',true);
  }catch(error){setMessage(message,error.message,false);}
}
function formatBytesAdmin(value){
  const bytes=Number(value)||0;
  if(bytes<1024)return bytes+' B';
  if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';
  return (bytes/(1024*1024)).toFixed(1)+' MB';
}

let cmsServices=[],cmsPages=[],cmsInsights=[],cmsPartners=[];
document.querySelectorAll('[data-cms-tab]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-cms-tab]').forEach(item=>item.classList.toggle('active',item===button));
  document.querySelectorAll('[data-cms-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.cmsPanel!==button.dataset.cmsTab));
}));
function cmsMessage(text,success=false){setMessage(document.getElementById('cmsMessage'),text,success);}
function cmsItem(container,title,subtitle,onClick){
  const button=node('button','cms-item');
  button.type='button';button.append(node('span','',title),node('small','',subtitle||''));button.addEventListener('click',onClick);container.append(button);
}
async function loadCmsServices(){
  const data=await api('/api/admin/content/services');cmsServices=Array.isArray(data.services)?data.services:[];
  const select=document.getElementById('cmsServiceSelect');select.replaceChildren(new Option('اختر الخدمة للتعديل',''));
  cmsServices.forEach(item=>select.add(new Option(item.name_ar+' / '+item.name_en,item.id)));
  renderCmsServices();
}
function renderCmsServices(){
  const item=cmsServices.find(x=>x.id===document.getElementById('cmsServiceSelect').value);
  if(!item)return;
  document.getElementById('cmsServiceNameEn').value=item.name_en||'';
  document.getElementById('cmsServiceNameAr').value=item.name_ar||'';
  document.getElementById('cmsServiceSummaryEn').value=item.summary_en||'';
  document.getElementById('cmsServiceSummaryAr').value=item.summary_ar||'';
  document.getElementById('cmsServiceDescriptionEn').value=item.description_en||'';
  document.getElementById('cmsServiceDescriptionAr').value=item.description_ar||'';
  document.getElementById('cmsServiceType').value=item.delivery_type||'other';
  document.getElementById('cmsServiceOrder').value=String(item.display_order||0);
  document.getElementById('cmsServicePublished').checked=Boolean(item.is_published);
}
async function loadCmsPages(){
  const data=await api('/api/admin/content/pages');cmsPages=Array.isArray(data.pages)?data.pages:[];
  const container=document.getElementById('cmsPageList');container.replaceChildren();
  cmsPages.forEach(item=>cmsItem(container,item.title_ar+' / '+item.title_en,item.status,()=>selectCmsPage(item)));
}
function selectCmsPage(item){
  document.getElementById('cmsPageSlug').value=item.slug||'';
  document.getElementById('cmsPageTitleEn').value=item.title_en||'';
  document.getElementById('cmsPageTitleAr').value=item.title_ar||'';
  document.getElementById('cmsPageBodyEn').value=item.body_en||'';
  document.getElementById('cmsPageBodyAr').value=item.body_ar||'';
  document.getElementById('cmsPageStatus').value=item.status||'draft';
}
async function loadCmsInsights(){
  const data=await api('/api/admin/content/insights');cmsInsights=Array.isArray(data.insights)?data.insights:[];
  const container=document.getElementById('cmsInsightList');container.replaceChildren();
  cmsInsights.forEach(item=>cmsItem(container,item.title_ar+' / '+item.title_en,item.status,()=>selectCmsInsight(item)));
}
function selectCmsInsight(item){
  document.getElementById('cmsInsightSlug').value=item.slug||'';
  document.getElementById('cmsInsightTitleEn').value=item.title_en||'';
  document.getElementById('cmsInsightTitleAr').value=item.title_ar||'';
  document.getElementById('cmsInsightExcerptEn').value=item.excerpt_en||'';
  document.getElementById('cmsInsightExcerptAr').value=item.excerpt_ar||'';
  document.getElementById('cmsInsightBodyEn').value=item.body_en||'';
  document.getElementById('cmsInsightBodyAr').value=item.body_ar||'';
  document.getElementById('cmsInsightCategory').value=item.category||'';
  document.getElementById('cmsInsightStatus').value=item.status||'draft';
}
async function loadCmsPartners(){
  const data=await api('/api/admin/content/partners');cmsPartners=Array.isArray(data.partners)?data.partners:[];
  const container=document.getElementById('cmsPartnerList');container.replaceChildren();
  cmsPartners.forEach(item=>cmsItem(container,item.name_ar+' / '+item.name_en,item.is_published?'منشور':'مسودة',()=>selectCmsPartner(item)));
}
function selectCmsPartner(item){
  document.getElementById('cmsPartnerId').value=item.id||'';
  document.getElementById('cmsPartnerNameEn').value=item.name_en||'';
  document.getElementById('cmsPartnerNameAr').value=item.name_ar||'';
  document.getElementById('cmsPartnerTitleEn').value=item.title_en||'';
  document.getElementById('cmsPartnerTitleAr').value=item.title_ar||'';
  document.getElementById('cmsPartnerBioEn').value=item.bio_en||'';
  document.getElementById('cmsPartnerBioAr').value=item.bio_ar||'';
  document.getElementById('cmsPartnerOrder').value=String(item.display_order||0);
  document.getElementById('cmsPartnerPublished').checked=Boolean(item.is_published);
}
async function loadCms(){
  const loaders=[
    ['services',loadCmsServices],
    ['pages',loadCmsPages],
    ['insights',loadCmsInsights],
    ['partners',loadCmsPartners]
  ];
  const results=await Promise.allSettled(loaders.map(([,loader])=>loader()));
  const denied=results.filter(result=>result.status==='rejected');
  if(denied.length===loaders.length)cmsMessage('لا تتوفر صلاحيات إدارة المحتوى لهذا الحساب.',false);
  else if(denied.length)cmsMessage('تم تحميل الأقسام المتاحة فقط؛ تحقق من صلاحيات دورك لبقية الأقسام.',false);
  else cmsMessage('تم تحميل محتوى الموقع.',true);
}
document.getElementById('cmsServiceSelect').addEventListener('change',renderCmsServices);
document.getElementById('cmsServiceForm').addEventListener('submit',async(event)=>{
  event.preventDefault();const id=document.getElementById('cmsServiceSelect').value;
  if(!id){cmsMessage('اختر خدمة أولًا.',false);return;}
  const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
  try{
    await api('/api/admin/content/services/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({
      nameEn:document.getElementById('cmsServiceNameEn').value,nameAr:document.getElementById('cmsServiceNameAr').value,
      summaryEn:document.getElementById('cmsServiceSummaryEn').value,summaryAr:document.getElementById('cmsServiceSummaryAr').value,
      descriptionEn:document.getElementById('cmsServiceDescriptionEn').value,descriptionAr:document.getElementById('cmsServiceDescriptionAr').value,
      deliveryType:document.getElementById('cmsServiceType').value,displayOrder:Number(document.getElementById('cmsServiceOrder').value),
      isPublished:document.getElementById('cmsServicePublished').checked
    })});
    await loadCmsServices();cmsMessage('تم حفظ الخدمة.',true);
  }catch(error){cmsMessage(error.message,false);}finally{button.disabled=false;}
});
document.getElementById('cmsPageForm').addEventListener('submit',async(event)=>{
  event.preventDefault();const slug=document.getElementById('cmsPageSlug').value.trim();
  const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
  try{
    await api('/api/admin/content/pages/'+encodeURIComponent(slug),{method:'PUT',body:JSON.stringify({
      titleEn:document.getElementById('cmsPageTitleEn').value,titleAr:document.getElementById('cmsPageTitleAr').value,
      bodyEn:document.getElementById('cmsPageBodyEn').value,bodyAr:document.getElementById('cmsPageBodyAr').value,
      status:document.getElementById('cmsPageStatus').value
    })});
    await loadCmsPages();cmsMessage('تم حفظ الصفحة. ستظهر التغييرات العامة فقط إذا كانت الصفحة مرتبطة بعرض المحتوى المنشور.',true);
  }catch(error){cmsMessage(error.message,false);}finally{button.disabled=false;}
});
document.getElementById('cmsInsightForm').addEventListener('submit',async(event)=>{
  event.preventDefault();const slug=document.getElementById('cmsInsightSlug').value.trim();
  const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
  try{
    await api('/api/admin/content/insights/'+encodeURIComponent(slug),{method:'PUT',body:JSON.stringify({
      titleEn:document.getElementById('cmsInsightTitleEn').value,titleAr:document.getElementById('cmsInsightTitleAr').value,
      excerptEn:document.getElementById('cmsInsightExcerptEn').value,excerptAr:document.getElementById('cmsInsightExcerptAr').value,
      bodyEn:document.getElementById('cmsInsightBodyEn').value,bodyAr:document.getElementById('cmsInsightBodyAr').value,
      category:document.getElementById('cmsInsightCategory').value,status:document.getElementById('cmsInsightStatus').value
    })});
    await loadCmsInsights();cmsMessage('تم حفظ المقال.',true);
  }catch(error){cmsMessage(error.message,false);}finally{button.disabled=false;}
});
document.getElementById('cmsPartnerForm').addEventListener('submit',async(event)=>{
  event.preventDefault();const id=document.getElementById('cmsPartnerId').value;
  const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
  const payload={
    nameEn:document.getElementById('cmsPartnerNameEn').value,nameAr:document.getElementById('cmsPartnerNameAr').value,
    titleEn:document.getElementById('cmsPartnerTitleEn').value,titleAr:document.getElementById('cmsPartnerTitleAr').value,
    bioEn:document.getElementById('cmsPartnerBioEn').value,bioAr:document.getElementById('cmsPartnerBioAr').value,
    displayOrder:Number(document.getElementById('cmsPartnerOrder').value),isPublished:document.getElementById('cmsPartnerPublished').checked
  };
  try{
    await api(id?'/api/admin/content/partners/'+encodeURIComponent(id):'/api/admin/content/partners',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
    await loadCmsPartners();cmsMessage('تم حفظ ملف الشريك.',true);
  }catch(error){cmsMessage(error.message,false);}finally{button.disabled=false;}
});
document.getElementById('cmsPartnerNew').addEventListener('click',()=>{document.getElementById('cmsPartnerForm').reset();document.getElementById('cmsPartnerId').value='';});
document.getElementById('refreshCms').addEventListener('click',loadCms);

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
    await Promise.all([loadRequests(),loadAppointments(),loadLawyers(),loadAvailability(),loadPayments(),loadDocuments(),loadCms()]);
  }catch(error){loginMessage.textContent=error.message;}
  finally{button.disabled=false;}
});
logoutButton.addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}requests=[];appointments=[];showLogin();loginMessage.textContent='تم تسجيل الخروج.';});
refreshButton.addEventListener('click',loadRequests);
document.getElementById('refreshAppointments').addEventListener('click',loadAppointments);
document.getElementById('refreshPayments').addEventListener('click',loadPayments);
document.getElementById('refreshDocuments').addEventListener('click',loadDocuments);
searchInput.addEventListener('input',renderRequests);
statusFilter.addEventListener('change',renderRequests);

(async function init(){
  try{
    await api('/api/auth/me');showDashboard();
    await Promise.all([loadRequests(),loadAppointments(),loadLawyers(),loadAvailability(),loadPayments(),loadCms()]);
  }catch{showLogin();}
})();
