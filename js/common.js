/* دوال مشتركة بين واجهة العميل ولوحة الإدارة */
(function () {
  const cfg = window.FLEX_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/YOUR_/.test(cfg.SUPABASE_URL) && !/YOUR_/.test(cfg.SUPABASE_ANON_KEY) && window.supabase);

  const F = {
    configured,
    db: configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null,

    esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },

    /* يقبل http/https فقط (يمنع javascript: وغيرها) */
    safeUrl(u) {
      try {
        const x = new URL(String(u || "").trim());
        return x.protocol === "http:" || x.protocol === "https:" ? x.href : null;
      } catch (e) { return null; }
    },

    /* يحوّل 01012345678 إلى 201012345678 ويقبل الصيغة الدولية */
    waNumber(n) {
      let d = String(n || "").replace(/\D/g, "");
      if (d.startsWith("00")) d = d.slice(2);
      else if (d.startsWith("0")) d = "20" + d.slice(1);
      return d.length >= 10 && d.length <= 15 ? d : null;
    },

    isHex: v => /^#[0-9a-fA-F]{6}$/.test(v || ""),

    toast(msg, type) {
      const t = document.getElementById("toast");
      if (!t) return;
      t.textContent = msg;
      t.className = "show " + (type || "ok");
      clearTimeout(t._h);
      t._h = setTimeout(() => { t.className = ""; }, 3500);
    },

    async copy(text) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (e) {
        try {
          const a = document.createElement("textarea");
          a.value = text; a.style.cssText = "position:fixed;opacity:0";
          document.body.appendChild(a); a.select();
          const ok = document.execCommand("copy"); a.remove(); return ok;
        } catch (e2) { return false; }
      }
    },

    applyTheme(s) {
      const r = document.documentElement.style;
      if (F.isHex(s.bg_color)) {
        r.setProperty("--bg", s.bg_color);
        const m = document.querySelector('meta[name="theme-color"]');
        if (m) m.content = s.bg_color;
      }
      if (F.isHex(s.accent_color)) {
        r.setProperty("--accent", s.accent_color);
        const h = s.accent_color.slice(1);
        const [R, G, B] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
        r.setProperty("--on-accent", (0.299 * R + 0.587 * G + 0.114 * B) > 150 ? "#0a0a0a" : "#ffffff");
      }
    },

    hideLoader() {
      const l = document.getElementById("loader");
      if (l) l.classList.add("hide");
    }
  };
  window.FLEX = F;
})();
