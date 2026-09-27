/* ═══════════════════════════════════════════════════════════════
   auth.js — منصة الأستاذ محمد عيسى
   مصادقة + Toast + $ و $$ + Supabase
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────── Supabase ─────────────── */
const SUPABASE_URL = 'https://tqtaxueaemetovamewkf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TIbJWVuDK8VNC07JxaL6KQ_XZdiO9Od';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ─────────────── أدوات ─────────────── */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const GRADES_THANWY = ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'];

/* ─────────────── Toast ─────────────── */
const Toast = {
  stack: null,
  init() { this.stack = document.getElementById('toastStack'); },

  show(type, title, message, duration = 4000) {
    if (!this.stack) return;

    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      warn: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
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
  error(t, m)   { this.show('error', t, m, 5000); },
  warn(t, m)    { this.show('warn', t, m); },
  info(t, m)    { this.show('info', t, m); }
};

/* ─────────────── أدوات ─────────────── */
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

/* ─────────────── Validators ─────────────── */
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
    if (parts.length < 4) return { ok: false, msg: 'الاسم لازم رباعي' };
    return { ok: true };
  },
  password(v) {
    if (!v) return { ok: false, msg: 'من فضلك أدخل كلمة السر' };
    if (v.length < 6) return { ok: false, msg: 'كلمة السر 6 أحرف على الأقل' };
    return { ok: true };
  },
  phone(v) {
    if (!v) return { ok: false, msg: 'من فضلك أدخل رقم هاتفك' };
    if (!/^01[0125][0-9]{8}$/.test(v)) return { ok: false, msg: 'رقم غير صالح' };
    return { ok: true };
  },
  parentPhone(v) {
    if (!v) return { ok: false, msg: 'من فضلك أدخل رقم ولي الأمر' };
    if (!/^01[0125][0-9]{8}$/.test(v)) return { ok: false, msg: 'رقم غير صالح' };
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

/* ─────────────── Reveal ─────────────── */
function initReveal() {
  requestAnimationFrame(() => {
    $$('.reveal').forEach(el => {
      setTimeout(() => el.classList.add('is-visible'), 50);
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      Toast.warn('تحقق من البيانات', 'املأ كل الحقول');
      return;
    }

    setBtnLoading(btn, true);

    try {
      const email = `${username}@manassa.local`;
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (error) {
        Toast.error('فشل تسجيل الدخول', 'اسم المستخدم أو كلمة السر غير صحيحة');
        setBtnLoading(btn, false);
        return;
      }

      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role, is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      const role = profile?.role || 'student';
      const isActive = profile?.is_active === true;

      // ═══ الأدمن والمدرس ═══
      if (role === 'admin' || role === 'teacher') {
        if (!isActive) {
          await supabaseClient.auth.signOut();
          Toast.warn('حسابك قيد المراجعة', 'انتظر تفعيل الإدارة');
          setBtnLoading(btn, false);
          return;
        }
        Toast.success('أهلاً بيك 👋', 'جارٍ التحويل...');
        setTimeout(() => { window.location.href = 'admin.html'; }, 700);
        return;
      }

      // ═══ الطالب ═══
      if (!isActive) {
        await supabaseClient.auth.signOut();
        Toast.warn('حسابك قيد المراجعة', 'انتظر تفعيل الإدارة');
        setBtnLoading(btn, false);
        return;
      }

      Toast.success('أهلاً بيك 👋', 'جارٍ التحويل...');
      setTimeout(() => { window.location.href = 'index.html'; }, 700);

    } catch (err) {
      console.error(err);
      Toast.error('خطأ', 'حاول تاني');
      setBtnLoading(btn, false);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   صفحة التسجيل
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

  usernameInput?.addEventListener('input', () => {
    const res = Validators.username(usernameInput.value.trim());
    setFieldState(usernameInput.closest('.field'), usernameInput.value ? (res.ok ? 'ok' : 'invalid') : null);
  });

  fullnameInput?.addEventListener('input', () => {
    const res = Validators.fullname(fullnameInput.value.trim());
    setFieldState(fullnameInput.closest('.field'), fullnameInput.value ? (res.ok ? 'ok' : 'invalid') : null);
  });

  passwordInput?.addEventListener('input', () => {
    const pwd = passwordInput.value;
    const level = passwordStrength(pwd);
    if (strengthMeter) strengthMeter.dataset.level = level;
    if (strengthText) strengthText.textContent = STRENGTH_LABELS[level];
    setFieldState(passwordInput.closest('.field'), pwd ? (pwd.length >= 6 ? 'ok' : 'invalid') : null);
  });

  phoneInput?.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 11);
    const res = Validators.phone(phoneInput.value);
    setFieldState(phoneInput.closest('.field'), phoneInput.value ? (res.ok ? 'ok' : 'invalid') : null);
  });

  parentPhoneInput?.addEventListener('input', () => {
    parentPhoneInput.value = parentPhoneInput.value.replace(/\D/g, '').slice(0, 11);
    const res = Validators.parentPhone(parentPhoneInput.value);
    setFieldState(parentPhoneInput.closest('.field'), parentPhoneInput.value ? (res.ok ? 'ok' : 'invalid') : null);
  });

  gradeSelect?.addEventListener('change', () => {
    setFieldState(gradeSelect.closest('.field'), gradeSelect.value ? 'ok' : 'invalid');
    updateBranch();
  });

  $$('input[name="type"]').forEach(r => r.addEventListener('change', updateBranch));

  function updateBranch() {
    const grade = gradeSelect.value;
    const type = document.querySelector('input[name="type"]:checked')?.value;
    const show = GRADES_THANWY.includes(grade) && type === 'أزهر';
    branchSection.hidden = !show;
    if (!show) $$('input[name="branch"]').forEach(r => r.checked = false);
  }

  termsCheckbox?.addEventListener('change', () => {
    termsRow.classList.toggle('is-invalid', !termsCheckbox.checked);
  });

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

    const errs = [];
    if (!Validators.username(username).ok) errs.push('اسم المستخدم غير صالح');
    if (!Validators.fullname(fullname).ok) errs.push('الاسم لازم رباعي');
    if (!Validators.password(password).ok) errs.push('كلمة السر 6 أحرف على الأقل');
    if (!Validators.phone(phone).ok) errs.push('رقم الهاتف غير صالح');
    if (!Validators.parentPhone(parentPhone).ok) errs.push('رقم ولي الأمر غير صالح');
    if (!grade) errs.push('اختر الصف');
    if (!type) errs.push('اختر النوع');
    if (GRADES_THANWY.includes(grade) && type === 'أزهر' && !branch) errs.push('اختر الفرع');
    if (!terms) errs.push('وافق على الشروط');

    if (errs.length) {
      Toast.warn('تحقق من البيانات', errs[0]);
      return;
    }

    setBtnLoading(btn, true);

    try {
    if (existingPhone) {
  const field = phoneInput.closest('.field');
  // شيل أي كلاس قديم
  field.classList.remove('is-invalid', 'is-ok');
  // ضيف كلاس "مأخوذ" — بتأثير أحمر نابض
  field.classList.add('is-taken');

  Toast.error('رقم الهاتف مسجل بالفعل', 'الرقم ده مستخدم لحساب تاني');
  setBtnLoading(btn, false);

  // رجّع الحقل طبيعي لما المستخدم يعدّل
  phoneInput.addEventListener('input', function handler() {
    field.classList.remove('is-taken');
    phoneInput.removeEventListener('input', handler);
  });

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
        Toast.error('فشل التسجيل', authErr.message);
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

      Toast.success('تم إنشاء حسابك 🎉', 'حسابك قيد المراجعة');
      const modal = document.getElementById('successModal');
      if (modal) modal.hidden = false;

    } catch (err) {
      console.error(err);
      Toast.error('خطأ', err.message);
      setBtnLoading(btn, false);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   التهيئة
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  initPasswordToggles();
  initReveal();

  if (document.getElementById('loginForm')) initLoginPage();
  else if (document.getElementById('signupForm')) initSignupPage();
});