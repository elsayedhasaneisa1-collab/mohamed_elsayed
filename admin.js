/* ═══════════════════════════════════════════════════════════════
   admin.js — لوحة التحكم
   منصة الأستاذ محمد عيسى
   يدعم: الأدمن (كل الصلاحيات) + المدرس (قراءة + تنزيل PDF)
   ⚠️ $ و $$ معرّفين في auth.js
   ⚠️ UI.confirm و UI.alert في ui.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let cache = { pending: [], students: [], exams: [], attempts: [], pdf: [] };

/* ═══════════════════════════════════════════════════════════════
   الإحصائيات
   ═══════════════════════════════════════════════════════════════ */
async function loadStats() {
  try {
    const { data: profilesData } = await supabaseClient
      .from('profiles')
      .select('is_active, role')
      .eq('role', 'student')
      .limit(1000);

    const students = profilesData || [];
    const pendingCount = students.filter(s => !s.is_active).length;
    const studentsCount = students.filter(s => s.is_active).length;

    const { data: examsData } = await supabaseClient
      .from('exams')
      .select('status, closes_at')
      .limit(500);

    const exams = examsData || [];
    const examsCount = exams.length;
    const now = new Date();
    const liveCount = exams.filter(e =>
      e.status === 'published' && new Date(e.closes_at) > now
    ).length;

    setText('statPending', pendingCount);
    setText('statStudents', studentsCount);
    setText('statExams', examsCount);
    setText('statLive', liveCount);

    const [attemptsRes, pdfRes] = await Promise.all([
      supabaseClient.from('attempts').select('id', { count: 'exact', head: true }),
      supabaseClient.from('attempts').select('id', { count: 'exact', head: true }).eq('pdf_exported', true)
    ]);

    const attemptsCount = attemptsRes.count ?? 0;
    const pdfCount = pdfRes.count ?? 0;

    setText('statAttempts', attemptsCount);
    setText('statPdf', pdfCount);

    setText('cntPending', pendingCount);
    setText('cntStudents', studentsCount);
    setText('cntExams', examsCount);
    setText('cntAttempts', attemptsCount);
    setText('cntPdf', attemptsCount);

  } catch (err) {
    console.error('Stats error:', err);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ═══════════════════════════════════════════════════════════════
   Tabs + Lazy Loading
   ═══════════════════════════════════════════════════════════════ */
function initTabs() {
  const loaded = { pending: true };

  $$('.admin-tabs__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      $$('.admin-tabs__btn').forEach(b => b.classList.toggle('is-active', b === btn));
      $$('.admin-panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === tab));

      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === 'students') loadStudents();
        else if (tab === 'exams') loadExams();
        else if (tab === 'attempts') loadAttempts();
        else if (tab === 'pdf') loadPdfList();
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   1. قيد المراجعة
   ═══════════════════════════════════════════════════════════════ */
async function loadPending() {
  const c = document.getElementById('pendingContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, username, full_name, phone, parent_phone, grade, type, branch, created_at')
      .eq('role', 'student')
      .eq('is_active', false)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.pending = data || [];

    if (!data?.length) {
      c.innerHTML = emptyState('fa-circle-check', 'مفيش حسابات قيد المراجعة', 'كل الحسابات اتفعلت');
      return;
    }

    c.innerHTML = `<div class="cards-mobile">${data.map(pendingCard).join('')}</div>`;
    bindPendingActions();

  } catch (err) {
    console.error(err);
    c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تحدّث الصفحة');
  }
}

function pendingCard(p) {
  const actions = isAdmin
    ? `
      <div class="mcard__acts">
        <button class="btn btn--gold btn--sm" data-action="approve" data-id="${p.id}">
          <i class="fa-solid fa-check"></i> موافقة
        </button>
        <button class="btn btn--danger btn--sm" data-action="reject" data-id="${p.id}">
          <i class="fa-solid fa-xmark"></i> رفض
        </button>
      </div>
    `
    : `<div class="mcard__acts"><span class="badge badge--mut"><i class="fa-solid fa-eye"></i> عرض فقط</span></div>`;

  return `
    <div class="mcard" data-id="${p.id}">
      <div class="mcard__top">
        <h4>${escapeHtml(p.full_name)}</h4>
        <span class="badge badge--warn"><i class="fa-solid fa-clock"></i> قيد المراجعة</span>
      </div>
      <div class="mcard__rows">
        <div><b>المستخدم:</b> <span dir="ltr">${escapeHtml(p.username)}</span></div>
        <div><b>هاتف الطالب:</b> <span dir="ltr">${escapeHtml(p.phone || '—')}</span></div>
        <div><b>ولي الأمر:</b> <span dir="ltr">${escapeHtml(p.parent_phone || '—')}</span></div>
        <div><b>الصف:</b> ${escapeHtml(p.grade)}</div>
        <div><b>النوع:</b> ${escapeHtml(p.type)}${p.branch ? ' - ' + escapeHtml(p.branch) : ''}</div>
        <div><b>التسجيل:</b> ${formatDate(p.created_at)}</div>
      </div>
      ${actions}
    </div>
  `;
}

function bindPendingActions() {
  if (!isAdmin) return;

  $$('#pendingContainer [data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const card = btn.closest('.mcard');
      const name = card.querySelector('h4').textContent;

      try {
        if (action === 'approve') {
          const ok = await UI.confirm({
            type: 'success',
            title: 'تفعيل الحساب؟',
            message: `سيتم تفعيل حساب "${name}" ويقدر يدخل المنصة.`,
            confirmText: 'تفعيل',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

          const { error } = await supabaseClient
            .from('profiles')
            .update({ is_active: true })
            .eq('id', id);
          if (error) throw error;
          Toast.success('تم التفعيل', `تم تفعيل حساب ${name}`);

        } else {
          const ok = await UI.confirm({
            type: 'danger',
            title: 'رفض وحذف الحساب؟',
            message: `سيتم حذف حساب "${name}" نهائياً. لا يمكن التراجع.`,
            confirmText: 'حذف نهائي',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

          const { error } = await supabaseClient.from('profiles').delete().eq('id', id);
          if (error) throw error;
          Toast.warn('تم الرفض', `تم حذف حساب ${name}`);
        }

        card.style.opacity = '0';
        card.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          loadPending();
          loadStats();
        }, 300);

      } catch (err) {
        console.error(err);
        Toast.error('خطأ', err.message || 'حاول تاني');
        btn.disabled = false;
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   2. الطلاب
   ═══════════════════════════════════════════════════════════════ */
async function loadStudents() {
  const c = document.getElementById('studentsContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, username, full_name, phone, parent_phone, grade, type, branch, created_at')
      .eq('role', 'student')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.students = data || [];
    renderStudents();

  } catch (err) {
    console.error(err);
    c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تحدّث الصفحة');
  }
}

function renderStudents() {
  const c = document.getElementById('studentsContainer');
  const q = (document.getElementById('searchStudents')?.value || '').toLowerCase().trim();
  const grade = document.getElementById('filterGrade')?.value || '';

  let list = cache.students;
  if (q) list = list.filter(s =>
    s.username.toLowerCase().includes(q) ||
    s.full_name.toLowerCase().includes(q) ||
    (s.phone || '').includes(q)
  );
  if (grade) list = list.filter(s => s.grade === grade);

  if (!list.length) {
    c.innerHTML = emptyState('fa-users-slash', 'مفيش طلاب', 'جرب تغير البحث أو الفلتر');
    return;
  }

  c.innerHTML = `<div class="cards-mobile">${list.map(studentCard).join('')}</div>`;
  bindStudentActions();
}

function studentCard(s) {
  const actions = isAdmin
    ? `
      <div class="mcard__acts">
        <button class="btn btn--line btn--sm" data-action="toggle" data-id="${s.id}">
          <i class="fa-solid fa-ban"></i> إيقاف
        </button>
        <button class="btn btn--danger btn--sm" data-action="delete" data-id="${s.id}">
          <i class="fa-solid fa-trash"></i> حذف
        </button>
      </div>
    `
    : `<div class="mcard__acts"><span class="badge badge--mut"><i class="fa-solid fa-eye"></i> عرض فقط</span></div>`;

  return `
    <div class="mcard" data-id="${s.id}">
      <div class="mcard__top">
        <h4>${escapeHtml(s.full_name)}</h4>
        <span class="badge badge--ok"><i class="fa-solid fa-check"></i> مفعّل</span>
      </div>
      <div class="mcard__rows">
        <div><b>المستخدم:</b> <span dir="ltr">${escapeHtml(s.username)}</span></div>
        <div><b>هاتف الطالب:</b> <span dir="ltr">${escapeHtml(s.phone || '—')}</span></div>
        <div><b>ولي الأمر:</b> <span dir="ltr">${escapeHtml(s.parent_phone || '—')}</span></div>
        <div><b>الصف:</b> ${escapeHtml(s.grade)}</div>
        <div><b>النوع:</b> ${escapeHtml(s.type)}${s.branch ? ' - ' + escapeHtml(s.branch) : ''}</div>
      </div>
      ${actions}
    </div>
  `;
}

function bindStudentActions() {
  if (!isAdmin) return;

  $$('#studentsContainer [data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const card = btn.closest('.mcard');
      const name = card.querySelector('h4').textContent;

      if (action === 'toggle') {
        const ok = await UI.confirm({
          type: 'warn',
          title: 'إيقاف الحساب؟',
          message: `سيتوقف "${name}" عن الدخول للمنصة. تقدر ترجعه بعدين.`,
          confirmText: 'إيقاف',
          cancelText: 'إلغاء'
        });
        if (!ok) return;

        const { error } = await supabaseClient.from('profiles').update({ is_active: false }).eq('id', id);
        if (error) { Toast.error('خطأ', error.message); return; }
        Toast.warn('تم الإيقاف', `تم إيقاف ${name}`);
        card.remove();
        loadStats();

      } else if (action === 'delete') {
        const ok = await UI.confirm({
          type: 'danger',
          title: 'حذف نهائي؟',
          message: `سيتم حذف "${name}" وكل بياناته نهائياً. لا يمكن التراجع.`,
          confirmText: 'حذف',
          cancelText: 'إلغاء'
        });
        if (!ok) return;

        const { error } = await supabaseClient.from('profiles').delete().eq('id', id);
        if (error) { Toast.error('خطأ', error.message); return; }
        Toast.error('تم الحذف', `تم حذف ${name}`);
        card.remove();
        loadStats();
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   3. الامتحانات
   ═══════════════════════════════════════════════════════════════ */
async function loadExams() {
  const c = document.getElementById('examsContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('exams')
      .select('id, title, grade, type, branch, duration_minutes, opens_at, closes_at, total_marks, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.exams = data || [];

    if (!data?.length) {
      c.innerHTML = emptyState('fa-file-pen', 'مفيش امتحانات', 'ابدأ بإنشاء امتحان جديد');
      return;
    }

    c.innerHTML = `<div class="cards-mobile">${data.map(examCard).join('')}</div>`;
    bindExamActions();

  } catch (err) {
    console.error(err);
    c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تحدّث الصفحة');
  }
}

function examCard(e) {
  const now = new Date();
  const opens = new Date(e.opens_at);
  const closes = new Date(e.closes_at);

  let statusBadge = '';
  if (e.status === 'draft') statusBadge = '<span class="badge badge--mut"><i class="fa-solid fa-pen"></i> مسودة</span>';
  else if (now < opens) statusBadge = '<span class="badge badge--info"><i class="fa-solid fa-clock"></i> لم يفتح</span>';
  else if (now > closes) statusBadge = '<span class="badge badge--err"><i class="fa-solid fa-lock"></i> مقفول</span>';
  else statusBadge = '<span class="badge badge--ok"><i class="fa-solid fa-play"></i> مفتوح</span>';

  const actions = isAdmin
    ? `
      <div class="mcard__acts">
        <button class="btn btn--line btn--sm" data-action="publish" data-id="${e.id}" ${e.status === 'published' ? 'disabled' : ''}>
          <i class="fa-solid fa-upload"></i> نشر
        </button>
        <button class="btn btn--line btn--sm" data-action="close" data-id="${e.id}" ${e.status === 'closed' ? 'disabled' : ''}>
          <i class="fa-solid fa-lock"></i> إغلاق
        </button>
        <button class="btn btn--danger btn--sm" data-action="delete" data-id="${e.id}">
          <i class="fa-solid fa-trash"></i> حذف
        </button>
      </div>
    `
    : `<div class="mcard__acts"><span class="badge badge--mut"><i class="fa-solid fa-eye"></i> عرض فقط</span></div>`;

  return `
    <div class="mcard" data-id="${e.id}">
      <div class="mcard__top">
        <h4>${escapeHtml(e.title)}</h4>
        ${statusBadge}
      </div>
      <div class="mcard__rows">
        <div><b>الصف:</b> ${escapeHtml(e.grade || '—')}</div>
        <div><b>النوع:</b> ${escapeHtml(e.type || 'عام')}${e.branch ? ' - ' + escapeHtml(e.branch) : ''}</div>
        <div><b>المدة:</b> ${e.duration_minutes} دقيقة</div>
        <div><b>يفتح:</b> ${formatDate(e.opens_at)}</div>
        <div><b>يقفل:</b> ${formatDate(e.closes_at)}</div>
      </div>
      ${actions}
    </div>
  `;
}

function bindExamActions() {
  if (!isAdmin) return;

  $$('#examsContainer [data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const card = btn.closest('.mcard');
      const title = card.querySelector('h4').textContent;

      try {
        if (action === 'publish') {
          const ok = await UI.confirm({
            type: 'success',
            title: 'نشر الامتحان؟',
            message: `سيظهر "${title}" للطلاب في صفهم.`,
            confirmText: 'نشر',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          const { error } = await supabaseClient.from('exams').update({ status: 'published' }).eq('id', id);
          if (error) throw error;
          Toast.success('تم النشر', `تم نشر "${title}"`);

        } else if (action === 'close') {
          const ok = await UI.confirm({
            type: 'warn',
            title: 'إغلاق الامتحان؟',
            message: `سيتم إغلاق "${title}" ولن يقدر الطلاب يدخلوه.`,
            confirmText: 'إغلاق',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          const { error } = await supabaseClient.from('exams').update({ status: 'closed' }).eq('id', id);
          if (error) throw error;
          Toast.warn('تم الإغلاق', `تم إغلاق "${title}"`);

        } else if (action === 'delete') {
          const ok = await UI.confirm({
            type: 'danger',
            title: 'حذف الامتحان؟',
            message: `سيتم حذف "${title}" وكل أسئلته ومحاولات الطلاب. لا يمكن التراجع.`,
            confirmText: 'حذف',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          const { error } = await supabaseClient.from('exams').delete().eq('id', id);
          if (error) throw error;
          Toast.error('تم الحذف', `تم حذف "${title}"`);
        }

        loadExams();
        loadStats();
      } catch (err) {
        console.error(err);
        Toast.error('خطأ', err.message || 'حاول تاني');
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   4. المحاولات
   ═══════════════════════════════════════════════════════════════ */
async function loadAttempts() {
  const c = document.getElementById('attemptsContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('attempts')
      .select(`
        id, score, total_marks, status, started_at, submitted_at,
        profiles:student_id (full_name, username, grade),
        exams:exam_id (title, total_marks)
      `)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.attempts = data || [];
    renderAttempts();

  } catch (err) {
    console.error(err);
    c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تحدّث الصفحة');
  }
}

function renderAttempts() {
  const c = document.getElementById('attemptsContainer');
  const filter = document.getElementById('filterAttempts')?.value || 'all';

  let list = cache.attempts;
  if (filter !== 'all') list = list.filter(a => a.status === filter);

  if (!list.length) {
    c.innerHTML = emptyState('fa-file-circle-xmark', 'مفيش محاولات', 'لسه محدش حل امتحانات');
    return;
  }

  c.innerHTML = `<div class="cards-mobile">${list.map(attemptCard).join('')}</div>`;
}

function attemptCard(a) {
  const student = a.profiles || {};
  const exam = a.exams || {};
  const statusMap = {
    in_progress: ['warn', 'fa-hourglass-half', 'قيد الحل'],
    submitted: ['info', 'fa-paper-plane', 'تم التسليم'],
    graded: ['ok', 'fa-check-double', 'تم التصحيح'],
    expired: ['err', 'fa-clock', 'منتهي']
  };
  const [cls, ic, label] = statusMap[a.status] || ['mut', 'fa-circle', a.status];

  const pct = a.total_marks ? Math.round((a.score / a.total_marks) * 100) : 0;

  return `
    <div class="mcard">
      <div class="mcard__top">
        <h4>${escapeHtml(exam.title || 'امتحان محذوف')}</h4>
        <span class="badge badge--${cls}"><i class="fa-solid ${ic}"></i> ${label}</span>
      </div>
      <div class="mcard__rows">
        <div><b>الطالب:</b> ${escapeHtml(student.full_name || '—')}</div>
        <div><b>الصف:</b> ${escapeHtml(student.grade || '—')}</div>
        <div><b>النتيجة:</b> ${a.score ?? 0}/${a.total_marks ?? 0} (${pct}%)</div>
        <div><b>البداية:</b> ${formatDate(a.started_at)}</div>
        ${a.submitted_at ? `<div><b>التسليم:</b> ${formatDate(a.submitted_at)}</div>` : ''}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   5. PDF
   ═══════════════════════════════════════════════════════════════ */
async function loadPdfList() {
  const c = document.getElementById('pdfContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('attempts')
      .select(`
        id, score, total_marks, status, submitted_at, pdf_exported,
        profiles:student_id (full_name, username, grade, phone, parent_phone),
        exams:exam_id (title, total_marks)
      `)
      .in('status', ['submitted', 'graded'])
      .order('submitted_at', { ascending: false })
      .limit(50);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.pdf = data || [];
    renderPdfList();
    updateDeleteBtn();

  } catch (err) {
    console.error(err);
    c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تحدّث الصفحة');
  }
}

function renderPdfList() {
  const c = document.getElementById('pdfContainer');

  if (!cache.pdf.length) {
    c.innerHTML = emptyState('fa-file-pdf', 'مفيش محاولات جاهزة', 'لما طالب يسلّم امتحان هيظهر هنا');
    return;
  }

  c.innerHTML = `<div class="cards-mobile">${cache.pdf.map(pdfCard).join('')}</div>`;
  bindPdfActions();
}

function pdfCard(a) {
  const student = a.profiles || {};
  const exam = a.exams || {};
  const done = a.pdf_exported === true;
  const pct = a.total_marks ? Math.round((a.score / a.total_marks) * 100) : 0;

  const deleteBtn = (done && isAdmin)
    ? `<button class="btn btn--danger btn--sm" data-action="delete" data-id="${a.id}">
        <i class="fa-solid fa-trash"></i> مسح من القاعدة
      </button>`
    : (done
        ? `<span class="badge badge--mut"><i class="fa-solid fa-eye"></i> عرض فقط</span>`
        : `<button class="btn btn--line btn--sm" disabled>
            <i class="fa-solid fa-lock"></i> لازم تنزّل الأول
          </button>`);

  return `
    <div class="mcard" data-id="${a.id}">
      <div class="mcard__top">
        <h4>${escapeHtml(student.full_name || '—')}</h4>
        ${done
          ? '<span class="badge badge--ok"><i class="fa-solid fa-check"></i> اتنزل</span>'
          : '<span class="badge badge--warn"><i class="fa-solid fa-download"></i> لسه ما اتنزلش</span>'}
      </div>
      <div class="mcard__rows">
        <div><b>الامتحان:</b> ${escapeHtml(exam.title || '—')}</div>
        <div><b>الصف:</b> ${escapeHtml(student.grade || '—')}</div>
        <div><b>النتيجة:</b> ${a.score ?? 0}/${a.total_marks ?? 0} (${pct}%)</div>
        <div><b>التسليم:</b> ${formatDate(a.submitted_at)}</div>
      </div>
      <div class="mcard__acts">
        <button class="btn btn--gold btn--sm" data-action="download" data-id="${a.id}">
          <i class="fa-solid fa-file-pdf"></i> تنزيل PDF
        </button>
        ${deleteBtn}
      </div>
    </div>
  `;
}

function bindPdfActions() {
  $$('#pdfContainer [data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const attempt = cache.pdf.find(a => a.id === id);
      if (!attempt) return;

      if (action === 'download') {
        await exportAttemptPdf(attempt);
      } else if (action === 'delete') {
        if (!isAdmin) { Toast.warn('غير مصرح', 'الأدمن فقط'); return; }

        const ok = await UI.confirm({
          type: 'warn',
          title: 'مسح من قاعدة البيانات؟',
          message: 'الـ PDF محفوظ عندك، بس المحاولة هتتمسح من السيرفر.',
          confirmText: 'مسح',
          cancelText: 'إلغاء'
        });
        if (!ok) return;

        const { error } = await supabaseClient.from('attempts').delete().eq('id', id);
        if (error) { Toast.error('خطأ', error.message); return; }
        Toast.error('تم المسح', 'اتمسحت من قاعدة البيانات');
        loadPdfList();
        loadStats();
      }
    });
  });
}

/* ─────────────── توليد PDF ─────────────── */
async function exportAttemptPdf(attempt) {
  const { jsPDF } = window.jspdf;

  const { data: answers, error } = await supabaseClient
    .from('answers')
    .select(`
      id, selected_choice_id, essay_text, marks_awarded,
      questions:question_id (question_text, question_type, marks),
      choices:selected_choice_id (choice_text)
    `)
    .eq('attempt_id', attempt.id)
    .order('answered_at', { ascending: true });

  if (error) { Toast.error('خطأ', error.message); return; }

  const student = attempt.profiles || {};
  const exam = attempt.exams || {};

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica');

  doc.setFontSize(18);
  doc.text('Exam Answers Report', 105, 20, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Student: ${student.full_name || '-'}`, 15, 35);
  doc.text(`Username: ${student.username || '-'}`, 15, 42);
  doc.text(`Grade: ${student.grade || '-'}`, 15, 49);
  doc.text(`Student Phone: ${student.phone || '-'}`, 15, 56);
  doc.text(`Parent Phone: ${student.parent_phone || '-'}`, 15, 63);

  doc.text(`Exam: ${exam.title || '-'}`, 15, 75);
  doc.text(`Score: ${attempt.score ?? 0} / ${attempt.total_marks ?? 0}`, 15, 82);
  doc.text(`Submitted: ${formatDate(attempt.submitted_at)}`, 15, 89);

  const rows = (answers || []).map((ans, i) => {
    const q = ans.questions || {};
    const isMcq = q.question_type === 'mcq';
    const studentAns = isMcq ? (ans.choices?.choice_text || '-') : (ans.essay_text || '-');
    return [
      i + 1,
      q.question_text || '-',
      isMcq ? 'MCQ' : 'Essay',
      studentAns,
      ans.marks_awarded ?? '-',
      q.marks ?? '-'
    ];
  });

  doc.autoTable({
    startY: 99,
    head: [['#', 'Question', 'Type', 'Answer', 'Awarded', 'Max']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [230, 184, 0], textColor: [10, 10, 10], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 60 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 60 },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' }
    }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Manassa Al-Ustadh Mohamed Eissa | Page ${i} / ${pageCount}`,
      105, 290, { align: 'center' }
    );
  }

  const safeName = (student.username || 'student').replace(/[^a-z0-9_]/gi, '_');
  const safeExam = (exam.title || 'exam').replace(/[^\u0600-\u06FFa-z0-9]/gi, '_').slice(0, 30);
  doc.save(`${safeName}_${safeExam}_${Date.now()}.pdf`);

  const { error: upErr } = await supabaseClient
    .from('attempts')
    .update({ pdf_exported: true, pdf_exported_at: new Date().toISOString() })
    .eq('id', attempt.id);

  if (upErr) Toast.warn('تم التنزيل بس', 'فشل تحديث السجل');
  else Toast.success('تم التنزيل ✅', 'دلوقتي تقدر تمسح من القاعدة');

  loadPdfList();
  loadStats();
}

async function downloadAllPdf() {
  if (!cache.pdf.length) { Toast.warn('مفيش حاجة', 'مفيش محاولات'); return; }

  const notExported = cache.pdf.filter(a => !a.pdf_exported);
  const list = notExported.length ? notExported : cache.pdf;

  const ok = await UI.confirm({
    type: 'info',
    title: 'تنزيل كل الملفات؟',
    message: `سيتم تنزيل ${list.length} ملف PDF. قد ياخد وقت.`,
    confirmText: 'تنزيل',
    cancelText: 'إلغاء'
  });
  if (!ok) return;

  Toast.info('جارٍ التنزيل', `عدد الملفات: ${list.length}`);

  for (const attempt of list) {
    try {
      await exportAttemptPdf(attempt);
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error('فشل تنزيل:', attempt.id, err);
    }
  }

  Toast.success('خلص التنزيل', `${list.length} ملف اتنزلوا`);
}

function updateDeleteBtn() {
  const btn = document.getElementById('deleteExportedBtn');
  if (!btn) return;
  if (!isAdmin) {
    btn.disabled = true;
    btn.style.display = 'none';
    return;
  }
  const count = cache.pdf.filter(a => a.pdf_exported).length;
  btn.disabled = count === 0;
  btn.innerHTML = `<i class="fa-solid fa-trash"></i> مسح اللي اتنزل (${count})`;
}

async function deleteExported() {
  if (!isAdmin) { Toast.warn('غير مصرح', 'الأدمن فقط'); return; }

  const toDelete = cache.pdf.filter(a => a.pdf_exported);
  if (!toDelete.length) { Toast.warn('مفيش حاجة', 'مفيش محاولات اتنزلت'); return; }

  const ok = await UI.confirm({
    type: 'danger',
    title: 'مسح كل اللي اتنزل؟',
    message: `سيتم مسح ${toDelete.length} محاولة من قاعدة البيانات.`,
    confirmText: `مسح (${toDelete.length})`,
    cancelText: 'إلغاء'
  });
  if (!ok) return;

  const ids = toDelete.map(a => a.id);
  const { error } = await supabaseClient.from('attempts').delete().in('id', ids);

  if (error) { Toast.error('خطأ', error.message); return; }

  Toast.error('تم المسح', `اتمسحت ${ids.length} محاولة`);
  loadPdfList();
  loadStats();
}

/* ═══════════════════════════════════════════════════════════════
   أدوات
   ═══════════════════════════════════════════════════════════════ */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function emptyState(icon, title, msg) {
  return `
    <div class="empty-state">
      <i class="fa-solid ${icon}"></i>
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(msg)}</p>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   التهيئة
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();

  const guard = await guardPage();
  if (!guard) return;

  if (guard.profile.role !== 'admin' && guard.profile.role !== 'teacher') {
    window.location.href = 'index.html';
    return;
  }

  currentUser = guard.session.user;
  currentProfile = guard.profile;
  isAdmin = currentProfile.role === 'admin';

  if (!isAdmin) {
    const titleEl = document.querySelector('.admin-top__title h1');
    if (titleEl) titleEl.textContent = 'لوحة المدرس';
    const subtitleEl = document.querySelector('.admin-top__title small');
    if (subtitleEl) subtitleEl.textContent = 'عرض الطلاب والامتحانات';
  }

  initTabs();

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    const ok = await UI.confirm({
      type: 'warn',
      title: 'تسجيل الخروج؟',
      message: 'هترجع لصفحة تسجيل الدخول.',
      confirmText: 'خروج',
      cancelText: 'إلغاء'
    });
    if (!ok) return;
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });

  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    loadStats();
    const active = document.querySelector('.admin-panel.is-active')?.dataset.panel;
    if (active === 'pending') loadPending();
    else if (active === 'students') loadStudents();
    else if (active === 'exams') loadExams();
    else if (active === 'attempts') loadAttempts();
    else if (active === 'pdf') loadPdfList();
    Toast.info('تم التحديث', '');
  });

  document.getElementById('searchPending')?.addEventListener('input', () => {
    const q = document.getElementById('searchPending').value.toLowerCase();
    $$('#pendingContainer .mcard').forEach(card => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  document.getElementById('searchStudents')?.addEventListener('input', renderStudents);
  document.getElementById('filterGrade')?.addEventListener('change', renderStudents);
  document.getElementById('filterAttempts')?.addEventListener('change', renderAttempts);

  document.getElementById('downloadAllPdfBtn')?.addEventListener('click', downloadAllPdf);
  document.getElementById('deleteExportedBtn')?.addEventListener('click', deleteExported);

  document.getElementById('newExamBtn')?.addEventListener('click', () => {
    if (!isAdmin) { Toast.warn('غير مصرح', 'الأدمن فقط'); return; }
    Toast.info('قريباً', 'إنشاء الامتحانات هيتضاف في التحديث القادم');
  });

  loadStats();
  loadPending();
});