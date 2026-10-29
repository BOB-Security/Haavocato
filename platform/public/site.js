'use strict';

const translations = {
  en: {
    navServices:'Services',navAbout:'About us',navInsights:'Legal insights',navContact:'Contact',
    book:'Book a consultation',eyebrow:'LEGAL CONSULTANCY · EGYPT & BEYOND',
    heroTitle:'Legal clarity.<br><em>Confident next steps.</em>',
    heroLead:'Thoughtful legal guidance for individuals and businesses, delivered with professionalism, transparency, and care.',
    startRequest:'Start a request',exploreServices:'Explore our services',proof:'A clear process, from first contact to next steps.',
    artNoteTop:'Professional counsel',artNoteBottom:'Structured. Transparent. Confidential.',
    trustOne:'Professional standards',trustTwo:'Transparent communication',trustThree:'Practical legal solutions',trustFour:'Confidentiality by design',
    servicesEyebrow:'WHAT WE DO',servicesTitle:'Legal support for the<br><em>decisions that matter.</em>',
    servicesLead:'Choose a service to begin. Our team reviews each request and follows up on the appropriate next step.',
    serviceNote:'Services are subject to review, scope confirmation, and engagement terms. General website content is not individual legal advice.',
    aboutEyebrow:'OUR APPROACH',aboutTitle:'Law with clarity.<br><em>Service with purpose.</em>',
    aboutLead:'We aim to make access to legal support more organized and understandable, with clear requests, responsible communication, and practical next steps.',
    valueOne:'Professionalism and responsibility',valueTwo:'Transparency and trust',valueThree:'Innovation and partnership',
    insightsEyebrow:'LEGAL INSIGHTS',insightsTitle:'Understand the landscape.',
    insightsLead:'Practical legal knowledge and updates will be published here as our verified editorial library launches.',
    insightComing:'Our legal insights library is being prepared.',
    insightComingLead:'For a matter specific to you, send a consultation request rather than relying on general information.',
    requestEyebrow:'YOUR NEXT STEP',requestTitle:'Tell us what<br><em>you need help with.</em>',
    requestLead:'Share the basic details. We will provide a reference number after your request is received.',
    privacyNote:'Do not include highly sensitive facts or upload confidential documents through this public form. Secure document exchange can be arranged after initial review.',
    formTitle:'Consultation request',requiredFields:'All fields required',fullName:'Full name',email:'Email address',phone:'Phone number',
    serviceType:'Service type',chooseService:'Choose a service',requestDetails:'How can we help?',submitRequest:'Submit request',
    footerTitle:'Professional. Responsible. Confidential.',
    footerNote:'Official contact details and partner profiles will be published once verified by the firm.',
    staffAccess:'Staff access ↗',
    footerLegal:'General information only. No attorney-client relationship is created by submitting a request.',
    loading:'Loading services',serviceUnavailable:'The service catalogue is temporarily unavailable.',
    submitError:'We could not submit your request. Please try again later.',
    requestReceived:'Your request has been received. Save this reference number:',
    missingServices:'No services are currently published. Please contact the firm through its verified channels.',
    serviceFallback:'Legal service',requiredError:'Please complete all required fields.'
  },
  ar: {
    navServices:'الخدمات',navAbout:'من نحن',navInsights:'رؤى قانونية',navContact:'تواصل معنا',
    book:'احجز استشارة',eyebrow:'استشارات قانونية · مصر وخارجها',
    heroTitle:'وضوح قانوني.<br><em>خطوات واثقة.</em>',
    heroLead:'إرشاد قانوني مدروس للأفراد والشركات، بمهنية وشفافية واهتمام.',
    startRequest:'ابدأ طلبًا',exploreServices:'استكشف خدماتنا',proof:'خطوات واضحة من أول تواصل وحتى تحديد الخطوة التالية.',
    artNoteTop:'استشارات مهنية',artNoteBottom:'منظم. شفاف. سري.',
    trustOne:'معايير مهنية',trustTwo:'تواصل شفاف',trustThree:'حلول قانونية عملية',trustFour:'السرية في صميم العمل',
    servicesEyebrow:'ماذا نقدم',servicesTitle:'دعم قانوني<br><em>للقرارات المهمة.</em>',
    servicesLead:'اختر الخدمة لبدء الطلب. يراجع فريقنا كل طلب ويحدد الخطوة المناسبة.',
    serviceNote:'تخضع الخدمات للمراجعة وتحديد نطاق العمل وشروط التعاقد. محتوى الموقع معلومات عامة وليس استشارة قانونية خاصة.',
    aboutEyebrow:'نهجنا',aboutTitle:'قانون بوضوح.<br><em>وخدمة بهدف.</em>',
    aboutLead:'نسعى إلى تنظيم الوصول للدعم القانوني من خلال طلبات واضحة وتواصل مسؤول وخطوات عملية تالية.',
    valueOne:'المهنية والمسؤولية',valueTwo:'الشفافية والثقة',valueThree:'الابتكار والشراكة',
    insightsEyebrow:'رؤى قانونية',insightsTitle:'افهم المشهد القانوني.',
    insightsLead:'سيتم نشر المعرفة القانونية العملية والتحديثات بعد تجهيز مكتبة المحتوى ومراجعتها.',
    insightComing:'نعمل على تجهيز مكتبة الرؤى القانونية.',
    insightComingLead:'للحصول على مساعدة بشأن مسألة تخصك، أرسل طلب استشارة بدلًا من الاعتماد على المعلومات العامة.',
    requestEyebrow:'خطوتك التالية',requestTitle:'أخبرنا كيف<br><em>يمكننا مساعدتك.</em>',
    requestLead:'شاركنا البيانات الأساسية. سنمنحك رقمًا مرجعيًا بعد استلام الطلب.',
    privacyNote:'لا تذكر تفاصيل شديدة الحساسية ولا ترفع مستندات سرية من خلال هذا النموذج العام. يمكن ترتيب تبادل آمن للمستندات بعد المراجعة الأولية.',
    formTitle:'طلب استشارة',requiredFields:'جميع الحقول مطلوبة',fullName:'الاسم بالكامل',email:'البريد الإلكتروني',phone:'رقم الهاتف',
    serviceType:'نوع الخدمة',chooseService:'اختر الخدمة',requestDetails:'كيف يمكننا مساعدتك؟',submitRequest:'إرسال الطلب',
    footerTitle:'مهنية. مسؤولية. سرية.',
    footerNote:'سيتم نشر بيانات التواصل الرسمية وملفات الشركاء بعد التحقق منها.',
    staffAccess:'دخول الموظفين ↗',
    footerLegal:'معلومات عامة فقط. إرسال الطلب لا ينشئ علاقة محامٍ وموكل.',
    loading:'جارٍ تحميل الخدمات',serviceUnavailable:'قائمة الخدمات غير متاحة مؤقتًا.',
    submitError:'تعذر إرسال طلبك. حاول مرة أخرى لاحقًا.',
    requestReceived:'تم استلام طلبك. احتفظ بهذا الرقم المرجعي:',
    missingServices:'لا توجد خدمات منشورة حاليًا. يرجى التواصل عبر القنوات الرسمية بعد التحقق منها.',
    serviceFallback:'خدمة قانونية',requiredError:'يرجى استكمال جميع الحقول المطلوبة.'
  }
};

