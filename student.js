/* ═══════════════════════════════════════════════════════════════
   student.js — الصفحة الرئيسية للطالب
   منصة الأستاذ محمد عيسى
   ⚠️ $ و $$ معرّفين في auth.js
   ⚠️ UI.confirm في ui.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

let currentUser = null;
let currentProfile = null;

/* ─────────────── الترحيب ─────────────── */
function renderWelcome() {
  const firstName = (currentProfile.full_name || '').split(' ')[0] || 'طالب';
  $('#studentName').textContent = firstName;

  const meta = [
    currentProfile.grade,
    currentProfile.type,
    currentProfile.branch
  ].filter(Boolean).join(' · ');

  $('#studentMeta').textContent = meta;
}

/* ─────────────── الإحصائيات ─────────────── */
async function loadStats() {
  const now = new Date().toISOString();

  const [examsRes, assignmentsRes, pendingRes, gradedRes] = await Promise.all([
    // امتحانات متاحة
    supabaseClient
      .from('exams')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('kind', 'exam')
      .eq('grade', currentProfile.grade)
      .eq('type', currentProfile.type)
      .gte('closes_at', now),

    // واجبات متاحة
    supabaseClient
      .from('exams')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('kind', 'assignment')
      .eq('grade', currentProfile.grade)
      .eq('type', currentProfile.type)
      .gte('closes_at', now),

    // قيد المراجعة
    supabaseClient
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', currentUser.id)
      .eq('status', 'submitted'),

    // تم التصحيح
    supabaseClient
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', currentUser.id)
      .eq('status', 'graded')
  ]);

  $('#statAvailable').textContent = examsRes.count || 0;
  $('#statAssignments').textContent = assignmentsRes.count || 0;
  $('#statPending').textContent = pendingRes.count || 0;
  $('#statGraded').textContent = gradedRes.count || 0;
}

/* ─────────────── دالة مساعدة ─────────────── */
function studentSeesItem(item) {
  if (item.grade !== currentProfile.grade) return false;
  if (item.type !== currentProfile.type) return false;
  if (currentProfile.type === 'عام') return true;
  if (currentProfile.grade.includes('إعدادي')) return true;
  if (!item.branch) return true;
  return item.branch === currentProfile.branch;
}

/* ─────────────── الامتحانات المتاحة ─────────────── */
async function loadAvailableExams() {
  const c = document.getElementById('availableContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  const now = new Date().toISOString();

  const { data: exams, error } = await supabaseClient
    .from('exams')
    .select('id, title, description, duration_minutes, closes_at, total_marks, grade, type, branch, kind')
    .eq('status', 'published')
    .eq('kind', 'exam')
    .eq('grade', currentProfile.grade)
    .eq('type', currentProfile.type)
    .gte('closes_at', now)
    .order('closes_at', { ascending: true })
    .limit(50);

  if (error) { c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message); return; }

  const filtered = (exams || []).filter(studentSeesItem);

  if (!filtered.length) {
    c.innerHTML = emptyState('fa-inbox', 'مفيش امتحانات متاحة', 'استنى لما الأستاذ ينشر امتحان لصفك');
    return;
  }

  const examIds = filtered.map(e => e.id);
  const { data: attempts } = await supabaseClient
    .from('attempts')
    .select('id, exam_id, status')
    .eq('student_id', currentUser.id)
    .in('exam_id', examIds);

  const attemptMap = {};
  (attempts || []).forEach(a => { attemptMap[a.exam_id] = a; });

  c.innerHTML = filtered.map(e => itemCard(e, attemptMap[e.id], 'exam')).join('');
  bindStartButtons();
}

/* ─────────────── الواجبات ─────────────── */
async function loadAssignments() {
  const c = document.getElementById('assignmentsContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  const now = new Date().toISOString();

  const { data: assignments, error } = await supabaseClient
    .from('exams')
    .select('id, title, description, duration_minutes, closes_at, total_marks, grade, type, branch, kind')
    .eq('status', 'published')
    .eq('kind', 'assignment')
    .eq('grade', currentProfile.grade)
    .eq('type', currentProfile.type)
    .gte('closes_at', now)
    .order('closes_at', { ascending: true })
    .limit(50);

  if (error) { c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message); return; }

  const filtered = (assignments || []).filter(studentSeesItem);

  if (!filtered.length) {
    c.innerHTML = emptyState('fa-clipboard', 'مفيش واجبات متاحة', 'استنى لما الأستاذ ينشر واجب لصفك');
    return;
  }

  const ids = filtered.map(e => e.id);
  const { data: attempts } = await supabaseClient
    .from('attempts')
    .select('id, exam_id, status')
    .eq('student_id', currentUser.id)
    .in('exam_id', ids);

  const attemptMap = {};
  (attempts || []).forEach(a => { attemptMap[a.exam_id] = a; });

  c.innerHTML = filtered.map(e => itemCard(e, attemptMap[e.id], 'assignment')).join('');
  bindStartButtons();
}

