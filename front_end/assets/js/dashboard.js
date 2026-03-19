// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
const API_URL = 'http://localhost:3001/api';

// ══════════════════════════════════════
//  RÉCUPÉRER LE TOKEN ET L'UTILISATEUR
// ══════════════════════════════════════
const token = localStorage.getItem('token');
const user  = JSON.parse(localStorage.getItem('user') || 'null');

// ── Protection : pas de token → login ──
if (!token || !user) {
  window.location.href = 'login.html';
}

// ══════════════════════════════════════
//  AFFICHER LES INFOS UTILISATEUR
// ══════════════════════════════════════
function loadUserInfo() {
  // Initiales dans l'avatar
  const initiales = [user.prenom, user.nom]
    .filter(Boolean)
    .map(s => s[0].toUpperCase())
    .join('');
  const avatar = document.querySelector('.avatar');
  if (avatar) avatar.textContent = initiales || 'AB';

  // Nom de la boutique dans la sidebar
  const shopName = document.getElementById('sideShopName');
  if (shopName) shopName.textContent = user.nom ? `Boutique de ${user.prenom || user.nom}` : 'Ma boutique';

  // Plan
  const shopPlan = document.querySelector('.shop-plan');
  if (shopPlan) shopPlan.textContent = user.plan || 'Starter';

  // Message d'accueil
  const dashHeader = document.querySelector('.dash-header h1');
  if (dashHeader) {
    const heure    = new Date().getHours();
    const salut    = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';
    const prenom   = user.prenom || user.nom || '';
    dashHeader.textContent = `${salut}, ${prenom} 👋`;
  }
}

// ══════════════════════════════════════
//  VÉRIFIER LE TOKEN CÔTÉ SERVEUR
//  (optionnel mais recommandé)
// ══════════════════════════════════════
async function verifyToken() {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      // Token expiré ou invalide
      logout();
      return;
    }

    const data = await res.json();

    // Mettre à jour les infos en localStorage
    localStorage.setItem('user', JSON.stringify(data.user));

  } catch (err) {
    console.warn('Impossible de vérifier le token :', err.message);
    // On ne déconnecte pas si c'est juste un problème réseau
  }
}

// ══════════════════════════════════════
//  DÉCONNEXION
// ══════════════════════════════════════
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  verifyToken();

  // Bouton "Changer de boutique" → logout pour l'instant
  const switchBtn = document.querySelector('.sidebar-footer .nav-item');
  if (switchBtn) switchBtn.onclick = logout;
});