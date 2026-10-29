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
let requestItems = [];

const statuses = {
  new:'New',triage:'Initial review',awaiting_client:'Awaiting your response',assigned:'Assigned',
  in_progress:'In progress',awaiting_payment:'Awaiting payment',scheduled:'Scheduled',
  completed:'Completed',declined:'Declined',cancelled:'Cancelled',archived:'Archived'
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
}
async function loadRequests(){
  listMessage.textContent='Loading your requests…';requestList.replaceChildren();
  try{
    const data=await api('/api/client/requests');
    requestItems=Array.isArray(data.requests)?data.requests:[];
    document.getElementById('requestCount').textContent=String(requestItems.length);
    empty.classList.toggle('hidden',requestItems.length>0);
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
      const date=item.submitted_at?new Date(item.submitted_at).toLocaleString():'';
      meta.textContent='Submitted '+date;
      card.append(head,meta);requestList.append(card);
    });
    listMessage.textContent=requestItems.length?'Your requests are up to date.':'';
    listMessage.classList.add('success');
  }catch(error){
    listMessage.textContent=error.message;
    listMessage.classList.remove('success');
    if(/Authentication required/i.test(error.message))showLogin();
  }
}
function showLogin(){dashboard.classList.add('hidden');authSection.classList.remove('hidden');logout.hidden=true;}
document.getElementById('refreshPortal').addEventListener('click',loadRequests);
logout.addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}requestItems=[];showLogin();setMessage('You have signed out.',true);});
(async()=>{try{await api('/api/auth/me');await showPortal();}catch{showLogin();}})();
