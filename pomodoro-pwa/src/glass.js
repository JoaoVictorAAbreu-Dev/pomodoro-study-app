// Decorative behavior is optional; all controls work without it.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let scrollQueued = false;
function reflectScroll() {
  const scrolled = window.scrollY > 24;
  document.querySelector('.sidebar').classList.toggle('is-scrolled', scrolled);
  document.querySelector('.main-nav').classList.toggle('is-scrolled', scrolled);
  scrollQueued = false;
}
window.addEventListener('scroll', () => {
  if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(reflectScroll); }
}, { passive: true });
reflectScroll();
for (const button of document.querySelectorAll('.primary-button')) {
  let queued = false;
  let pointer;
  button.addEventListener('pointermove', event => {
    if (reducedMotion.matches || event.pointerType !== 'mouse') return;
    pointer = { x: event.clientX, y: event.clientY };
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      const bounds = button.getBoundingClientRect();
      button.style.setProperty('--shine-x', `${pointer.x - bounds.left - 55}px`);
      button.style.setProperty('--shine-y', `${pointer.y - bounds.top - 55}px`);
      queued = false;
    });
  }, { passive: true });
}
