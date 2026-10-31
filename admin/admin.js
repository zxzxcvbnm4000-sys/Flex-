/* لوحة إدارة FLEX - تعمل بحساب Supabase Auth فقط، والحماية الفعلية من سياسات RLS */
(function () {
  const F = window.FLEX, db = F.db, esc = F.esc, app = document.getElementById("app");
  const LABELS = {
    vodafone: "رقم المحفظة (للنسخ - اختياري)",
    instapay: "عنوان الدفع أو رقم الهاتف",
    whatsapp: "رقم واتساب (مثال: 01012345678 أو 201012345678)"
  };
  const BASE = ["vodafone", "instapay", "whatsapp"];
  let S = null, M = [], tab = "methods";

  const msg = (t, cls) => `<div class="state ${cls || ""}">${esc(t)}</div>`;
  const val = (root, name) => (root.querySelector(`[name="${name}"]`) || {}).value;
  const chk = (root, name) => !!(root.querySelector(`[name="${name}"]`) || {}).checked;
  const nul = v => { v = (v || "").trim(); return v === "" ? null : v; };

  /* ---------- الدخول ---------- */
  async function boot() {
    if (!F.configured) {
      app.innerHTML = msg("لم يتم ربط Supabase بعد. عدّل الملف js/config.js حسب دليل الربط.", "err");
      return F.hideLoader();
    }
    const { data } = await db.auth.getSession();
    if (data.session) await enter(data.session.user); else showLogin();
    F.hideLoader();
  }

  function showLogin(err) {
    app.innerHTML = `<div class="login"><h1>FLEX</h1><p>لوحة الإدارة</p>
      ${err ? `<p class="err-txt">${esc(err)}</p>` : ""}
      <form id="lf" autocomplete="on">
        <label class="f">البريد الإلكتروني<input class="in" dir="ltr" type="email" name="email" autocomplete="username" required></label>
        <label class="f">كلمة المرور<input class="in" dir="ltr" type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn block" type="submit">تسجيل الدخول</button>
      </form></div>`;
    document.getElementById("lf").onsubmit = async e => {
      e.preventDefault();
      const f = e.target, b = f.querySelector("button");
      b.disabled = true;
      const { data, error } = await db.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) { showLogin("البريد أو كلمة المرور غير صحيحة."); return; }
      await enter(data.user);
    };
  }

  async function enter(user) {
    const { data: adm, error } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error || !adm) {
      await db.auth.signOut();
      return showLogin("هذا الحساب ليس لديه صلاحيات الإدارة.");
    }
    await reload();
  }

  async function reload() {
    const [s, m] = await Promise.all([
      db.from("site_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("payment_methods").select("*").order("sort_order")
    ]);
    if (s.error || m.error || !s.data) {
      app.innerHTML = msg("تعذر قراءة البيانات. تأكد من تشغيل ملف schema.sql بالكامل.", "err");
      return;
    }
    S = s.data; M = m.data || [];
    render();
  }

  /* ---------- حفظ مع التحقق من أن الصف تغيّر فعلاً (RLS قد يمنع بصمت) ---------- */
  async function save(table, match, values, okMsg) {
    const { data, error } = await db.from(table).update(values).match(match).select();
    if (error || !data || !data.length) {
      F.toast("لم يتم الحفظ: " + (error ? error.message : "لا توجد صلاحية أو الصف غير موجود"), "err");
      return false;
    }
    F.toast(okMsg || "تم الحفظ بنجاح", "ok");
    return true;
  }

  async function upload(file, folder) {
    if (!file) return null;
    if (!/^image\//.test(file.type)) { F.toast("اختر ملف صورة فقط", "err"); return null; }
    if (file.size > 2 * 1024 * 1024) { F.toast("حجم الصورة يجب ألا يتجاوز 2 ميجابايت", "err"); return null; }
    const ext = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png";
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await db.storage.from("branding").upload(path, file, { contentType: file.type });
    if (error) { F.toast("فشل رفع الصورة: " + error.message, "err"); return null; }
    return db.storage.from("branding").getPublicUrl(path).data.publicUrl;
  }

  /* ---------- الواجهة ---------- */
  function render() {
    const tabs = [["methods", "وسائل الدفع"], ["page", "إعدادات الصفحة"], ["qr", "QR Code"], ["account", "الحساب"]];
    app.innerHTML = `<div class="top"><b>FLEX</b><a href="../" target="_blank" rel="noopener">عرض الصفحة</a></div>
      <div class="tabs">${tabs.map(t => `<button class="tab ${tab === t[0] ? "on" : ""}" data-tab="${t[0]}">${t[1]}</button>`).join("")}</div>
      <div id="content">${({ methods: viewMethods, page: viewPage, qr: viewQr, account: viewAccount })[tab]()}</div>`;
    if (tab === "qr") drawQr();
  }

  function viewMethods() {
    const addBox = `<section class="panel"><h2>إضافة وسيلة جديدة</h2>
      <label class="f">اسم الوسيلة (مثال: Orange Cash)<input class="in" id="newname" maxlength="40"></label>
      <div class="acts"><button class="btn" data-act="addm">إضافة</button></div>
      <p class="small" style="margin-top:10px">بعد الإضافة أكمل بياناتها ثم فعّلها لتظهر للعميل.</p></section>`;
    return addBox + M.map((m, i) => `<section class="panel" data-key="${esc(m.key)}">
      <h2>${esc(m.title)}
        <span class="ord"><button data-act="up" ${i === 0 ? "disabled" : ""} aria-label="تحريك للأعلى">▲</button>
        <button data-act="down" ${i === M.length - 1 ? "disabled" : ""} aria-label="تحريك للأسفل">▼</button></span></h2>
      <label class="f">اسم الزر<input class="in" name="title" value="${esc(m.title)}" maxlength="40"></label>
      <label class="f">الوصف<input class="in" name="description" value="${esc(m.description || "")}" maxlength="80"></label>
      ${m.key !== "whatsapp" ? `<label class="f">رابط الدفع (يبدأ بـ http أو https)<input class="in" dir="ltr" name="link" value="${esc(m.link || "")}" placeholder="https://..."></label>` : ""}
      <label class="f">${LABELS[m.key] || "رقم الحساب أو بيانات الدفع (للنسخ)"}<input class="in" dir="ltr" name="account_value" value="${esc(m.account_value || "")}"></label>
      ${m.key === "whatsapp" ? `<label class="f">الرسالة الافتتاحية<textarea class="in" name="whatsapp_message" maxlength="300">${esc(m.whatsapp_message || "")}</textarea></label>` : ""}
      <div class="iconrow"><div class="prev">${F.safeUrl(m.icon_url) ? `<img src="${esc(m.icon_url)}" alt="">` : "افتراضي"}</div>
        <div><label class="btn ghost" style="display:inline-block;cursor:pointer">رفع أيقونة<input type="file" accept="image/*" data-act="icon" hidden></label>
        ${m.icon_url ? `<button class="btn ghost" data-act="rmicon">حذف الأيقونة</button>` : ""}</div></div>
      <input type="hidden" name="icon_url" value="${esc(m.icon_url || "")}">
      <div class="sw"><span>تفعيل الزر (يظهر للعميل)</span><input type="checkbox" name="enabled" ${m.enabled ? "checked" : ""}></div>
      ${m.key !== "whatsapp" ? `<div class="sw"><span>إظهار زر النسخ</span><input type="checkbox" name="show_copy" ${m.show_copy ? "checked" : ""}></div>` : ""}
      <div class="acts"><button class="btn" data-act="save">حفظ</button>${BASE.includes(m.key) ? "" : `<button class="btn ghost" data-act="delm">حذف</button>`}</div></section>`).join("");
  }

  function viewPage() {
    return `<section class="panel" id="pg"><h2>إعدادات الصفحة</h2>
      <label class="f">اسم المشروع<input class="in" name="brand_name" value="${esc(S.brand_name)}" maxlength="30"></label>
      <div class="iconrow"><div class="prev">${F.safeUrl(S.logo_url) ? `<img src="${esc(S.logo_url)}" alt="">` : "نص"}</div>
        <div><label class="btn ghost" style="display:inline-block;cursor:pointer">رفع الشعار<input type="file" accept="image/*" data-act="logo" hidden></label>
        ${S.logo_url ? `<button class="btn ghost" data-act="rmlogo">حذف الشعار</button>` : ""}</div></div>
      <p class="hint">بدون شعار يظهر اسم المشروع كنص.</p>
      <label class="f">عبارة الترحيب<input class="in" name="welcome_title" value="${esc(S.welcome_title)}" maxlength="60"></label>
      <label class="f">العبارة الفرعية<input class="in" name="welcome_subtitle" value="${esc(S.welcome_subtitle)}" maxlength="100"></label>
      <label class="f">ملاحظة أسفل الصفحة<textarea class="in" name="disclaimer" maxlength="300">${esc(S.disclaimer)}</textarea></label>
      <label class="f">لون الخلفية<input class="in" type="color" name="bg_color" value="${esc(S.bg_color)}"></label>
      <label class="f">اللون الأساسي (الأيقونات والعناوين)<input class="in" type="color" name="accent_color" value="${esc(S.accent_color)}"></label>
      <div class="acts"><button class="btn" data-act="savepage">حفظ الإعدادات</button><button class="btn ghost" data-act="resetcolors">الألوان الافتراضية</button></div></section>`;
  }

  function siteUrl() {
    return location.origin + location.pathname.replace(/admin\/(index\.html)?$/, "");
  }
  function viewQr() {
    return `<section class="panel"><h2>QR Code الرئيسي</h2>
      <p class="small">الكود يحتوي رابط الصفحة فقط، لذلك يبقى ثابتاً مهما غيّرت الأرقام والروابط.</p>
      <label class="f">رابط الموقع<input class="in" dir="ltr" id="qrurl" value="${esc(siteUrl())}"></label>
      <div class="qrbox"><canvas id="qrc"></canvas></div>
      <div class="acts"><button class="btn" data-act="qrdl">تحميل PNG للطباعة</button><button class="btn ghost" data-act="qrcopy">نسخ الرابط</button></div>
      <p class="small" style="margin-top:12px">الصورة بدقة 2000×2000 ومستوى تصحيح أخطاء عالٍ (H). جرّب مسحها من أكثر من هاتف قبل الطباعة.</p></section>`;
  }
  function qrOpts(el, size) {
    return { element: el, value: document.getElementById("qrurl").value.trim(), size, padding: Math.round(size / 12), level: "H", background: "#ffffff", foreground: "#000000" };
  }
  function drawQr() {
    const inp = document.getElementById("qrurl");
    if (!window.QRious) { document.getElementById("content").innerHTML = msg("تعذر تحميل مكتبة QR. تحقق من الاتصال.", "err"); return; }
    const go = () => new QRious(qrOpts(document.getElementById("qrc"), 600));
    inp.oninput = go; go();
  }

  function viewAccount() {
    return `<section class="panel"><h2>تغيير كلمة المرور</h2>
      <label class="f">كلمة المرور الجديدة (8 أحرف على الأقل)<input class="in" dir="ltr" type="password" id="np" autocomplete="new-password"></label>
      <div class="acts"><button class="btn" data-act="pw">تغيير كلمة المرور</button></div></section>
      <section class="panel"><button class="btn ghost block" data-act="logout">تسجيل الخروج</button></section>`;
  }

  /* ---------- الأحداث ---------- */
  async function saveMethod(card) {
    const key = card.dataset.key, m = M.find(x => x.key === key);
    const v = {
      title: (val(card, "title") || "").trim(), description: nul(val(card, "description")),
      account_value: nul(val(card, "account_value")), icon_url: nul(val(card, "icon_url")),
      enabled: chk(card, "enabled")
    };
    if (!v.title) return F.toast("اسم الزر مطلوب", "err");
    if (key !== "whatsapp") {
      v.link = nul(val(card, "link")); v.show_copy = chk(card, "show_copy");
      if (v.link && !F.safeUrl(v.link)) return F.toast("الرابط غير صحيح. يجب أن يبدأ بـ http:// أو https://", "err");
      if (v.enabled && !v.link && !v.account_value) return F.toast("أدخل رابطاً أو بيانات دفع قبل التفعيل", "err");
    } else {
      v.whatsapp_message = nul(val(card, "whatsapp_message"));
      if (v.account_value && !F.waNumber(v.account_value)) return F.toast("رقم واتساب غير صحيح", "err");
      if (v.enabled && !F.waNumber(v.account_value)) return F.toast("أدخل رقم واتساب صحيحاً قبل التفعيل", "err");
    }
    if (await save("payment_methods", { key }, v, `تم حفظ ${v.title}`)) await reload();
  }

  async function addMethod() {
    const title = (document.getElementById("newname").value || "").trim();
    if (!title) return F.toast("اكتب اسم الوسيلة", "err");
    const key = "custom_" + Date.now().toString(36);
    const order = M.reduce((a, x) => Math.max(a, x.sort_order || 0), 0) + 1;
    const { data, error } = await db.from("payment_methods")
      .insert({ key, title, enabled: false, show_copy: true, sort_order: order }).select();
    if (error || !data || !data.length) return F.toast("تعذرت الإضافة: " + (error ? error.message : "شغّل ملف SQL الجديد أولاً"), "err");
    F.toast("تمت الإضافة. أكمل بياناتها ثم فعّلها");
    await reload();
  }

  async function delMethod(key) {
    if (!confirm("حذف هذه الوسيلة نهائياً؟")) return;
    const { data, error } = await db.from("payment_methods").delete().eq("key", key).select();
    if (error || !data || !data.length) return F.toast("تعذر الحذف: " + (error ? error.message : "لا توجد صلاحية"), "err");
    F.toast("تم الحذف");
    await reload();
  }

  async function move(key, dir) {
    const i = M.findIndex(x => x.key === key), j = i + dir;
    if (j < 0 || j >= M.length) return;
    const arr = M.slice(); [arr[i], arr[j]] = [arr[j], arr[i]];
    let ok = true;
    for (let n = 0; n < arr.length && ok; n++) ok = await save("payment_methods", { key: arr[n].key }, { sort_order: n + 1 }, "تم تغيير الترتيب");
    await reload();
  }

  async function savePage(box) {
    const v = {
      brand_name: (val(box, "brand_name") || "").trim(), welcome_title: (val(box, "welcome_title") || "").trim(),
      welcome_subtitle: (val(box, "welcome_subtitle") || "").trim(), disclaimer: (val(box, "disclaimer") || "").trim(),
      bg_color: val(box, "bg_color"), accent_color: val(box, "accent_color")
    };
    if (!v.brand_name || !v.welcome_title) return F.toast("اسم المشروع وعبارة الترحيب مطلوبان", "err");
    if (!F.isHex(v.bg_color) || !F.isHex(v.accent_color)) return F.toast("لون غير صحيح", "err");
    if (await save("site_settings", { id: 1 }, v, "تم حفظ إعدادات الصفحة")) await reload();
  }

  app.addEventListener("click", async e => {
    const t = e.target.closest("[data-tab],[data-act]");
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; return render(); }
    const act = t.dataset.act, card = t.closest("[data-key]");
    if (t.tagName === "BUTTON") t.disabled = true;
    try {
      if (act === "save") await saveMethod(card);
      else if (act === "addm") await addMethod();
      else if (act === "delm") await delMethod(card.dataset.key);
      else if (act === "up" || act === "down") await move(card.dataset.key, act === "up" ? -1 : 1);
      else if (act === "rmicon") { if (await save("payment_methods", { key: card.dataset.key }, { icon_url: null }, "تم حذف الأيقونة")) await reload(); }
      else if (act === "savepage") await savePage(document.getElementById("pg"));
      else if (act === "rmlogo") { if (await save("site_settings", { id: 1 }, { logo_url: null }, "تم حذف الشعار")) await reload(); }
      else if (act === "resetcolors") { if (await save("site_settings", { id: 1 }, { bg_color: "#0a0a0a", accent_color: "#ffffff" })) await reload(); }
      else if (act === "qrdl") {
        const c = document.createElement("canvas"); new QRious(qrOpts(c, 2000));
        const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = "FLEX-QR.png"; a.click();
      }
      else if (act === "qrcopy") F.toast((await F.copy(document.getElementById("qrurl").value)) ? "تم نسخ الرابط" : "تعذر النسخ", "ok");
      else if (act === "pw") {
        const p = document.getElementById("np").value;
        if (p.length < 8) F.toast("كلمة المرور يجب ألا تقل عن 8 أحرف", "err");
        else { const { error } = await db.auth.updateUser({ password: p }); error ? F.toast("تعذر التغيير: " + error.message, "err") : (F.toast("تم تغيير كلمة المرور"), document.getElementById("np").value = ""); }
      }
      else if (act === "logout") { await db.auth.signOut(); showLogin(); }
    } finally { if (t.isConnected && t.tagName === "BUTTON") t.disabled = false; }
  });

  /* رفع الأيقونة/الشعار: يُحفظ تلقائياً بعد الرفع */
  app.addEventListener("change", async e => {
    const inp = e.target.closest('input[type=file]');
    if (!inp) return;
    const file = inp.files[0];
    if (inp.dataset.act === "icon") {
      const card = inp.closest("[data-key]"), url = await upload(file, "icons");
      if (url && await save("payment_methods", { key: card.dataset.key }, { icon_url: url }, "تم رفع الأيقونة")) await reload();
    } else if (inp.dataset.act === "logo") {
      const url = await upload(file, "logo");
      if (url && await save("site_settings", { id: 1 }, { logo_url: url }, "تم رفع الشعار")) await reload();
    }
  });

  boot();
})();
