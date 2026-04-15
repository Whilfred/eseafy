// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
const API_URL = 'https://eseafy-backend.fly.dev/api';

// ══════════════════════════════════════
//  ÉTAT
// ══════════════════════════════════════
let currentTab   = 'login';
let pendingEmail = null;
let resetEmail   = null;

// ══════════════════════════════════════
//  MODAL PERSONNALISÉ
// ══════════════════════════════════════
function showModal(options) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalOverlay');
    if (!modal) {
      // Fallback si le modal n'existe pas dans le DOM
      const result = prompt(options.title + '\n' + (options.subtitle || ''));
      resolve(result);
      return;
    }
    
    const iconEl = document.getElementById('modalIcon');
    const titleEl = document.getElementById('modalTitle');
    const subEl = document.getElementById('modalSub');
    const inputEl = document.getElementById('modalInput');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    iconEl.textContent = options.icon || '📧';
    titleEl.textContent = options.title || 'Entrez votre email';
    subEl.textContent = options.subtitle || 'Nous vous enverrons un code de réinitialisation';
    inputEl.type = options.inputType || 'email';
    inputEl.placeholder = options.placeholder || 'exemple@email.com';
    inputEl.value = '';

    const onConfirm = () => {
      cleanup();
      resolve(inputEl.value);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    const onOverlayClick = (e) => {
      if (e.target === modal) {
        cleanup();
        resolve(null);
      }
    };
    const onKeydown = (e) => {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    };

    const cleanup = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      modal.classList.remove('active');
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);

    modal.classList.add('active');
    setTimeout(() => inputEl.focus(), 100);
  });
}

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
  
  const otpBtn = document.getElementById('otp-btn');
  otpBtn.onclick = verifyOTP;
  const otpBtnText = document.getElementById('otp-btn-text');
  if (otpBtnText) otpBtnText.textContent = 'Vérifier le code';
  
  const resendLink = document.getElementById('resendOtpLink');
  if (resendLink) {
    resendLink.onclick = (e) => {
      e.preventDefault();
      resendOTP();
    };
  }
  
  setTimeout(() => document.getElementById('otpInput')?.focus(), 100);
}

function showMainForm() {
  document.getElementById('auth-form').style.display = 'block';
  const otpStep = document.getElementById('otp-step');
  if (otpStep) otpStep.style.display = 'none';
  document.querySelectorAll('.auth-tabs, .divider, .social-btns, .feature-pills').forEach(el => el.style.display = '');
  pendingEmail = null;
  resetEmail = null;
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
  if (btn) btn.disabled = loading;
  if (text) text.style.opacity = loading ? '0' : '1';
  if (arrow) arrow.style.display = loading ? 'none' : 'inline';
  if (spinner) spinner.style.display = loading ? 'block' : 'none';
}

function setOTPLoading(loading) {
  const btn     = document.getElementById('otp-btn');
  const spinner = document.getElementById('otp-spinner');
  if (btn) btn.disabled = loading;
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

    if (data.step === 'otp_required') {
      showOTPStep(data.email || email);
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

// ── VÉRIFIER L'OTP — Étape 2 (connexion normale) ──
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

    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));
    window.location.href = 'home.html';

  } catch (err) {
    showError('Impossible de contacter le serveur.');
  } finally {
    setOTPLoading(false);
  }
}

