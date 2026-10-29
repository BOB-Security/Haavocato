'use strict';

const authSection = document.getElementById('portalAuth');
const dashboard = document.getElementById('portalDashboard');
const loginForm = document.getElementById('portalLogin');
const registerForm = document.getElementById('portalRegister');
const message = document.getElementById('portalAuthMessage');
const logout = document.getElementById('portalLogout');
const requestList = document.getElementById('portalRequestList');
const empty = document.getElementById('portalEmpty');
const listMessage = document.getElementById('portalListMessage');
const appointmentMessage = document.getElementById('appointmentMessage');
const appointmentSlot = document.getElementById('appointmentSlot');
const appointmentRequest = document.getElementById('appointmentRequest');
let requestItems = [];
let appointmentItems = [];
let availableSlots = [];

const statuses = {
  new:'New',triage:'Initial review',awaiting_client:'Awaiting your response',assigned:'Assigned',
  in_progress:'In progress',awaiting_payment:'Awaiting payment',scheduled:'Scheduled',
  completed:'Completed',declined:'Declined',cancelled:'Cancelled',archived:'Archived'
};
const appointmentStatuses = {
  requested:'Awaiting confirmation',confirmed:'Confirmed',rescheduled:'Rescheduled',
  completed:'Completed',cancelled:'Cancelled',no_show:'No-show'
};

async function api(url,options={}) {
  const response = await fetch(url,{credentials:'same-origin',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||'The request could not be completed.');
  return data;
}
function setMessage(text,success=false){message.textContent=text;message.classList.toggle('success',success);}
function switchMode(mode){
  const login=mode==='login';
  loginForm.classList.toggle('hidden',!login);
  registerForm.classList.toggle('hidden',login);
  document.getElementById('showLogin').classList.toggle('active',login);
  document.getElementById('showRegister').classList.toggle('active',!login);
  message.textContent='';
}
document.getElementById('showLogin').addEventListener('click',()=>switchMode('login'));
document.getElementById('showRegister').addEventListener('click',()=>switchMode('register'));

loginForm.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const button=loginForm.querySelector('button[type=submit]');button.disabled=true;setMessage('Signing in…');
  try{
    await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:document.getElementById('loginEmail').value,password:document.getElementById('loginPassword').value})});
    document.getElementById('loginPassword').value='';
    await showPortal();
  }catch(error){setMessage(error.message);}finally{button.disabled=false;}
});

registerForm.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const button=registerForm.querySelector('button[type=submit]');button.disabled=true;setMessage('Creating your account…');
  try{
    const data=await api('/api/account/register',{method:'POST',body:JSON.stringify({
      fullName:document.getElementById('registerName').value,
      email:document.getElementById('registerEmail').value,
      phone:document.getElementById('registerPhone').value,
      password:document.getElementById('registerPassword').value,
      language:document.documentElement.lang==='ar'?'ar':'en'
    })});
    registerForm.reset();
    setMessage(data.message||'Check your email for the verification link.',true);
  }catch(error){setMessage(error.message);}finally{button.disabled=false;}
});

document.getElementById('resendVerification').addEventListener('click',async()=>{
  const email=document.getElementById('registerEmail').value.trim();
  if(!email){setMessage('Enter the email address you used to register.');return;}
  try{
    const data=await api('/api/account/verification/resend',{method:'POST',body:JSON.stringify({email})});
    setMessage(data.message||'If the account can be verified, instructions will be sent to its email address.',true);
  }catch{setMessage('If the account can be verified, instructions will be sent to its email address.',true);}
});

document.getElementById('forgotPassword').addEventListener('click',async()=>{
  const email=document.getElementById('loginEmail').value.trim();
  if(!email){setMessage('Enter your email address first.');return;}
  try{
    const data=await api('/api/account/password-reset/request',{method:'POST',body:JSON.stringify({email})});
    setMessage(data.message||'If an active account matches that email, instructions will be sent.',true);
  }catch{setMessage('If an active account matches that email, instructions will be sent.',true);}
});

