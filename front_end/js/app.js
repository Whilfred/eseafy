/* ============================================
   ZORA PLATFORM — app.js
   Shared utilities, state, routing helpers
   ============================================ */

'use strict';

// ─── CONSTANTS ───────────────────────────────
const APP_NAME   = 'Zora';
const LS_PREFIX  = 'zora_';
const API_BASE   = '/api';   // à connecter au backend

// ─── LOCAL STORAGE HELPERS ───────────────────
const Store = {
  set(key, value) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch {}
  },
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(LS_PREFIX + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },
  remove(key) { localStorage.removeItem(LS_PREFIX + key); },
  clear()     { Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k)); }
};

// ─── AUTH HELPERS ────────────────────────────
const Auth = {
  isLoggedIn()  { return !!Store.get('user'); },
  getUser()     { return Store.get('user'); },
  getToken()    { return Store.get('token'); },
  logout() {
    Store.remove('user');
    Store.remove('token');
    window.location.href = '/login.html';
  },
  requireAuth() {
    if (!this.isLoggedIn()) window.location.href = '/login.html';
  },
  redirectIfAuth(dest = '/dashboard.html') {
    if (this.isLoggedIn()) window.location.href = dest;
  }
};

// ─── API CLIENT ──────────────────────────────
const Api = {
  async request(method, path, body = null) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(Auth.getToken() ? { Authorization: `Bearer ${Auth.getToken()}` } : {})
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  },
  get(path)         { return this.request('GET', path); },
  post(path, body)  { return this.request('POST', path, body); },
  put(path, body)   { return this.request('PUT', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path)         { return this.request('DELETE', path); }
};

