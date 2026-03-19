// ══════════════════════════════════════
//  CURSEUR PERSONNALISÉ
// ══════════════════════════════════════
const cursor  = document.getElementById('cursor');
const ring    = document.getElementById('cursor-ring');
let mx = 0, my = 0, rx = 0, ry = 0;

document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

(function animateCursor() {
  cursor.style.left = mx + 'px';
  cursor.style.top  = my + 'px';
  rx += (mx - rx) * 0.12;
  ry += (my - ry) * 0.12;
  ring.style.left = rx + 'px';
  ring.style.top  = ry + 'px';
  requestAnimationFrame(animateCursor);
})();

// ══════════════════════════════════════
//  NAVBAR — EFFET SCROLL
// ══════════════════════════════════════
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
});

// ══════════════════════════════════════
//  SCROLL REVEAL
// ══════════════════════════════════════
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.08 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));