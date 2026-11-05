(() => {
  const { protocol, hostname } = window.location;
  if (protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.append(script);
})();