// ─── TOAST SYSTEM ────────────────────────────
const Toast = {
  container: null,

  init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 3500) {
    if (!this.container) this.init();
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span style="font-size:1rem">${icons[type] || icons.info}</span><span>${message}</span>`;
    this.container.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'toastIn 0.3s ease reverse';
      setTimeout(() => t.remove(), 280);
    }, duration);
    return t;
  },

  success(msg, dur) { return this.show(msg, 'success', dur); },
  error(msg, dur)   { return this.show(msg, 'error', dur); },
  info(msg, dur)    { return this.show(msg, 'info', dur); }
};

// ─── MODAL SYSTEM ────────────────────────────
const Modal = {
  open(id)  { document.getElementById(id)?.classList.add('open'); },
  close(id) { document.getElementById(id)?.classList.remove('open'); },
  closeAll() {
    document.querySelectorAll('.modal-overlay.open')
      .forEach(m => m.classList.remove('open'));
  }
};

// Close modals on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) Modal.closeAll();
});

// ─── FORM HELPERS ────────────────────────────
const Form = {
  serialize(formEl) {
    const data = {};
    new FormData(formEl).forEach((v, k) => data[k] = v);
    return data;
  },

  validate(rules, data) {
    const errors = {};
    for (const [field, rule] of Object.entries(rules)) {
      const val = (data[field] || '').toString().trim();
      if (rule.required && !val) { errors[field] = 'Ce champ est requis'; continue; }
      if (rule.minLength && val.length < rule.minLength)
        errors[field] = `Minimum ${rule.minLength} caractères`;
      if (rule.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
        errors[field] = 'Email invalide';
      if (rule.match && val !== data[rule.match])
        errors[field] = 'Les mots de passe ne correspondent pas';
    }
    return errors;
  },

  showErrors(errors, formEl) {
    formEl.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    for (const [field, msg] of Object.entries(errors)) {
      const el = formEl.querySelector(`[data-error="${field}"]`);
      if (el) el.textContent = msg;
    }
  },

  setLoading(btn, loading) {
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Chargement…';
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      btn.disabled = false;
    }
  }
};

// ─── CURRENCY ────────────────────────────────
const Currency = {
  format(amount, currency = 'XOF') {
    if (currency === 'XOF') {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: 'XOF',
        minimumFractionDigits: 0
      }).format(amount);
    }
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency
    }).format(amount);
  }
};

// ─── DATE HELPERS ────────────────────────────
const DateFmt = {
  relative(dateStr) {
    const d = new Date(dateStr), now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60)    return 'À l\'instant';
    if (diff < 3600)  return `Il y a ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff/3600)} h`;
    return d.toLocaleDateString('fr-FR');
  },
  format(dateStr, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
    return new Date(dateStr).toLocaleDateString('fr-FR', opts);
  }
};

// ─── SLUG GENERATOR ──────────────────────────
function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── IMAGE PREVIEW ───────────────────────────
function setupImagePreview(inputEl, previewEl) {
  inputEl.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      previewEl.style.backgroundImage = `url(${ev.target.result})`;
      previewEl.classList.add('has-image');
    };
    reader.readAsDataURL(file);
  });
}

// ─── SEARCH / FILTER ─────────────────────────
function filterTable(inputEl, tableEl) {
  inputEl.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    tableEl.querySelectorAll('tbody tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// ─── CLIPBOARD ───────────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    Toast.success('Copié dans le presse-papiers');
  } catch {
    Toast.error('Impossible de copier');
  }
}

// ─── INIT TOOLTIPS ───────────────────────────
function initTooltips() {
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    let tip;
    el.addEventListener('mouseenter', () => {
      tip = document.createElement('div');
      tip.style.cssText = `
        position:fixed; background:var(--surface-3); color:var(--text);
        padding:5px 10px; border-radius:6px; font-size:.78rem;
        pointer-events:none; z-index:9999; white-space:nowrap;
        border:1px solid var(--border-2);
      `;
      tip.textContent = el.dataset.tooltip;
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect();
      tip.style.left = `${r.left + r.width/2 - tip.offsetWidth/2}px`;
      tip.style.top  = `${r.top - tip.offsetHeight - 6}px`;
    });
    el.addEventListener('mouseleave', () => tip?.remove());
  });
}

// ─── GLOBAL DEMO DATA (dev only) ─────────────
const Demo = {
  stats: {
    revenue: 485000,
    orders: 47,
    products: 23,
    visitors: 1203
  },
  orders: [
    { id: '#ORD-001', customer: 'Aminata Diallo', product: 'Pack Formation Excel', amount: 15000, status: 'paid', type: 'digital', date: '2024-03-15' },
    { id: '#ORD-002', customer: 'Moussa Traoré', product: 'T-Shirt Wax Edition', amount: 8500, status: 'pending', type: 'physical', date: '2024-03-14' },
    { id: '#ORD-003', customer: 'Fatou Koné', product: 'E-book Marketing', amount: 5000, status: 'delivered', type: 'digital', date: '2024-03-14' },
    { id: '#ORD-004', customer: 'Ibrahim Sawadogo', product: 'Sac en cuir', amount: 22000, status: 'pending', type: 'physical', date: '2024-03-13' },
    { id: '#ORD-005', customer: 'Mariam Ouédraogo', product: 'Template CV', amount: 2500, status: 'paid', type: 'digital', date: '2024-03-12' }
  ],
  products: [
    { id: 1, name: 'Pack Formation Excel', price: 15000, type: 'digital', stock: '∞', status: 'active', sales: 34 },
    { id: 2, name: 'T-Shirt Wax Edition', price: 8500, type: 'physical', stock: 12, status: 'active', sales: 8 },
    { id: 3, name: 'E-book Marketing Digital', price: 5000, type: 'digital', stock: '∞', status: 'active', sales: 21 },
    { id: 4, name: 'Sac en cuir artisanal', price: 22000, type: 'physical', stock: 3, status: 'active', sales: 5 },
    { id: 5, name: 'Template CV Professionnel', price: 2500, type: 'digital', stock: '∞', status: 'draft', sales: 0 }
  ]
};

// ─── EXPOSE GLOBALS ──────────────────────────
window.ZoraApp = { Store, Auth, Api, Toast, Modal, Form, Currency, DateFmt, Demo, slugify, copyToClipboard, filterTable, initTooltips, setupImagePreview };

// Auto-init toast container
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  initTooltips();
  // Highlight active nav link
  document.querySelectorAll('.nav__link').forEach(link => {
    if (link.href === location.href) link.classList.add('active');
  });
});