// ── RENVOYER L'OTP (connexion normale) ──
async function resendOTP() {
  if (!pendingEmail) return;
  hideError();
  setOTPLoading(true);
  try {
    const res  = await fetch(`${API_URL}/auth/resend-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: pendingEmail }),
    });
    const data = await res.json();
    setOTPLoading(false);
    if (res.ok) {
      showError('✅ Nouveau code envoyé !');
      document.getElementById('errorBanner').style.background = '#d4edda';
      document.getElementById('errorBanner').style.color      = '#1c7a4a';
      setTimeout(() => hideError(), 3000);
    } else {
      showError(data.message);
    }
  } catch (err) {
    setOTPLoading(false);
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
//  MOT DE PASSE OUBLIÉ (AVEC MODAL)
// ══════════════════════════════════════
async function requestPasswordReset() {
  const email = await showModal({
    icon: '🔐',
    title: 'Mot de passe oublié',
    subtitle: 'Entrez votre adresse email pour recevoir un code de réinitialisation',
    inputType: 'email',
    placeholder: 'votre@email.com'
  });
  
  if (!email) return;
  
  hideError();
  setLoading(true);
  
  try {
    const res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    
    const data = await res.json();
    setLoading(false);
    
    if (res.ok) {
      resetEmail = email;
      showResetOTPStep(email);
    } else {
      showError(data.message || 'Erreur lors de la demande.');
    }
  } catch (err) {
    setLoading(false);
    showError('Erreur serveur. Veuillez réessayer.');
  }
}

function showResetOTPStep(email) {
  resetEmail = email;
  
  document.getElementById('auth-form').style.display = 'none';
  document.getElementById('otp-step').style.display = 'block';
  document.getElementById('otp-email').textContent = email;
  document.getElementById('form-title').textContent = 'Réinitialisation 🔑';
  document.getElementById('form-sub').innerHTML = 'Entrez le code reçu par email pour réinitialiser votre mot de passe';
  
  const otpBtn = document.getElementById('otp-btn');
  otpBtn.onclick = verifyResetOTP;
  const otpBtnText = document.getElementById('otp-btn-text');
  if (otpBtnText) otpBtnText.textContent = 'Vérifier et réinitialiser';
  
  const resendLink = document.getElementById('resendOtpLink');
  if (resendLink) {
    resendLink.onclick = (e) => {
      e.preventDefault();
      resendResetOTP();
    };
  }
  
  document.getElementById('otpInput').value = '';
  setTimeout(() => document.getElementById('otpInput')?.focus(), 100);
}

async function verifyResetOTP() {
  const otp = document.getElementById('otpInput').value.trim();
  
  if (!otp || otp.length !== 6) {
    showError('Veuillez saisir le code à 6 chiffres.');
    return;
  }
  
  if (!resetEmail) {
    showError('Email non trouvé. Veuillez recommencer.');
    return;
  }
  
  const newPassword = await showModal({
    icon: '🔑',
    title: 'Nouveau mot de passe',
    subtitle: 'Minimum 6 caractères',
    inputType: 'password',
    placeholder: '••••••••'
  });
  
  if (!newPassword) {
    showError('Veuillez saisir un nouveau mot de passe.');
    return;
  }
  
  if (newPassword.length < 6) {
    showError('Le mot de passe doit faire au moins 6 caractères.');
    return;
  }
  
  setOTPLoading(true);
  
  try {
    const res = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: resetEmail,
        otp: otp,
        newPassword: newPassword,
      }),
    });
    
    const data = await res.json();
    setOTPLoading(false);
    
    if (res.ok) {
      showError('✅ Mot de passe modifié avec succès ! Connectez-vous.');
      const banner = document.getElementById('errorBanner');
      banner.style.background = '#d4edda';
      banner.style.color = '#1c7a4a';
      
      setTimeout(() => {
        backToLogin();
      }, 2000);
    } else {
      showError(data.message || 'Erreur lors de la réinitialisation.');
    }
  } catch (err) {
    setOTPLoading(false);
    showError('Erreur serveur. Veuillez réessayer.');
  }
}

async function resendResetOTP() {
  if (!resetEmail) {
    showError('Email non trouvé. Veuillez recommencer.');
    return;
  }
  
  hideError();
  setOTPLoading(true);
  
  try {
    const res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail }),
    });
    
    const data = await res.json();
    setOTPLoading(false);
    
    if (res.ok) {
      showError('✅ Nouveau code envoyé ! Vérifiez votre boîte email.');
      const banner = document.getElementById('errorBanner');
      banner.style.background = '#d4edda';
      banner.style.color = '#1c7a4a';
      setTimeout(() => hideError(), 3000);
    } else {
      showError(data.message || 'Erreur lors du renvoi.');
    }
  } catch (err) {
    setOTPLoading(false);
    showError('Erreur serveur.');
  }
}

// ══════════════════════════════════════
//  INITIALISATION DES LIENS
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const forgotLink = document.getElementById('forgotPasswordLink');
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      requestPasswordReset();
    });
  }
  
  const backLink = document.getElementById('backToLoginLink');
  if (backLink) {
    backLink.addEventListener('click', (e) => {
      e.preventDefault();
      backToLogin();
    });
  }
});

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
switchTab('login');