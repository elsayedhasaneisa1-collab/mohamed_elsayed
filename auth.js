/* ═══════════════════════════════════════════════════════════════
   منصة الأستاذ محمد عيسى — منطق المصادقة
   Supabase Auth + التحقق + Toast + تيليجرام + تحويل حسب الدور
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://tqtaxueaemetovamewkf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TIbJWVuDK8VNC07JxaL6KQ_XZdiO9Od';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TG_LINK = 'https://t.me/sayoda_elgadar';
const GRADES_THANWY = ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'];

/* ═══════════════════════════════════════════════════════════════
   Toast
   ═══════════════════════════════════════════════════════════════ */
const Toast = {
  stack: null,
  init() { this.stack = document.getElementById('toastStack'); },

  show(type, title, message, duration = 4200) {
    if (!this.stack) return;
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      warn: 'fa-triangle-exclamation',
      info: 'fa-circle-info',
      gold: 'fa-star'
    };
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <div class="toast__ic"><i class="fa-solid ${icons[type] || icons.info}"></i></div>
      <div class="toast__body">
        <strong>${title}</strong>
        ${message ? `<p>${message}</p>` : ''}
      </div>
      <button class="toast__x" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>
      <div class="toast__bar" style="animation-duration:${duration}ms"></div>
    `;
    this.stack.appendChild(toast);
    const remove = () => {
      toast.classList.add('is-out');
      setTimeout(() => toast.remove(), 300);
    };
    toast.querySelector('.toast__x').addEventListener('click', remove);
    setTimeout(remove, duration);
  },

  success(t, m) { this.show('success', t, m); },
  error(t, m)   { this.show('error', t, m, 5200); },
  warn(t, m)    { this.show('warn', t, m); },
  info(t, m)    { this.show('info', t, m); },
  gold(t, m)    { this.show('gold', t, m); }
};

/* ─────────────── أدوات ─────────────── */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function setFieldState(field, state) {
  if (!field) return;
  field.classList.remove('is-invalid', 'is-ok');
  if (state) field.classList.add(`is-${state}`);
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  const textEl = btn.querySelector('.btn__text');
  const loadEl = btn.querySelector('.btn__loader');
  if (textEl) textEl.hidden = loading;
  if (loadEl) loadEl.hidden = !loading;
  btn.disabled = loading;
}

/* ═══════════════════════════════════════════════════════════════
   Validators
   ═══════════════════════════════════════════════════════════════ */
const Validators = {
  username(v) {
    if (!v) return { ok: false, msg: 'من فضلك أدخل اسم المستخدم' };
    if (v.length < 3) return { ok: false, msg: 'اسم المستخدم 3 أحرف على الأقل' };
    if (v.length > 20) return { ok: false, msg: 'اسم المستخدم 20 حرف كحد أقصى' };
    if (!/^[a-zA-Z0-9_]+$/.test(v)) return { ok: false, msg: 'إنجليزي، أرقام، أو _ فقط' };
    return { ok: true };
  },
  fullname(v) {
    if (!v) return { ok: false, msg: 'من فضلك أدخل الاسم' };
    const parts = v.trim().split(/\s+/);
    if (parts.length < 4) return { ok: false, msg: 'الاسم لازم يكون رباعي (4 كلمات)' };
    return { ok: true };
  },
  password(v) {
    if (!v) return { ok: false, msg: 'من فضلك أدخل كلمة السر' };
    if (v.length < 6) return { ok: false, msg: 'كلمة السر 6 أحرف على الأقل' };
    return { ok: true };
  },
  phone(v) {
    if (!v) return { ok: false, msg: 'من فضلك أدخل رقم هاتفك' };
    if (!/^01[0125][0-9]{8}$/.test(v)) return { ok: false, msg: 'رقم الهاتف غير صالح (11 رقم يبدأ بـ 01)' };
    return { ok: true };
  },
  parentPhone(v) {
    if (!v) return { ok: false, msg: 'من فضلك أدخل رقم ولي الأمر' };
    if (!/^01[0125][0-9]{8}$/.test(v)) return { ok: false, msg: 'رقم ولي الأمر غير صالح (11 رقم يبدأ بـ 01)' };
    return { ok: true };
  },
  grade(v) {
    if (!v) return { ok: false, msg: 'من فضلك اختر الصف الدراسي' };
    return { ok: true };
  }
};

function passwordStrength(pwd) {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return Math.min(score, 4);
}
const STRENGTH_LABELS = ['—', 'ضعيف', 'متوسط', 'قوي', 'قوي جداً'];

/* ─────────────── زرار العين ─────────────── */
function initPasswordToggles() {
  $$('.field__toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.toggle;
      const input = document.getElementById(inputId);
      if (!input) return;
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      btn.classList.toggle('is-open', isPwd);
      const icon = btn.querySelector('i');
      if (icon) icon.className = isPwd ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   صفحة تسجيل الدخول
   ═══════════════════════════════════════════════════════════════ */
function initLoginPage() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const btn = document.getElementById('loginBtn');

  usernameInput?.addEventListener('blur', () => {
    setFieldState(usernameInput.closest('.field'), usernameInput.value.trim() ? 'ok' : 'invalid');
  });
  passwordInput?.addEventListener('blur', () => {
    setFieldState(passwordInput.closest('.field'), passwordInput.value ? 'ok' : 'invalid');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    let valid = true;
    if (!username) { setFieldState(usernameInput.closest('.field'), 'invalid'); valid = false; }
    if (!password) { setFieldState(passwordInput.closest('.field'), 'invalid'); valid = false; }
    if (!valid) { Toast.warn('تحقق من البيانات', 'من فضلك املأ كل الحقول'); return; }

    setBtnLoading(btn, true);

    try {
      const email = `${username}@manassa.local`;
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (error) {
        let msg = 'اسم المستخدم أو كلمة السر غير صحيحة';
        if (error.message?.includes('Email not confirmed')) msg = 'الإيميل لسه ما اتفعلش';
        Toast.error('فشل تسجيل الدخول', msg);
        setBtnLoading(btn, false);
        return;
      }

      const { data: profileData } = await supabaseClient
        .from('profiles')
        .select('role, is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      const role = profileData?.role || 'student';
      const isActive = profileData?.is_active === true;

      if (role === 'admin') {
        Toast.success('أهلاً بيك 👋', 'جارٍ التحويل...');
        setTimeout(() => { window.location.href = 'admin.html'; }, 900);
        return;
      }

      if (!isActive) {
        await supabaseClient.auth.signOut();
        Toast.warn('حسابك قيد المراجعة ⏳', 'هيتم تفعيل حسابك قريباً من قِبل الإدارة');
        setBtnLoading(btn, false);
        return;
      }

      Toast.success('أهلاً بيك 👋', 'جارٍ التحويل...');
      setTimeout(() => { window.location.href = 'index.html'; }, 900);

    } catch (err) {
      console.error(err);
      Toast.error('حدث خطأ', 'حاول تاني بعد شوية');
      setBtnLoading(btn, false);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   صفحة إنشاء الحساب
   ═══════════════════════════════════════════════════════════════ */
function initSignupPage() {
  const form = document.getElementById('signupForm');
  if (!form) return;

  const usernameInput    = document.getElementById('signupUsername');
  const fullnameInput    = document.getElementById('signupFullname');
  const passwordInput    = document.getElementById('signupPassword');
  const phoneInput       = document.getElementById('signupPhone');
  const parentPhoneInput = document.getElementById('signupParentPhone');
  const gradeSelect      = document.getElementById('signupGrade');
  const termsCheckbox    = document.getElementById('signupTerms');
  const termsRow         = document.getElementById('termsRow');
  const branchSection    = document.getElementById('branchSection');
  const strengthMeter    = document.getElementById('strengthMeter');
  const strengthText     = document.getElementById('strengthText');
  const btn = document.getElementById('signupBtn');

  /* التحقق الفوري */
  usernameInput?.addEventListener('input', () => {
    const res = Validators.username(usernameInput.value.trim());
    setFieldState(usernameInput.closest('.field'),
      usernameInput.value ? (res.ok ? 'ok' : 'invalid') : null);
  });

  fullnameInput?.addEventListener('input', () => {
    const res = Validators.fullname(fullnameInput.value.trim());
    setFieldState(fullnameInput.closest('.field'),
      fullnameInput.value ? (res.ok ? 'ok' : 'invalid') : null);
  });

  passwordInput?.addEventListener('input', () => {
    const pwd = passwordInput.value;
    const level = passwordStrength(pwd);
    strengthMeter.dataset.level = level;
    strengthText.textContent = STRENGTH_LABELS[level];
    setFieldState(passwordInput.closest('.field'),
      pwd ? (pwd.length >= 6 ? 'ok' : 'invalid') : null);
  });

  phoneInput?.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 11);
    const res = Validators.phone(phoneInput.value);
    setFieldState(phoneInput.closest('.field'),
      phoneInput.value ? (res.ok ? 'ok' : 'invalid') : null);
  });

  parentPhoneInput?.addEventListener('input', () => {
    parentPhoneInput.value = parentPhoneInput.value.replace(/\D/g, '').slice(0, 11);
    const res = Validators.parentPhone(parentPhoneInput.value);
    setFieldState(parentPhoneInput.closest('.field'),
      parentPhoneInput.value ? (res.ok ? 'ok' : 'invalid') : null);
  });

  gradeSelect?.addEventListener('change', () => {
    setFieldState(gradeSelect.closest('.field'), gradeSelect.value ? 'ok' : 'invalid');
    updateBranchVisibility();
  });

  $$('input[name="type"]').forEach(radio => {
    radio.addEventListener('change', updateBranchVisibility);
  });

  function updateBranchVisibility() {
    const grade = gradeSelect.value;
    const type  = document.querySelector('input[name="type"]:checked')?.value;
    const isThanwy = GRADES_THANWY.includes(grade);
    const shouldShow = isThanwy && type === 'أزهر';

    if (shouldShow && branchSection.hidden) {
      branchSection.hidden = false;
    } else if (!shouldShow && !branchSection.hidden) {
      branchSection.hidden = true;
      $$('input[name="branch"]').forEach(r => r.checked = false);
    }
  }

  termsCheckbox?.addEventListener('change', () => {
    termsRow.classList.toggle('is-invalid', !termsCheckbox.checked);
  });

  /* الإرسال */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username    = usernameInput.value.trim();
    const fullname    = fullnameInput.value.trim();
    const password    = passwordInput.value;
    const phone       = phoneInput.value.trim();
    const parentPhone = parentPhoneInput.value.trim();
    const grade       = gradeSelect.value;
    const type        = document.querySelector('input[name="type"]:checked')?.value || null;
    const branch      = document.querySelector('input[name="branch"]:checked')?.value || null;
    const terms       = termsCheckbox.checked;

    let valid = true;
    const errs = [];

    const uRes = Validators.username(username);
    if (!uRes.ok) { setFieldState(usernameInput.closest('.field'), 'invalid'); errs.push(uRes.msg); valid = false; }

    const fRes = Validators.fullname(fullname);
    if (!fRes.ok) { setFieldState(fullnameInput.closest('.field'), 'invalid'); errs.push(fRes.msg); valid = false; }

    const pRes = Validators.password(password);
    if (!pRes.ok) { setFieldState(passwordInput.closest('.field'), 'invalid'); errs.push(pRes.msg); valid = false; }

    const phoneRes = Validators.phone(phone);
    if (!phoneRes.ok) { setFieldState(phoneInput.closest('.field'), 'invalid'); errs.push(phoneRes.msg); valid = false; }

    const phRes = Validators.parentPhone(parentPhone);
    if (!phRes.ok) { setFieldState(parentPhoneInput.closest('.field'), 'invalid'); errs.push(phRes.msg); valid = false; }

    if (!type) { errs.push('من فضلك اختر النوع (عام / أزهر)'); valid = false; }

    const gRes = Validators.grade(grade);
    if (!gRes.ok) { setFieldState(gradeSelect.closest('.field'), 'invalid'); errs.push(gRes.msg); valid = false; }

    if (GRADES_THANWY.includes(grade) && type === 'أزهر' && !branch) {
      errs.push('من فضلك اختر الفرع (علمي / أدبي)');
      valid = false;
    }

    if (!terms) {
      termsRow.classList.add('is-invalid');
      errs.push('لازم توافق على الشروط');
      valid = false;
    }

    if (!valid) { Toast.warn('تحقق من البيانات', errs[0] || 'من فضلك املأ كل الحقول'); return; }

    setBtnLoading(btn, true);

    try {
      const { data: existing } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (existing) {
        setFieldState(usernameInput.closest('.field'), 'invalid');
        Toast.error('اسم المستخدم مأخوذ', 'جرّب اسم تاني');
        setBtnLoading(btn, false);
        return;
      }

      const email = `${username}@manassa.local`;

      const { data: authData, error: authErr } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            full_name: fullname,
            phone,
            parent_phone: parentPhone,
            grade,
            type,
            branch
          }
        }
      });

      if (authErr) {
        let msg = 'حدث خطأ أثناء إنشاء الحساب';
        if (authErr.message?.includes('already registered')) msg = 'اسم المستخدم مأخوذ';
        else if (authErr.message?.includes('password')) msg = 'كلمة السر ضعيفة جداً';
        Toast.error('فشل التسجيل', msg);
        setBtnLoading(btn, false);
        return;
      }

      if (authData?.user?.id) {
        const { data: profileCheck } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (!profileCheck) {
          await supabaseClient.from('profiles').insert({
            id: authData.user.id,
            username,
            full_name: fullname,
            phone,
            parent_phone: parentPhone,
            grade,
            type,
            branch: branch || null,
            role: 'student',
            is_active: false
          });
        }
      }

      Toast.success('تم إنشاء حسابك 🎉', 'حسابك الآن قيد المراجعة من الإدارة');

      const modal = document.getElementById('successModal');
      if (modal) modal.hidden = false;

    } catch (err) {
      console.error(err);
      Toast.error('حدث خطأ', 'حاول تاني بعد شوية');
      setBtnLoading(btn, false);
    }
  });
}

/* ─────────────── Reveal ─────────────── */
function initReveal() {
  requestAnimationFrame(() => {
    $$('.reveal').forEach(el => {
      setTimeout(() => el.classList.add('is-visible'), 50);
    });
  });
}

/* ─────────────── تحويل لو داخل ─────────────── */
async function redirectIfLoggedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', session.user.id)
    .maybeSingle();

  const role = profile?.role || 'student';
  const isActive = profile?.is_active === true;

  if (role === 'admin') { window.location.href = 'admin.html'; return; }
  if (!isActive) { await supabaseClient.auth.signOut(); return; }
  window.location.href = 'index.html';
}

/* ─────────────── Service Worker ─────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW error:', err));
  });
}

/* ─────────────── التهيئة ─────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();
  initPasswordToggles();
  initReveal();

  // ⚠️ نعمل التحويل التلقائي بس في صفحات المصادقة
  const isAuthPage = document.getElementById('loginForm') || document.getElementById('signupForm');

  if (isAuthPage) {
    await redirectIfLoggedIn();

    if (document.getElementById('loginForm')) {
      initLoginPage();
    } else if (document.getElementById('signupForm')) {
      initSignupPage();
    }
  }
});