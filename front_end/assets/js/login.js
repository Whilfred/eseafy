// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
// Remplace par ton URL Railway une fois déployé
const API_URL = 'http://localhost:3000';

// ══════════════════════════════════════
//  CURSEUR PERSONNALISÉ
// ══════════════════════════════════════
const cursor = document.getElementById('cursor');
const ring   = document.getElementById('cursor-ring');
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
//  ONGLETS CONNEXION / INSCRIPTION
// ══════════════════════════════════════
let currentTab = 'login';

function switchTab(tab) {
  currentTab = tab;
  const isRegister = tab === 'register';

  document.getElementById('tab-login').classList.toggle('active', !isRegister);
  document.getElementById('tab-register').classList.toggle('active', isRegister);

  document.querySelectorAll('.register-only').forEach(el =>
    el.classList.toggle('visible', isRegister)
  );

  document.getElementById('form-title').textContent = isRegister
    ? 'Créer un compte ✨'
    : 'Bon retour 👋';

  document.getElementById('form-sub').innerHTML = isRegister
    ? 'Déjà un compte ? <a href="#" onclick="switchTab(\'login\');return false;">Se connecter</a>'
    : 'Pas encore de compte ? <a href="#" onclick="switchTab(\'register\');return false;">Créer un compte</a>';

  document.getElementById('btn-text').textContent       = isRegister ? 'Créer mon compte' : 'Se connecter';
  document.getElementById('forgot-hint').style.display  = isRegister ? 'none' : 'flex';
  document.getElementById('terms-p').style.display      = isRegister ? 'block' : 'none';

  hideError();
}

// ══════════════════════════════════════
//  GESTION DES ERREURS
// ══════════════════════════════════════
function showError(msg) {
  const banner = document.getElementById('errorBanner');
  document.getElementById('errorMsg').textContent = msg;
  banner.classList.add('show');
}

function hideError() {
  document.getElementById('errorBanner').classList.remove('show');
}

// ══════════════════════════════════════
//  ÉTAT DE CHARGEMENT
// ══════════════════════════════════════
function setLoading(loading) {
  const btn     = document.getElementById('submit-btn');
  const text    = document.getElementById('btn-text');
  const arrow   = document.getElementById('btn-arrow');
  const spinner = document.getElementById('spinner');

  btn.disabled          = loading;
  text.textContent      = loading
    ? 'Chargement...'
    : (currentTab === 'register' ? 'Créer mon compte' : 'Se connecter');
  arrow.style.display   = loading ? 'none'  : 'inline';
  spinner.style.display = loading ? 'block' : 'none';
}

// ══════════════════════════════════════
//  SOUMISSION DU FORMULAIRE
// ══════════════════════════════════════
async function handleSubmit(e) {
  e.preventDefault();
  hideError();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  // ── CONNEXION ──────────────────────
  if (currentTab === 'login') {
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Email ou mot de passe incorrect');
        return;
      }

      localStorage.setItem('eseafy_token', data.token);
      localStorage.setItem('eseafy_user',  JSON.stringify(data.user));
      window.location.href = 'eseafy-stores.html';

    } catch (err) {
      showError('Impossible de contacter le serveur. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }

  // ── INSCRIPTION ────────────────────
  } else {
    const firstName       = document.getElementById('firstName').value.trim();
    const lastName        = document.getElementById('lastName').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
      showError('Les mots de passe ne correspondent pas');
      return;
    }
    if (password.length < 6) {
      showError('Le mot de passe doit faire au moins 6 caractères');
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Erreur lors de la création du compte');
        return;
      }

      localStorage.setItem('eseafy_token', data.token);
      localStorage.setItem('eseafy_user',  JSON.stringify(data.user));
      window.location.href = 'eseafy-stores.html';

    } catch (err) {
      showError('Impossible de contacter le serveur. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  }
}

// ══════════════════════════════════════
//  VÉRIFICATION AU CHARGEMENT
// ══════════════════════════════════════
// Si déjà connecté → aller directement aux boutiques
window.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('eseafy_token');
  if (token) {
    window.location.href = 'eseafy-stores.html';
  }
});