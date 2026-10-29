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
  if(document.getElementById('partnerPlaceholder'))loadPartners();
  if(document.getElementById('insightEmpty'))loadInsights();
  if(document.getElementById('articleRoot'))loadArticle();
  if(document.querySelector('[data-cms-page]'))loadCmsPage();
}
async function getJson(url){
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Content is unavailable.');
  return data;
}
async function loadServicePage(){
  const grid=document.getElementById('servicePageGrid');if(!grid)return;
  grid.replaceChildren();
  try{
    const data=await getJson('/api/services?lang='+language);
    const services=Array.isArray(data.services)?data.services:[];
    if(!services.length){grid.append(makeNode('p','service-note',language==='ar'?'لا توجد خدمات منشورة حاليًا.':'No services are currently published.'));return;}
    services.forEach((service,index)=>{
      const card=makeNode('article','service-card');
      card.append(makeNode('span','',String(index+1).padStart(2,'0')),makeNode('h3','',service.name||''),makeNode('p','',service.summary||''));
      grid.append(card);
    });
  }catch{grid.append(makeNode('p','service-note',language==='ar'?'تعذر تحميل الخدمات حاليًا.':'Services could not be loaded right now.'));}
}
async function loadPartners(){
  const container=document.getElementById('partnerPlaceholder');if(!container)return;
  try{
    const data=await getJson('/api/content/partners?lang='+language);
    const partners=Array.isArray(data.partners)?data.partners:[];
    if(!partners.length)return;
    container.replaceChildren();container.className='partner-grid';
    partners.forEach((partner,index)=>{
      const card=makeNode('article','partner-card');
      card.append(makeNode('span','partner-index',String(index+1).padStart(2,'0')));
      card.append(makeNode('h2','',partner.name||''));
      if(partner.title)card.append(makeNode('p','partner-title',partner.title));
      card.append(makeNode('p','',partner.bio||''));
      container.append(card);
    });
  }catch{/* Keep the approved static empty state if the CMS is unavailable. */}
}
async function loadInsights(){
  const container=document.getElementById('insightEmpty');if(!container)return;
  try{
    const data=await getJson('/api/content/insights?lang='+language);
    const insights=Array.isArray(data.insights)?data.insights:[];
    if(!insights.length)return;
    container.replaceChildren();container.className='insight-list';
    insights.forEach((article,index)=>{
      const card=makeNode('article','insight-card');
      card.append(makeNode('span','insight-index',String(index+1).padStart(2,'0')));
      if(article.category)card.append(makeNode('p','eyebrow',article.category));
      card.append(makeNode('h2','',article.title||''));
      card.append(makeNode('p','',article.excerpt||''));
      const link=makeNode('a','text-link',language==='ar'?'اقرأ المقال ←':'Read article →');
      link.href='/insights/'+encodeURIComponent(article.slug);
      card.append(link);container.append(card);
    });
  }catch{/* Keep the approved static empty state if the CMS is unavailable. */}
}
async function loadArticle(){
  const root=document.getElementById('articleRoot');if(!root)return;
  const slug=decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop()||'');
  if(!slug||slug==='insights')return;
  try{
    const data=await getJson('/api/content/insights/'+encodeURIComponent(slug)+'?lang='+language);
    const article=data.article;
    root.querySelector('h1').textContent=article.title||'';
    root.querySelector('.article-meta').textContent=[article.category,article.publishedAt?new Date(article.publishedAt).toLocaleDateString():''].filter(Boolean).join(' · ');
    root.querySelector('.article-body').textContent=article.body||'';
    document.title=(article.title||'Legal insight')+' | HA Advocates';
  }catch(error){
    root.querySelector('h1').textContent=language==='ar'?'المقال غير متاح':'Article unavailable';
    root.querySelector('.article-body').textContent=error.message;
  }
}
async function loadCmsPage(){
  const section=document.querySelector('[data-cms-page]');if(!section)return;
  const slug=section.dataset.cmsPage;
  try{
    const data=await getJson('/api/content/pages/'+encodeURIComponent(slug)+'?lang='+language);
    const title=section.querySelector('[data-cms-title]');
    const body=section.querySelector('[data-cms-body]');
    if(title)title.textContent=data.page.title||'';
    if(body)body.textContent=data.page.body||'';
    section.classList.remove('hidden');
  }catch{section.classList.add('hidden');}
}
function makeNode(tag,className,text){
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
}
button?.addEventListener('click',()=>applyLanguage(language==='en'?'ar':'en'));
applyLanguage('en');
