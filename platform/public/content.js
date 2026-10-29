'use strict';

let language='en';
const button=document.getElementById('languageToggle');
function applyLanguage(next){
  language=next==='ar'?'ar':'en';
  document.documentElement.lang=language;
  document.documentElement.dir=language==='ar'?'rtl':'ltr';
  if(button)button.textContent=language==='ar'?'English':'العربية';
  document.querySelectorAll('[data-en][data-ar]').forEach(element=>{
    element.innerHTML=element.getAttribute(language==='ar'?'data-ar':'data-en');
  });
  if(document.getElementById('servicePageGrid'))loadServicePage();
}
async function loadServicePage(){
  const grid=document.getElementById('servicePageGrid');
  if(!grid)return;
  grid.replaceChildren();
  try{
    const response=await fetch('/api/services?lang='+language,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Service catalogue unavailable');
    const data=await response.json();
    const services=Array.isArray(data.services)?data.services:[];
    if(!services.length){grid.append(makeNode('p','service-note',language==='ar'?'لا توجد خدمات منشورة حاليًا.':'No services are currently published.'));return;}
    services.forEach((service,index)=>{
      const card=makeNode('article','service-card');
      card.append(makeNode('span','',String(index+1).padStart(2,'0')));
      card.append(makeNode('h3','',service.name||''));
      card.append(makeNode('p','',service.summary||''));
      grid.append(card);
    });
  }catch{
    grid.append(makeNode('p','service-note',language==='ar'?'تعذر تحميل الخدمات حاليًا.':'Services could not be loaded right now.'));
  }
}
function makeNode(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
button?.addEventListener('click',()=>applyLanguage(language==='en'?'ar':'en'));
applyLanguage('en');
