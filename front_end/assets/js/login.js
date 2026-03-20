// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
const API_URL = 'http://localhost:3001/api';

// ══════════════════════════════════════
//  ÉTAT
// ══════════════════════════════════════
let currentTab   = 'login';
let pendingEmail = null; // email en attente de vérification OTP

// ══════════════════════════════════════
//  SWITCH ONGLETS login / register
// ══════════════════════════════════════
function switchTab(tab) {
  currentTab = tab;
  hideError();

  const isRegister = tab === 'register';

  document.getElementById('tab-login').classList.toggle('active', !isRegister);
  document.getElementById('tab-register').classList.toggle('active', isRegister);

  document.querySelectorAll('.register-only').forEach(el => {
    el.style.display = isRegister ? 'block' : 'none';
  });

  document.getElementById('form-title').textContent    = isRegister ? 'Créer un compte 🚀' : 'Bon retour 👋';
  document.getElementById('btn-text').textContent      = isRegister ? "S'inscrire" : 'Se connecter';
  document.getElementById('btn-arrow').textContent     = '→';
  document.getElementById('forgot-hint').style.display = isRegister ? 'none' : 'block';
  document.getElementById('terms-p').style.display     = isRegister ? 'block' : 'none';

  document.getElementById('form-sub').innerHTML = isRegister
    ? 'Déjà un compte ? <a href="#" onclick="switchTab(\'login\');return false;">Se connecter</a>'
    : 'Pas encore de compte ? <a href="#" onclick="switchTab(\'register\');return false;">Créer un compte</a>';

  document.getElementById('auth-form').reset();

  // Masquer l'étape OTP si on change d'onglet
  showMainForm();
}

// ══════════════════════════════════════
//  AFFICHER / CACHER LES ÉTAPES
// ══════════════════════════════════════
function showOTPStep(email) {
  pendingEmail = email;
  document.getElementById('auth-form').style.display = 'none';
  document.getElementById('otp-step').style.display  = 'block';
  document.getElementById('otp-email').textContent   = email;
  document.getElementById('form-title').textContent  = 'Vérification 🔐';
  document.getElementById('form-sub').innerHTML      = 'Entrez le code reçu par email';
  document.querySelectorAll('.auth-tabs, .divider, .social-btns, .feature-pills').forEach(el => el.style.display = 'none');
  // Focus automatique sur l'input OTP
  setTimeout(() => document.getElementById('otpInput')?.focus(), 100);
}

function showMainForm() {
  document.getElementById('auth-form').style.display = 'block';
  const otpStep = document.getElementById('otp-step');
  if (otpStep) otpStep.style.display = 'none';
  document.querySelectorAll('.auth-tabs, .divider, .social-btns, .feature-pills').forEach(el => el.style.display = '');
  pendingEmail = null;
}

function backToLogin() {
  switchTab('login');
}

// ══════════════════════════════════════
//  ERREURS
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
//  LOADING
// ══════════════════════════════════════
function setLoading(loading) {
  const btn     = document.getElementById('submit-btn');
  const text    = document.getElementById('btn-text');
  const arrow   = document.getElementById('btn-arrow');
  const spinner = document.getElementById('spinner');
  btn.disabled         = loading;
  text.style.opacity   = loading ? '0' : '1';
  arrow.style.display  = loading ? 'none' : 'inline';
  spinner.style.display = loading ? 'block' : 'none';
}

function setOTPLoading(loading) {
  const btn     = document.getElementById('otp-btn');
  const spinner = document.getElementById('otp-spinner');
  if (btn)     btn.disabled          = loading;
  if (spinner) spinner.style.display = loading ? 'block' : 'none';
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

// ── LOGIN — Étape 1 ──
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

    // Si OTP requis → afficher l'étape OTP
    if (data.step === 'otp_required') {
      showOTPStep(data.email || email);
      return;
    }

    // Connexion directe (si pas d'OTP)
    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));
    window.location.href = 'home.html';

  } catch (err) {
    showError('Impossible de contacter le serveur. Vérifiez votre connexion.');
  } finally {
    setLoading(false);
  }
}

// ── VÉRIFIER L'OTP — Étape 2 ──
async function verifyOTP() {
  const otp = document.getElementById('otpInput').value.trim();
  hideError();

  if (!otp || otp.length !== 6) {
    showError('Veuillez saisir le code à 6 chiffres.');
    return;
  }

  setOTPLoading(true);
  try {
    const res  = await fetch(`${API_URL}/auth/verify-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: pendingEmail, otp }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.message || 'Code incorrect.');
      return;
    }

    // Connecté !
    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));
    window.location.href = 'home.html';

  } catch (err) {
    showError('Impossible de contacter le serveur.');
  } finally {
    setOTPLoading(false);
  }
}

// ── RENVOYER L'OTP ──
async function resendOTP() {
  if (!pendingEmail) return;
  hideError();
  try {
    const res  = await fetch(`${API_URL}/auth/resend-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: pendingEmail }),
    });
    const data = await res.json();
    if (res.ok) {
      showError('✅ Nouveau code envoyé !');
      document.getElementById('errorBanner').style.background = '#d4edda';
      document.getElementById('errorBanner').style.color      = '#1c7a4a';
    } else {
      showError(data.message);
    }
  } catch (err) {
    showError('Erreur serveur.');
  }
}

// ── REGISTER ──
async function doRegister(email, password) {
  const prenom  = document.getElementById('firstName').value.trim();
  const nom     = document.getElementById('lastName').value.trim();
  const confirm = document.getElementById('confirmPassword').value;

  if (!prenom || !nom) { showError('Veuillez renseigner votre prénom et nom.'); return; }
  if (password !== confirm) { showError('Les mots de passe ne correspondent pas.'); return; }
  if (password.length < 6) { showError('Le mot de passe doit faire au moins 6 caractères.'); return; }

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

    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));
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