/* واجهة العميل: تقرأ الإعدادات من Supabase وتعرض الوسائل المفعّلة فقط */
(function () {
  const F = window.FLEX, $ = id => document.getElementById(id), esc = F.esc;
  const svg = p => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS = {
    vodafone: svg('<path d="M3 7a2 2 0 0 1 2-2h12v4"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14" r="1"/>'),
    instapay: svg('<path d="M4 8h14l-3-3"/><path d="M20 16H6l3 3"/>'),
    whatsapp: svg('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.4A8.4 8.4 0 1 1 21 11.5z"/><path d="M9 9.5c.5 2 2.5 4 5 5l1.5-1.2-2-1.3-1 .8c-.8-.4-1.7-1.3-2.1-2.1l.8-1-1.3-2z"/>')
  };
  const COPY = svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>');
  const ARROW = svg('<path d="M15 6l-6 6 6 6"/>');
  const DEFAULTS = {
    brand_name: "FLEX", welcome_title: "أهلاً بك في FLEX",
    welcome_subtitle: "اختر طريقة الدفع أو التواصل المناسبة لك",
    disclaimer: "فتح رابط التحويل لا يعني إتمام الدفع. راجع بيانات العملية قبل التأكيد، ولا تشارك رقمك السري مع أي شخص."
  };
  let byKey = {};

  function target(m) {
    if (m.key === "whatsapp") {
      const n = F.waNumber(m.account_value);
      if (!n) return { err: "رقم التواصل غير صحيح أو غير مُعدّ حالياً." };
      return { href: "https://wa.me/" + n + "?text=" + encodeURIComponent(m.whatsapp_message || "") };
    }
    const u = F.safeUrl(m.link);
    if (u) return { href: u };
    return { err: m.link ? "رابط الدفع غير صحيح. يمكنك استخدام البيانات أدناه." : "لا يوجد رابط مباشر لهذه الوسيلة. يمكنك استخدام البيانات أدناه." };
  }

  function iconHtml(m) {
    const u = F.safeUrl(m.icon_url);
    return u ? `<img src="${esc(u)}" alt="" loading="lazy">` : (ICONS[m.key] || "");
  }

  function render(s, methods) {
    s = Object.assign({}, DEFAULTS, s || {});
    F.applyTheme(s);
    document.title = s.brand_name;
    const logo = F.safeUrl(s.logo_url);
    $("brand").innerHTML = logo
      ? `<img src="${esc(logo)}" alt="${esc(s.brand_name)}">`
      : `<div class="wordmark">${esc(s.brand_name)}</div>`;
    $("title").textContent = s.welcome_title;
    $("subtitle").textContent = s.welcome_subtitle;
    $("disclaimer").textContent = s.disclaimer;

    byKey = {};
    if (!methods.length) {
      $("methods").innerHTML = '<div class="state">لا توجد وسائل دفع أو تواصل متاحة حالياً.</div>';
      return;
    }
    $("methods").innerHTML = methods.map(m => {
      byKey[m.key] = m;
      const t = target(m);
      const inner = `<span class="ico">${iconHtml(m)}</span><span class="txt"><b>${esc(m.title)}</b>${m.description ? `<span>${esc(m.description)}</span>` : ""}</span><span class="arrow">${ARROW}</span>`;
      const main = t.href
        ? `<a class="method" href="${esc(t.href)}" rel="noopener">${inner}</a>`
        : `<button class="method" type="button" data-sheet="${esc(m.key)}">${inner}</button>`;
      const copy = (m.show_copy && m.account_value && m.key !== "whatsapp")
        ? `<button class="copy-btn" type="button" data-copy="${esc(m.key)}" aria-label="نسخ بيانات ${esc(m.title)}">${COPY}</button>` : "";
      return `<div class="row">${main}${copy}</div>`;
    }).join("");
  }

  function openSheet(m) {
    const t = target(m), v = m.account_value;
    const root = $("sheet-root");
    root.innerHTML = `<div class="sheet-bg" data-close><div class="sheet" role="dialog" aria-modal="true">
      <h3>${esc(m.title)}</h3>
      <p>${esc(t.err || "")}</p>
      ${v ? `<div class="valbox"><code>${esc(v)}</code><button class="btn" type="button" data-copyval>نسخ</button></div>` : '<p>هذه الوسيلة غير متاحة حالياً.</p>'}
      <button class="btn ghost block" type="button" data-close>إغلاق</button></div></div>`;
    root.querySelector("[data-copyval]")?.addEventListener("click", () => doCopy(v));
  }
  $("sheet-root").addEventListener("click", e => {
    if (e.target.hasAttribute("data-close")) $("sheet-root").innerHTML = "";
  });

  async function doCopy(text) {
    const ok = await F.copy(text);
    F.toast(ok ? "تم النسخ" : "تعذر النسخ، انسخ البيانات يدوياً", ok ? "ok" : "err");
  }

  function fail(msg) {
    $("methods").innerHTML = `<div class="state err">${esc(msg)}<br><br><button class="btn" type="button" id="retry">إعادة المحاولة</button></div>`;
    $("retry").onclick = () => load(true);
  }

  async function load(first) {
    if (!F.configured) { fail("لم يتم ربط قاعدة البيانات بعد."); F.hideLoader(); return; }
    try {
      const [s, m] = await Promise.all([
        F.db.from("site_settings").select("*").eq("id", 1).maybeSingle(),
        F.db.from("payment_methods").select("*").eq("enabled", true).order("sort_order")
      ]);
      if (s.error || m.error) throw (s.error || m.error);
      render(s.data, m.data || []);
    } catch (e) {
      if (first) fail("تعذر تحميل البيانات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { F.hideLoader(); }
  }

  $("methods").addEventListener("click", e => {
    const c = e.target.closest("[data-copy]");
    if (c) { doCopy(byKey[c.dataset.copy].account_value); return; }
    const s = e.target.closest("[data-sheet]");
    if (s) openSheet(byKey[s.dataset.sheet]);
  });
  /* عند العودة للصفحة تُحدَّث البيانات تلقائياً لتظهر آخر التعديلات */
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
  load(true);
})();
