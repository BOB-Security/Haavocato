'use strict';

const action = document.body.dataset.action;
const message = document.getElementById('actionMessage');
const button = document.getElementById('actionButton');
const link = document.getElementById('actionLink');
const params = new URLSearchParams(window.location.hash.slice(1));
const token = params.get('token') || '';

async function post(url, payload) {
  const response = await fetch(url, {
    method:'POST',
    credentials:'same-origin',
    headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'This action could not be completed.');
  return data;
}

function showSuccess(text) {
  message.textContent=text;
  message.classList.add('success');
  link.classList.remove('hidden');
  button?.classList.add('hidden');
}

if(action==='verify') {
  if(!token) {
    message.textContent='The verification token is missing. Open the full link from your email or request a new one.';
    button.disabled=true;
  }
  button?.addEventListener('click',async()=>{
    button.disabled=true;message.textContent='Verifying your email…';
    try {
      const data=await post('/api/account/verify-email',{token});
      showSuccess(data.message||'Email verified.');
      history.replaceState(null,'',window.location.pathname);
    } catch(error) {
      message.textContent=error.message;
      button.disabled=false;
    }
  });
}

if(action==='reset') {
  const form=document.getElementById('resetForm');
  if(!token) {
    message.textContent='The reset token is missing. Request a new password-reset email from the client portal.';
    button.disabled=true;
  }
  form?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const password=document.getElementById('newPassword').value;
    const confirm=document.getElementById('confirmPassword').value;
    if(password!==confirm){message.textContent='The passwords do not match.';return;}
    if(!token){message.textContent='The reset link is missing or invalid.';return;}
    button.disabled=true;message.textContent='Updating your password…';
    try {
      const data=await post('/api/account/password-reset/complete',{token,password});
      showSuccess(data.message||'Password updated.');
      form.reset();
      history.replaceState(null,'',window.location.pathname);
    } catch(error) {
      message.textContent=error.message;
      button.disabled=false;
    }
  });
}