/* ─────────────── كارت الامتحان/الواجب ─────────────── */
function itemCard(item, attempt, kind) {
  const closesAt = new Date(item.closes_at);
  const diffMs = closesAt - new Date();
  const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
  const daysLeft = Math.floor(hoursLeft / 24);

  let closeLabel = '';
  let closeCls = '';
  if (diffMs < 0) {
    closeLabel = 'انتهى';
    closeCls = 'urgent';
  } else if (hoursLeft < 3) {
    closeLabel = hoursLeft <= 0 ? 'أقل من ساعة' : `باقي ${hoursLeft} ساعة`;
    closeCls = 'urgent';
  } else if (hoursLeft < 24) {
    closeLabel = `باقي ${hoursLeft} ساعة`;
    closeCls = 'soon';
  } else {
    closeLabel = `باقي ${daysLeft} يوم`;
  }

  const kindBadge = kind === 'exam'
    ? `<span class="exam-card__kind exam-card__kind--exam"><i class="fa-solid fa-file-pen"></i> امتحان</span>`
    : `<span class="exam-card__kind exam-card__kind--assignment"><i class="fa-solid fa-clipboard-check"></i> واجب</span>`;

  let actionBtn = '';
  if (attempt) {
    if (attempt.status === 'in_progress') {
      actionBtn = `<button class="btn btn--gold btn--sm" data-start="${item.id}">
        <i class="fa-solid fa-play"></i> إكمال
      </button>`;
    } else if (attempt.status === 'submitted') {
      actionBtn = `<button class="btn btn--line btn--sm" disabled>
        <i class="fa-solid fa-marker"></i> قيد المراجعة
      </button>`;
    } else {
      actionBtn = `<button class="btn btn--line btn--sm" disabled>
        <i class="fa-solid fa-circle-check"></i> تم التصحيح
      </button>`;
    }
  } else {
    actionBtn = `<button class="btn btn--gold btn--sm" data-start="${item.id}">
      <i class="fa-solid fa-play"></i> ابدأ
    </button>`;
  }

  const cardCls = kind === 'assignment' ? 'exam-card exam-card--assignment' : 'exam-card';

  return `
    <div class="${cardCls}" data-id="${item.id}">
      <div class="exam-card__head">
        <h3>${escapeHtml(item.title)}</h3>
        ${kindBadge}
      </div>
      <div class="exam-card__meta">
        <span><i class="fa-solid fa-clock"></i> ${item.duration_minutes} دقيقة</span>
        <span class="${closeCls}"><i class="fa-solid fa-hourglass-half"></i> ${closeLabel}</span>
        <span><i class="fa-solid fa-star"></i> ${item.total_marks || 0} درجة</span>
      </div>
      ${item.description ? `<p style="color:var(--muted);font-size:.85rem;margin-bottom:12px;">${escapeHtml(item.description)}</p>` : ''}
      <div class="exam-card__acts">
        ${actionBtn}
      </div>
    </div>
  `;
}