let language = 'en';
let services = [];
const form = document.getElementById('consultationForm');
const serviceSelect = document.getElementById('serviceId');
const formMessage = document.getElementById('formMessage');
const referenceResult = document.getElementById('referenceResult');
const submitButton = document.getElementById('submitRequest');

function applyLanguage(next) {
  language = next === 'ar' ? 'ar' : 'en';
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('languageToggle').textContent = language === 'ar' ? 'English' : 'العربية';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (translations[language][key]) element.innerHTML = translations[language][key];
  });
  renderServices();
}

function renderServices() {
  const copy = translations[language];
  const grid = document.getElementById('serviceGrid');
  grid.replaceChildren();
  serviceSelect.replaceChildren(new Option(copy.chooseService, ''));
  if (!services.length) {
    const message = document.createElement('p');
    message.className = 'service-note';
    message.textContent = copy.missingServices;
    grid.append(message);
    return;
  }
  services.forEach((service, index) => {
    const card = document.createElement('article');
    card.className = 'service-card';
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const heading = document.createElement('h3');
    heading.textContent = service.name || copy.serviceFallback;
    const paragraph = document.createElement('p');
    paragraph.textContent = service.summary || '';
    card.append(number, heading, paragraph);
    grid.append(card);
    serviceSelect.add(new Option(service.name || copy.serviceFallback, service.id));
  });
}

async function loadServices() {
  try {
    const response = await fetch('/api/services?lang=' + language, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('catalogue unavailable');
    const data = await response.json();
    services = Array.isArray(data.services) ? data.services : [];
    renderServices();
  } catch {
    services = [];
    renderServices();
    formMessage.textContent = translations[language].serviceUnavailable;
  }
}

document.getElementById('languageToggle').addEventListener('click', async () => {
  applyLanguage(language === 'en' ? 'ar' : 'en');
  await loadServices();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';
  formMessage.classList.remove('success');
  referenceResult.hidden = true;
  if (!form.reportValidity()) {
    formMessage.textContent = translations[language].requiredError;
    return;
  }
  submitButton.disabled = true;
  const payload = {
    requesterName: document.getElementById('requesterName').value,
    requesterEmail: document.getElementById('requesterEmail').value,
    requesterPhone: document.getElementById('requesterPhone').value,
    serviceId: serviceSelect.value,
    description: document.getElementById('description').value,
    preferredLanguage: language
  };
  try {
    const response = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || translations[language].submitError);
    formMessage.textContent = data.message || translations[language].requestReceived;
    formMessage.classList.add('success');
    referenceResult.replaceChildren();
    const label = document.createElement('span');
    label.textContent = translations[language].requestReceived;
    const reference = document.createElement('strong');
    reference.textContent = data.referenceCode || '—';
    referenceResult.append(label, reference);
    referenceResult.hidden = false;
    form.reset();
  } catch (error) {
    formMessage.textContent = error.message || translations[language].submitError;
  } finally {
    submitButton.disabled = false;
  }
});

applyLanguage('en');
loadServices();
