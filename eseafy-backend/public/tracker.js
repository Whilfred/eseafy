/**
 * eseafy Tracker SDK v1.0
 * Collecte des données comportementales des visiteurs
 * À injecter dans boutique.html et produit.html
 */

(function() {
  'use strict';

  const BASE_URL = 'http://localhost:3001';

  // ══════════════════════════════════════
  //  SESSION ID — identifiant unique visiteur
  // ══════════════════════════════════════
  function getSessionId() {
    let sid = sessionStorage.getItem('esf_session');
    if (!sid) {
      sid = 'esf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem('esf_session', sid);
    }
    return sid;
  }

  // ══════════════════════════════════════
  //  DEVICE FINGERPRINT
  // ══════════════════════════════════════
  function getFingerprint() {
    const components = [];

    // Canvas fingerprint
    try {
      const canvas  = document.createElement('canvas');
      const ctx     = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font      = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Ojafy🛒', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('Ojafy🛒', 4, 17);
      components.push(canvas.toDataURL().slice(-50));
    } catch(e) { components.push('no-canvas'); }

    // WebGL
    try {
      const gl       = document.createElement('canvas').getContext('webgl');
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
      }
    } catch(e) { components.push('no-webgl'); }

    // Screen + timezone + language
    components.push(screen.width + 'x' + screen.height);
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    components.push(navigator.language);
    components.push(navigator.platform);

    // Hash simple
    const str  = components.join('|');
    let hash   = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
  }

  // ══════════════════════════════════════
  //  INFOS DEVICE
  // ══════════════════════════════════════
  function getDeviceInfo() {
    const ua = navigator.userAgent;

    // Type d'appareil
    let device_type = 'desktop';
    if (/Mobi|Android|iPhone/i.test(ua)) device_type = 'mobile';
    else if (/iPad|Tablet/i.test(ua))    device_type = 'tablet';

    // OS
    let os = 'unknown';
    if (/Windows/i.test(ua))      os = 'Windows';
    else if (/Mac OS/i.test(ua))  os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua))   os = 'Linux';

    // Navigateur
    let browser = 'unknown';
    if (/Chrome/i.test(ua) && !/Edge/i.test(ua))  browser = 'Chrome';
    else if (/Firefox/i.test(ua))                  browser = 'Firefox';
    else if (/Safari/i.test(ua))                   browser = 'Safari';
    else if (/Edge/i.test(ua))                     browser = 'Edge';
    else if (/Opera/i.test(ua))                    browser = 'Opera';

    // Connexion
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const connection_type = conn ? (conn.effectiveType || conn.type || 'unknown') : 'unknown';

    return {
      device_type,
      os,
      browser,
      screen_res:      screen.width + 'x' + screen.height,
      language:        navigator.language || 'unknown',
      timezone:        Intl.DateTimeFormat().resolvedOptions().timeZone,
      connection_type,
      ram_gb:          navigator.deviceMemory || null,
      cpu_cores:       navigator.hardwareConcurrency || null,
      referrer:        document.referrer || null,
      landing_page:    window.location.href,
    };
  }

  // ══════════════════════════════════════
  //  UTM PARAMS
  // ══════════════════════════════════════
  function getUTM() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source:   params.get('utm_source')   || null,
      utm_campaign: params.get('utm_campaign') || null,
      utm_medium:   params.get('utm_medium')   || null,
      utm_content:  params.get('utm_content')  || null,
    };
  }

  // ══════════════════════════════════════
  //  ENVOYER UN EVENT AU SERVEUR
  // ══════════════════════════════════════
  function track(event_type, payload = {}) {
    const data = {
      session_id:   window.ESF_SESSION_ID,
      boutique_slug: window.ESF_BOUTIQUE_SLUG,
      produit_slug:  window.ESF_PRODUIT_SLUG || null,
      event_type,
      page_url:     window.location.href,
      payload,
      ts:           new Date().toISOString(),
    };

    // Utiliser sendBeacon pour ne pas bloquer la page
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      navigator.sendBeacon(`${BASE_URL}/api/tracker/event`, blob);
    } else {
      fetch(`${BASE_URL}/api/tracker/event`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ══════════════════════════════════════
  //  INITIALISER LE TRACKER
  // ══════════════════════════════════════
  function init(config = {}) {
    window.ESF_SESSION_ID    = getSessionId();
    window.ESF_BOUTIQUE_SLUG = config.boutique_slug || null;
    window.ESF_PRODUIT_SLUG  = config.produit_slug  || null;
    window.ESF_TRACK         = track;

    const deviceInfo = getDeviceInfo();
    const utmInfo    = getUTM();
    const fingerprint = getFingerprint();

    // ── Event : page_view ──
    track('page_view', {
      ...deviceInfo,
      ...utmInfo,
      fingerprint,
      type: config.page_type || 'boutique',
    });

    // ── Tracker scroll depth ──
    let maxScroll = 0;
    const trackScroll = () => {
      const scrollPct = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );
      if (scrollPct > maxScroll) {
        maxScroll = scrollPct;
        // Envoyer seulement aux seuils 25, 50, 75, 100
        if ([25, 50, 75, 100].includes(scrollPct)) {
          track('scroll_depth', { depth: scrollPct });
        }
      }
    };
    window.addEventListener('scroll', trackScroll, { passive: true });

    // ── Tracker temps sur la page ──
    const pageStart = Date.now();
    const trackTimeOnPage = () => {
      const seconds = Math.round((Date.now() - pageStart) / 1000);
      track('time_on_page', { seconds });
    };
    window.addEventListener('beforeunload', trackTimeOnPage);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) trackTimeOnPage();
    });

    // ── Tracker clics ──
    document.addEventListener('click', (e) => {
      const el      = e.target.closest('button, a, [data-track]');
      if (!el) return;
      const label   = el.dataset.track || el.textContent?.trim().slice(0, 50) || el.tagName;
      track('click', { element: label, tag: el.tagName });
    });

    // ── Tracker rage clicks ──
    let clickCount = 0;
    let clickTimer = null;
    document.addEventListener('click', () => {
      clickCount++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        if (clickCount >= 3) track('rage_click', { count: clickCount });
        clickCount = 0;
      }, 500);
    });

    // ── Tracker inactivité ──
    document.addEventListener('visibilitychange', () => {
      track('visibility_change', { hidden: document.hidden });
    });

    // ── Tracker hover sur produits ──
    document.querySelectorAll('.product-card, .pt-row').forEach(el => {
      let hoverStart = null;
      el.addEventListener('mouseenter', () => { hoverStart = Date.now(); });
      el.addEventListener('mouseleave', () => {
        if (hoverStart) {
          const ms = Date.now() - hoverStart;
          if (ms > 500) { // Seulement si hover > 500ms
            const name = el.querySelector('.product-name, .pt-name')?.textContent || 'unknown';
            track('product_hover', { product: name, duration_ms: ms });
          }
          hoverStart = null;
        }
      });
    });

    // ── Tracker copier-coller ──
    document.addEventListener('copy', () => track('copy', { url: window.location.href }));

    console.log('📊 Ojafy Tracker initialisé | Session :', window.ESF_SESSION_ID, '| Fingerprint :', fingerprint);
  }

  // Exposer globalement
  window.EsfTracker = { init, track };

})();