function bindStartButtons() {
  $$('[data-start]').forEach(btn => {
    btn.addEventListener('click', () => {
      const examId = btn.dataset.start;
      window.location.href = `exam.html?id=${examId}`;
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   قسم "قيد المراجعة" (submitted)
   ═══════════════════════════════════════════════════════════════ */
async function loadPendingAttempts() {
  const c = document.getElementById('pendingContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  const { data, error } = await supabaseClient
    .from('attempts')
    .select(`
      id, score, total_marks, status, submitted_at,
      exams:exam_id (title, total_marks, pass_marks, kind)
    `)
    .eq('student_id', currentUser.id)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(50);

  if (error) { c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message); return; }

  if (!data?.length) {
    c.innerHTML = emptyState('fa-marker', 'مفيش محاولات قيد المراجعة', 'لما تسلّم امتحان هيظهر هنا لحد ما الأستاذ يصححه');
    return;
  }

  c.innerHTML = data.map(pendingAttemptCard).join('');
}

function pendingAttemptCard(a) {
  const exam = a.exams || {};
  const isAssignment = exam.kind === 'assignment';

  const kindBadge = isAssignment
    ? `<span class="exam-card__kind exam-card__kind--assignment"><i class="fa-solid fa-clipboard-check"></i> واجب</span>`
    : `<span class="exam-card__kind exam-card__kind--exam"><i class="fa-solid fa-file-pen"></i> امتحان</span>`;

  const cardCls = isAssignment
    ? 'exam-card exam-card--pending exam-card--assignment'
    : 'exam-card exam-card--pending';

  return `
    <div class="${cardCls}">
      <div class="exam-card__head">
        <h3>${escapeHtml(exam.title || '—')}</h3>
        ${kindBadge}
      </div>
      <div class="exam-card__score exam-card__score--pending">
        <div class="exam-card__score-num">
          <i class="fa-solid fa-marker"></i>
        </div>
        <div class="exam-card__score-label">
          <i class="fa-solid fa-hourglass-half"></i>
          قيد المراجعة — هيتم تصحيح المقالي من الأستاذ
        </div>
      </div>
      <div class="exam-card__meta">
        <span><i class="fa-solid fa-calendar-check"></i> تم التسليم: ${formatDate(a.submitted_at)}</span>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   قسم "تم التصحيح" (graded)
   ═══════════════════════════════════════════════════════════════ */
async function loadGradedAttempts() {
  const c = document.getElementById('gradedContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  const { data, error } = await supabaseClient
    .from('attempts')
    .select(`
      id, score, total_marks, status, submitted_at, graded_at,
      exams:exam_id (title, total_marks, pass_marks, kind)
    `)
    .eq('student_id', currentUser.id)
    .eq('status', 'graded')
    .order('graded_at', { ascending: false })
    .limit(50);

  if (error) { c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message); return; }

  if (!data?.length) {
    c.innerHTML = emptyState('fa-clock', 'لسه ما اتصححتش محاولات', 'لما الأستاذ يصحح، النتيجة هتظهر هنا');
    return;
  }

  c.innerHTML = data.map(gradedAttemptCard).join('');
}

function gradedAttemptCard(a) {
  const exam = a.exams || {};
  const pct = a.total_marks ? Math.round((a.score / a.total_marks) * 100) : 0;
  const isAssignment = exam.kind === 'assignment';

  let scoreCls = '';
  if (pct >= 75) scoreCls = '';
  else if (pct >= 50) scoreCls = 'exam-card__score--warn';
  else scoreCls = 'exam-card__score--err';

  const passed = a.total_marks && a.score >= (exam.pass_marks || 0);
  const labelIcon = passed ? 'fa-circle-check' : 'fa-circle-xmark';
  const labelTxt = passed ? 'ناجح' : 'يحتاج مراجعة';

  const kindBadge = isAssignment
    ? `<span class="exam-card__kind exam-card__kind--assignment"><i class="fa-solid fa-clipboard-check"></i> واجب</span>`
    : `<span class="exam-card__kind exam-card__kind--exam"><i class="fa-solid fa-file-pen"></i> امتحان</span>`;

  const cardCls = isAssignment
    ? 'exam-card exam-card--done exam-card--assignment'
    : 'exam-card exam-card--done';

  return `
    <div class="${cardCls}">
      <div class="exam-card__head">
        <h3>${escapeHtml(exam.title || '—')}</h3>
        ${kindBadge}
      </div>
      <div class="exam-card__score ${scoreCls}">
        <div class="exam-card__score-num">
          ${a.score ?? 0}<small>/ ${a.total_marks ?? 0}</small>
        </div>
        <div class="exam-card__score-label">
          <i class="fa-solid ${labelIcon}"></i>
          ${labelTxt} · ${pct}%
        </div>
      </div>
      <div class="exam-card__meta">
        <span><i class="fa-solid fa-calendar-check"></i> تم التصحيح: ${formatDate(a.graded_at || a.submitted_at)}</span>
      </div>
    </div>
  `;
}

/* ─────────────── أدوات ─────────────── */
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

/* ─────────────── التهيئة ─────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();

  const guard = await guardPage('student');
  if (!guard) return;

  currentUser = guard.session.user;
  currentProfile = guard.profile;

  renderWelcome();

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

  document.querySelectorAll('.bottom-bar__btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const scrollId = btn.dataset.scroll;
      if (scrollId) {
        e.preventDefault();
        const target = document.getElementById(scrollId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      document.querySelectorAll('.bottom-bar__btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  // تحميل كل الأقسام
  loadStats();
  loadAvailableExams();
  loadAssignments();
  loadPendingAttempts();
  loadGradedAttempts();
});