async function showPortal(){
  const data=await api('/api/auth/me');
  authSection.classList.add('hidden');dashboard.classList.remove('hidden');logout.hidden=false;
  document.getElementById('welcomeTitle').textContent=data.user.full_name?'Welcome, '+data.user.full_name:'Your client portal';
  document.getElementById('accountEmail').textContent=data.user.email;
  await loadRequests();
  await Promise.all([loadAppointments(),loadAvailability(),loadPayments()]);
}
async function loadRequests(){
  listMessage.textContent='Loading your requests…';requestList.replaceChildren();
  try{
    const data=await api('/api/client/requests');
    requestItems=Array.isArray(data.requests)?data.requests:[];
    document.getElementById('requestCount').textContent=String(requestItems.length);
    empty.classList.toggle('hidden',requestItems.length>0);
    appointmentRequest.replaceChildren(new Option('No linked request',''));
    document.getElementById('paymentRequest').replaceChildren(new Option('Choose a request',''));
    requestItems.forEach(item=>{
      const card=document.createElement('article');card.className='portal-request-card';
      const head=document.createElement('div');head.className='portal-request-head';
      const left=document.createElement('div');
      const title=document.createElement('h3');title.textContent=item.service_name_snapshot||'Legal service';
      const ref=document.createElement('span');ref.className='portal-reference';ref.textContent=item.reference_code;
      left.append(title,ref);
      const pill=document.createElement('span');pill.className='portal-status status-'+(Object.hasOwn(statuses,item.status)?item.status:'new');pill.textContent=statuses[item.status]||item.status;
      head.append(left,pill);
      const meta=document.createElement('div');meta.className='portal-request-meta';
      meta.textContent='Submitted '+formatDate(item.submitted_at);
      const detailButton=node('button','inline-action','View status timeline');detailButton.type='button';
      const detailPanel=node('div','request-timeline hidden');
      detailButton.addEventListener('click',async()=>{
        const opening=detailPanel.classList.contains('hidden');
        detailPanel.classList.toggle('hidden',!opening);
        if(!opening||detailPanel.dataset.loaded==='true')return;
        detailPanel.append(node('p','muted','Loading timeline…'));
        try{
          const detail=await api('/api/client/requests/'+encodeURIComponent(item.reference_code));
          detailPanel.replaceChildren();
          detailPanel.append(node('p','',detail.request.description||'No description.'));
          const timeline=Array.isArray(detail.timeline)?detail.timeline:[];
          if(!timeline.length)detailPanel.append(node('p','muted','No status updates have been published yet.'));
          timeline.forEach(event=>{
            const row=node('div','timeline-event');
            row.append(node('span','timeline-dot',''),node('div','',event.public_message||statuses[event.to_status]||event.to_status),node('small','',formatDate(event.created_at)));
            detailPanel.append(row);
          });
          detailPanel.dataset.loaded='true';
          detailButton.textContent='Hide timeline';
        }catch(error){detailPanel.replaceChildren(node('p','portal-message',error.message));}
      });
      card.append(head,meta,detailButton,detailPanel);requestList.append(card);
      appointmentRequest.add(new Option(item.reference_code+' — '+item.service_name_snapshot,item.id));
      document.getElementById('paymentRequest').add(new Option(item.reference_code+' — '+item.service_name_snapshot,item.id));
    });
    listMessage.textContent=requestItems.length?'Your requests are up to date.':'';
    listMessage.classList.add('success');
  }catch(error){
    listMessage.textContent=error.message;
    listMessage.classList.remove('success');
    if(/Authentication required/i.test(error.message))showLogin();
  }
}
function localDate(date){
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
async function loadAvailability(){
  appointmentSlot.replaceChildren(new Option('Loading available times…',''));
  const from=new Date();const to=new Date();to.setDate(to.getDate()+14);
  try{
    const data=await api('/api/appointments/availability?from='+localDate(from)+'&to='+localDate(to));
    availableSlots=Array.isArray(data.slots)?data.slots:[];
    appointmentSlot.replaceChildren(new Option(availableSlots.length?'Choose a date and time':'No times currently available',''));
    availableSlots.forEach((slot,index)=>{
      const date=new Date(slot.starts_at);
      const display=date.toLocaleString(undefined,{timeZone:slot.timezone||'Africa/Cairo',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      appointmentSlot.add(new Option(display+' · '+(slot.display_name||'Legal team'),String(index)));
    });
  }catch(error){
    availableSlots=[];
    appointmentSlot.replaceChildren(new Option('Availability unavailable',''));
    appointmentMessage.textContent=error.message;
  }
}
async function loadAppointments(){
  const container=document.getElementById('appointmentList');
  container.replaceChildren();
  try{
    const data=await api('/api/appointments/mine');
    appointmentItems=Array.isArray(data.appointments)?data.appointments:[];
    if(!appointmentItems.length){container.append(node('p','muted','No appointments have been requested yet.'));return;}
    appointmentItems.forEach(item=>{
      const card=node('article','appointment-card');
      const left=node('div','');
      left.append(node('h3','',formatDate(item.starts_at)),node('p','',(item.consultation_mode==='video'?'Online video':item.consultation_mode==='phone'?'Phone call':'In person')+' · '+(item.lawyer_name||'Legal team')+' · '+(item.reference_code||'No linked request')));
      const right=node('div','');
      const pill=node('span','portal-status','');
      pill.textContent=appointmentStatuses[item.status]||item.status;
      right.append(pill);
      if(['requested','confirmed','rescheduled'].includes(item.status)){
        const cancel=node('button','inline-action','Cancel request');
        cancel.type='button';
        cancel.addEventListener('click',async()=>{
          cancel.disabled=true;
          try{
            await api('/api/appointments/'+encodeURIComponent(item.id)+'/cancel',{method:'POST',body:'{}'});
            appointmentMessage.textContent='Appointment cancelled.';
            appointmentMessage.classList.add('success');
            await Promise.all([loadAppointments(),loadAvailability()]);
          }catch(error){appointmentMessage.textContent=error.message;appointmentMessage.classList.remove('success');cancel.disabled=false;}
        });
        right.append(cancel);
      }
      card.append(left,right);container.append(card);
    });
  }catch(error){
    container.append(node('p','portal-message',error.message));
  }
}
function node(tag,className,text){
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
}
function formatDate(value){
  if(!value)return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':date.toLocaleString();
}

document.getElementById('appointmentForm').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const selectedIndex=appointmentSlot.value;
  const selected=selectedIndex===''?null:availableSlots[Number(selectedIndex)];
  if(!selected){appointmentMessage.textContent='Choose an available slot first.';return;}
  const button=document.getElementById('bookAppointment');button.disabled=true;appointmentMessage.textContent='Submitting appointment request…';appointmentMessage.classList.remove('success');
  try{
    const data=await api('/api/appointments',{method:'POST',body:JSON.stringify({
      lawyerId:selected.staff_user_id,
      startsAt:selected.starts_at,
      mode:document.getElementById('appointmentMode').value,
      requestId:appointmentRequest.value||null
    })});
    appointmentMessage.textContent=data.message||'Appointment request submitted.';
    appointmentMessage.classList.add('success');
    await Promise.all([loadAppointments(),loadAvailability()]);
  }catch(error){appointmentMessage.textContent=error.message;appointmentMessage.classList.remove('success');}
  finally{button.disabled=false;}
});


const paymentLabels={pending:'Pending',submitted:'Submitted',under_review:'Under review',confirmed:'Confirmed',rejected:'Rejected',refunded:'Refunded',cancelled:'Cancelled'};
const paymentMethods={vodafone_cash:'Vodafone Cash',instapay:'InstaPay',bank_transfer:'Bank transfer'};
async function loadPayments(){
  const container=document.getElementById('paymentList');
  const status=document.getElementById('paymentMessage');
  container.replaceChildren();
  try{
    const data=await api('/api/payments/mine');
    const payments=Array.isArray(data.payments)?data.payments:[];
    if(!payments.length){container.append(node('p','muted','No payment records have been submitted yet.'));return;}
    payments.forEach(payment=>{
      const card=node('article','payment-record');
      const info=node('div','');
      info.append(node('strong','',(paymentMethods[payment.method]||payment.method)+' · '+(payment.reference_code||'Request')));
      info.append(node('small','',(payment.amount==null?'Amount not specified':Number(payment.amount).toFixed(2)+' '+payment.currency)+' · Ref: '+payment.provider_reference+' · '+formatDate(payment.created_at)));
      const pill=node('span','payment-status '+payment.status,paymentLabels[payment.status]||payment.status);
      card.append(info,pill);container.append(card);
    });
  }catch(error){status.textContent=error.message;status.classList.remove('success');}
}
document.getElementById('paymentForm').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const button=document.getElementById('submitPayment');button.disabled=true;
  const status=document.getElementById('paymentMessage');status.textContent='Submitting payment record…';status.classList.remove('success');
  const amount=document.getElementById('paymentAmount').value;
  try{
    const data=await api('/api/payments',{method:'POST',body:JSON.stringify({
      requestId:document.getElementById('paymentRequest').value,
      method:document.getElementById('paymentMethod').value,
      amount:amount||null,
      providerReference:document.getElementById('paymentReference').value,
      clientNote:document.getElementById('paymentNote').value||null
    })});
    status.textContent=data.message||'Payment record submitted for review.';status.classList.add('success');
    document.getElementById('paymentReference').value='';document.getElementById('paymentAmount').value='';document.getElementById('paymentNote').value='';
    await loadPayments();
  }catch(error){status.textContent=error.message;status.classList.remove('success');}
  finally{button.disabled=false;}
});

function showLogin(){dashboard.classList.add('hidden');authSection.classList.remove('hidden');logout.hidden=true;}
document.getElementById('refreshPortal').addEventListener('click',async()=>{await loadRequests();await Promise.all([loadAppointments(),loadAvailability(),loadPayments()]);});
logout.addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}requestItems=[];showLogin();setMessage('You have signed out.',true);});
(async()=>{try{await api('/api/auth/me');await showPortal();}catch{showLogin();}})();
