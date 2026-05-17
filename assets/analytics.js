/**
 * NUMEROSFERA — Analytics
 * Envia eventos para o backend próprio + GA4 + Meta Pixel.
 *
 * IDs a configurar:
 *   window.ASTRA_GA4_ID    = 'G-XXXXXXXXXX';   // Google Analytics 4
 *   window.ASTRA_PIXEL_ID  = '000000000000000'; // Meta Pixel
 *
 * Definir ANTES de carregar este script.
 */

(function () {
  const API_BASE = window.ASTRA_API_URL || 'https://web-production-6988c1.up.railway.app';

  // ── Session ID ──────────────────────────────────────────────────────────────
  // Gerado no quiz_start e persistido durante toda a sessão
  function _getSessionId() {
    let sid = sessionStorage.getItem('astra_sid');
    if (!sid) {
      sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      sessionStorage.setItem('astra_sid', sid);
    }
    return sid;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function _getNome() {
    try {
      const lead = window.LeadManager ? LeadManager.getLead() : null;
      return lead ? (LeadManager.getNomeFormatado(lead) || null) : null;
    } catch (_) { return null; }
  }

  function _getTipo() {
    try {
      const lead = window.LeadManager ? LeadManager.getLead() : null;
      return lead ? (lead.tipo || null) : null;
    } catch (_) { return null; }
  }

  // ── GA4 ─────────────────────────────────────────────────────────────────────
  function _ga4(eventName, params) {
    try {
      if (typeof gtag === 'function') {
        gtag('event', eventName, params || {});
      }
    } catch (_) {}
  }

  // ── Meta Pixel ───────────────────────────────────────────────────────────────
  function _pixel(eventName, params) {
    try {
      if (typeof fbq === 'function') {
        fbq('trackCustom', eventName, params || {});
      }
    } catch (_) {}
  }

  // ── Backend próprio ──────────────────────────────────────────────────────────
  function _backend(eventName, extra) {
    const payload = {
      event:      eventName,
      session_id: _getSessionId(),
      nome:       extra && extra.nome  !== undefined ? extra.nome  : _getNome(),
      tipo:       extra && extra.tipo  !== undefined ? extra.tipo  : _getTipo(),
      page:       window.location.pathname.split('/').pop() || 'index.html',
    };
    fetch(API_BASE + '/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  // ── API pública ──────────────────────────────────────────────────────────────
  window.AstraAnalytics = {
    track(eventName, extra) {
      try {
        _backend(eventName, extra);
        _ga4(eventName, extra);
        _pixel(eventName, extra);
      } catch (_) {}
    },

    // Inicializa GA4 dinamicamente com o ID configurado
    initGA4() {
      const id = window.ASTRA_GA4_ID;
      if (!id || id.startsWith('G-XXX')) return;
      const s = document.createElement('script');
      s.async = true;
      s.src   = 'https://www.googletagmanager.com/gtag/js?id=' + id;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      gtag('js', new Date());
      gtag('config', id);
    },

    // Inicializa Meta Pixel com o ID configurado
    initPixel() {
      const id = window.ASTRA_PIXEL_ID;
      if (!id || id === '000000000000000') return;
      !function(f,b,e,v,n,t,s){
        if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)
      }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', id);
      fbq('track', 'PageView');
    },
  };

  // Auto-init ao carregar
  window.AstraAnalytics.initGA4();
  window.AstraAnalytics.initPixel();
})();
