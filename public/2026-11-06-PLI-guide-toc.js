(() => {
  const items = [...document.querySelectorAll('.guide-toc a[href^="#"]')]
    .map(link => ({link, section: document.getElementById(link.hash.slice(1))}))
    .filter(item => item.section);
  if (!items.length) return;

  let active;
  let framePending = false;
  function update() {
    framePending = false;
    const readingLine = Math.min(120, window.innerHeight * 0.2);
    const viewport = document.documentElement;
    const atBottom = window.scrollY > 0 &&
      window.scrollY + window.innerHeight >= viewport.scrollHeight - 2;
    const current = atBottom ? items.at(-1) :
      items.findLast(({section}) => section.getBoundingClientRect().top <= readingLine) || items[0];
    if (active === current) return;
    active?.link.removeAttribute('aria-current');
    current.link.setAttribute('aria-current', 'location');
    active = current;
  }

  function scheduleUpdate() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll', scheduleUpdate, {passive: true});
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('hashchange', scheduleUpdate);
  window.addEventListener('pageshow', scheduleUpdate);
  scheduleUpdate();
})();
