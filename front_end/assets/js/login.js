// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
const API_URL = 'http://localhost:3001/api';

// ══════════════════════════════════════
//  ÉTAT
// ══════════════════════════════════════
let currentTab = 'login';

// ══════════════════════════════════════
//  SWITCH ONGLETS login / register
// ══════════════════════════════════════
function switchTab(tab) {
  currentTab = tab;
  hideError();

  const isRegister = tab === 'register';

  // Onglets actifs
  document.getElementById('tab-login').classList.toggle('active', !isRegister);
  document.getElementById('tab-register').classList.toggle('active', isRegister);

  // Champs register-only
  document.querySelectorAll('.register-only').forEach(el => {
    el.style.display = isRegister ? 'block' : 'none';
  });

  // Textes dynamiques
  document.getElementById('form-title').textContent  = isRegister ? 'Créer un compte 🚀' : 'Bon retour 👋';
  document.getElementById('btn-text').textContent    = isRegister ? "S'inscrire" : 'Se connecter';
  document.getElementById('btn-arrow').textContent   = '→';
  document.getElementById('forgot-hint').style.display = isRegister ? 'none' : 'block';
  document.getElementById('terms-p').style.display   = isRegister ? 'block' : 'none';

  document.getElementById('form-sub').innerHTML = isRegister
    ? 'Déjà un compte ? <a href="#" onclick="switchTab(\'login\');return false;">Se connecter</a>'
    : 'Pas encore de compte ? <a href="#" onclick="switchTab(\'register\');return false;">Créer un compte</a>';

  // Vider les champs
  document.getElementById('auth-form').reset();
}

// ══════════════════════════════════════
//  GESTION DES ERREURS
// ══════════════════════════════════════
function showError(msg) {
  const banner = document.getElementById('errorBanner');
  document.getElementById('errorMsg').textContent = msg;
  banner.style.display = 'flex';
  banner.classList.add('visible');
}

function hideError() {
  const banner = document.getElementById('errorBanner');
  banner.style.display = 'none';
  banner.classList.remove('visible');
}

// ══════════════════════════════════════
//  ÉTAT DU BOUTON (loading)
// ══════════════════════════════════════
function setLoading(loading) {
  const btn     = document.getElementById('submit-btn');
  const text    = document.getElementById('btn-text');
  const arrow   = document.getElementById('btn-arrow');
  const spinner = document.getElementById('spinner');

  btn.disabled       = loading;
  text.style.opacity = loading ? '0' : '1';
  arrow.style.display  = loading ? 'none' : 'inline';
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

  if (currentTab === 'login') {
    await doLogin(email, password);
  } else {
    await doRegister(email, password);
  }
}

// ── LOGIN ──
async function doLogin(email, password) {
  setLoading(true);
  try {
    const res  = await fetch(`${API_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.message || 'Erreur de connexion.');
      return;
    }

    // Sauvegarder le token et les infos user
    localStorage.setItem('token',    data.token);
    localStorage.setItem('user',     JSON.stringify(data.user));

    // Rediriger vers le dashboard
    window.location.href = 'home.html';

  } catch (err) {
    showError('Impossible de contacter le serveur. Vérifiez votre connexion.');
  } finally {
    setLoading(false);
  }
}

// ── REGISTER ──
async function doRegister(email, password) {
  const prenom  = document.getElementById('firstName').value.trim();
  const nom     = document.getElementById('lastName').value.trim();
  const confirm = document.getElementById('confirmPassword').value;

  // Validations front
  if (!prenom || !nom) {
    showError('Veuillez renseigner votre prénom et nom.');
    return;
  }
  if (password !== confirm) {
    showError('Les mots de passe ne correspondent pas.');
    return;
  }
  if (password.length < 6) {
    showError('Le mot de passe doit faire au moins 6 caractères.');
    return;
  }

  setLoading(true);
  try {
    const res  = await fetch(`${API_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, nom, prenom }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.message || 'Erreur lors de la création du compte.');
      return;
    }

    // Sauvegarder le token et les infos user
    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));

    // Rediriger vers le dashboard
    window.location.href = 'home.html';

  } catch (err) {
    showError('Impossible de contacter le serveur. Vérifiez votre connexion.');
  } finally {
    setLoading(false);
  }
}

// ══════════════════════════════════════
//  PROTECTION : si déjà connecté → dashboard
// ══════════════════════════════════════
if (localStorage.getItem('token')) {
  window.location.href = 'home.html';
}

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
switchTab('login');