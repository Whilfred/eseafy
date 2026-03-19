// ══════════════════════════════════════
//  NAVIGATION SPA
// ══════════════════════════════════════
let currentPage = 'accueil';
let productType = 'digital';

const pageTitles = {
  'accueil':       '<strong>Ma boutique</strong>',
  'ventes':        '<strong>Ma boutique</strong> &nbsp;/&nbsp; Ventes',
  'produits':      '<strong>Ma boutique</strong> &nbsp;/&nbsp; Produits',
  'nouveau-produit':'<strong>Ma boutique</strong> &nbsp;/&nbsp; Nouveau produit',
  'clients':       '<strong>Ma boutique</strong> &nbsp;/&nbsp; Clients',
  'revenus':       '<strong>Ma boutique</strong> &nbsp;/&nbsp; Revenus',
  'analytiques':   '<strong>Ma boutique</strong> &nbsp;/&nbsp; Analytiques',
  'marketing':     '<strong>Ma boutique</strong> &nbsp;/&nbsp; Marketing',
  'affiliation':   '<strong>Ma boutique</strong> &nbsp;/&nbsp; Affiliation',
  'profil':        '<strong>Ma boutique</strong> &nbsp;/&nbsp; Profil',
  'notifications': '<strong>Ma boutique</strong> &nbsp;/&nbsp; Notifications',
  'parametres':    '<strong>Ma boutique</strong> &nbsp;/&nbsp; Paramètres',
};

function navigate(page) {
  // Masquer toutes les pages
  document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));

  // Mettre à jour nav active (on mappe nouveau-produit → produits pour la sidebar)
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navKey = page === 'nouveau-produit' ? 'produits' : page;
  const activeNav = document.getElementById('nav-' + navKey);
  if (activeNav) activeNav.classList.add('active');

  // Mettre à jour le breadcrumb
  document.getElementById('topCrumb').innerHTML = pageTitles[page] || '<strong>Ma boutique</strong>';

  // Bouton brouillon
  document.getElementById('draftBtn').style.display = page === 'nouveau-produit' ? '' : 'none';

  // Gérer la page produits avec ses sous-vues
  if (page === 'nouveau-produit') {
    document.getElementById('page-produits').classList.add('active');
    showProdSubview('subProdChoix');
  } else if (page === 'produits') {
    document.getElementById('page-produits').classList.add('active');
    showProdSubview('subProdList');
    document.getElementById('topCrumb').innerHTML = pageTitles['produits'];
  } else {
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
  }

  currentPage = page;
  window.scrollTo({ top: 0 });
}

function showProdSubview(id) {
  document.querySelectorAll('.prod-subview').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ══════════════════════════════════════
//  CRÉATION PRODUIT
// ══════════════════════════════════════
const cats = {
  digital: [
    '📚 Ebooks & Guides',
    '🎓 Formation & Cours',
    '🎨 Design & Graphisme',
    '💻 Développement & Tech',
    '📈 Marketing & Business',
    '🎵 Audio & Musique',
    '🔧 Templates & Outils'
  ],
  physical: [
    '👗 Vêtements & Mode',
    '🍽 Alimentation',
    '🌿 Beauté & Bien-être',
    '🏠 Maison & Déco',
    '⚡ Électronique',
    '🎨 Artisanat & Art',
    '🧸 Jouets & Loisirs'
  ]
};

function startCreation(type) {
  productType = type;
  const ov = document.getElementById('overlay');
  document.getElementById('ovText').textContent = type === 'digital' ? 'Produit digital' : 'Produit physique';
  document.getElementById('ovSub').textContent = 'Préparation du formulaire…';
  ov.classList.add('show');

  setTimeout(() => {
    const badge = document.getElementById('typeBadge');
    badge.className = 'type-badge ' + type;
    badge.textContent = type === 'digital' ? '📦 Produit digital' : '🚚 Produit physique';

    document.getElementById('topCrumb').innerHTML =
      '<strong>Ma boutique</strong> &nbsp;/&nbsp; Nouveau produit ' +
      (type === 'digital' ? 'digital' : 'physique');

    const sel = document.getElementById('catSelect');
    sel.innerHTML =
      '<option value="">Choisir une catégorie</option>' +
      cats[type].map(c => `<option>${c}</option>`).join('');

    document.getElementById('sumType').textContent =
      type === 'digital' ? 'Produit digital' : 'Produit physique';

    showProdSubview('subProdCreate');
    goStep(1);
    ov.classList.remove('show');
    window.scrollTo({ top: 0 });
  }, 600);
}

function goStep(n) {
  document.querySelectorAll('.step-panel').forEach((p, i) =>
    p.classList.toggle('active', i + 1 === n)
  );

  for (let i = 1; i <= 4; i++) {
    const b    = document.getElementById('b' + i);
    const step = b.closest('.step');
    step.classList.remove('active', 'done');

    if (i < n) {
      step.classList.add('done');
      b.innerHTML = '✓';
    } else if (i === n) {
      step.classList.add('active');
      b.textContent = i;
    } else {
      b.textContent = i;
    }

    if (i < 4) {
      document.getElementById('l' + i).classList.toggle('done', i < n);
    }
  }

  if (n === 4) {
    const name = document.getElementById('pName').value;
    document.getElementById('sumName').textContent = name || '—';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fmt(cmd) {
  document.execCommand(cmd, false, null);
}

function addTag(e) {
  if (e.key !== 'Enter' && e.key !== ',') return;
  e.preventDefault();
  const v = e.target.value.trim().replace(/,$/, '');
  if (!v) return;
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.innerHTML = v + ' <button onclick="this.parentElement.remove()">×</button>';
  document.getElementById('tgInp').before(chip);
  e.target.value = '';
}

function handleImages(input) {
  const grid = document.getElementById('imgGrid');
  Array.from(input.files).slice(0, 8).forEach(file => {
    const r = new FileReader();
    r.onload = e => {
      const d = document.createElement('div');
      d.className = 'img-th';
      d.innerHTML = `<img src="${e.target.result}"/><button class="rm" onclick="this.parentElement.remove()">×</button>`;
      grid.appendChild(d);
    };
    r.readAsDataURL(file);
  });
}

function updateSEO() {
  const name  = (document.getElementById('pName')      || {}).value || '';
  const title = (document.getElementById('seoTitle')   || {}).value || '';
  const desc  = (document.getElementById('seoDescInp') || {}).value || '';

  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '') || 'nom-du-produit';

  const u = document.getElementById('seoUrl');
  if (u) u.textContent = `eseafy.com/boutique/produits/${slug}`;

  const t = document.getElementById('seoTtl');
  if (t) t.textContent = title || name || "Votre titre s'affichera ici";

  const d = document.getElementById('seoDsc');
  if (d) d.textContent = desc || "La description s'affiche dans les résultats de recherche.";
}

function saveDraft(btn) {
  btn.textContent = '✓ Brouillon sauvegardé';
  btn.style.color = 'var(--success)';
  setTimeout(() => {
    btn.textContent = 'Enregistrer brouillon';
    btn.style.color = '';
  }, 2000);
}

function publishProduct(btn) {
  btn.innerHTML =
    '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">' +
    '<polyline points="20 6 9 17 4 12"/></svg> Publié !';
  setTimeout(() => navigate('produits'), 1200);
}

function saveShopName() {
  const name = document.getElementById('shopNameInp').value;
  if (name) document.getElementById('sideShopName').textContent = name;
}

// ══════════════════════════════════════
//  FILTRES
// ══════════════════════════════════════
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const parent = this.closest('.filters-bar');
    parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter'));
    this.classList.add('active-filter');
  });
});

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
navigate('accueil');