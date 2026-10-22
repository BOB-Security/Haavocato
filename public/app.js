'use strict';

const languageToggle = document.getElementById('languageToggle');
const consultationForm = document.getElementById('consultationForm');
const formMessage = document.getElementById('formMessage');
let language = 'ar';

function setLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-ar][data-en]').forEach((element) => {
    if (element.tagName === 'OPTION' && !element.value) {
      element.textContent = element.dataset[language];
    } else {
      element.textContent = element.dataset[language];
    }
  });
  languageToggle.textContent = language === 'ar' ? 'English' : 'العربية';
  languageToggle.setAttribute('aria-label', language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
  document.title = language === 'ar'
    ? 'Haavocato | خدمات قانونية واستشارات'
    : 'Haavocato | Legal Services and Consultations';
}

languageToggle.addEventListener('click', () => setLanguage(language === 'ar' ? 'en' : 'ar'));

consultationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = language === 'ar' ? 'جارٍ إرسال الطلب…' : 'Submitting your request…';
  const data = Object.fromEntries(new FormData(consultationForm).entries());

  try {
    const response = await fetch('/api/consultations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    formMessage.textContent = language === 'ar'
      ? `تم استلام طلبك. رقم المتابعة: ${result.reference}`
      : `Request received. Reference: ${result.reference}`;
    consultationForm.reset();
  } catch (error) {
    formMessage.textContent = error.message || (language === 'ar'
      ? 'تعذر إرسال الطلب. حاول لاحقًا.'
      : 'Unable to submit right now. Please try again later.');
  }
});