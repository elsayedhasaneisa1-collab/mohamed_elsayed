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

  const [examsRes, attemptsRes] = await Promise.all([
    supabaseClient
      .from('exams')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('grade', currentProfile.grade)
      .gte('closes_at', now),
    supabaseClient
      .from('attempts')
      .select('score, total_marks, status')
      .eq('student_id', currentUser.id)
  ]);

  const availableCount = examsRes.count || 0;
  const attempts = attemptsRes.data || [];
  const doneCount = attempts.filter(a => a.status === 'submitted' || a.status === 'graded').length;

  const graded = attempts.filter(a => a.total_marks > 0 && (a.status === 'submitted' || a.status === 'graded'));
  const avg = graded.length
    ? Math.round(graded.reduce((s, a) => s + (a.score / a.total_marks) * 100, 0) / graded.length)
    : 0;

  $('#statAvailable').textContent = availableCount;
  $('#statDone').textContent = doneCount;
  $('#statAvg').textContent = graded.length ? `${avg}%` : '—';
}

/* ─────────────── الامتحانات المتاحة ─────────────── */
async function loadAvailableExams() {
  const c = document.getElementById('availableContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  const now = new Date().toISOString();

  const { data: exams, error } = await supabaseClient
    .from('exams')
    .select('id, title, description, duration_minutes, closes_at, total_marks')
    .eq('status', 'published')
    .eq('grade', currentProfile.grade)
    .gte('closes_at', now)
    .order('closes_at', { ascending: true })
    .limit(50);

  if (error) { c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message); return; }

  if (!exams?.length) {
    c.innerHTML = emptyState('fa-inbox', 'مفيش امتحانات متاحة', 'استنى لما الأستاذ ينشر امتحان لصفك');
    return;
  }

  const examIds = exams.map(e => e.id);
  const { data: attempts } = await supabaseClient
    .from('attempts')
    .select('id, exam_id, status')
    .eq('student_id', currentUser.id)
    .in('exam_id', examIds);

  const attemptMap = {};
  (attempts || []).forEach(a => { attemptMap[a.exam_id] = a; });

  const html = exams.map(e => examCard(e, attemptMap[e.id])).join('');
  c.innerHTML = html;
  bindStartExam();
}

function examCard(exam, attempt) {
  const closesAt = new Date(exam.closes_at);
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

  let actionBtn = '';
  if (attempt) {
    if (attempt.status === 'in_progress') {
      actionBtn = `<button class="btn btn--gold btn--sm" data-start="${exam.id}">
        <i class="fa-solid fa-play"></i> إكمال الامتحان
      </button>`;
    } else {
      actionBtn = `<button class="btn btn--line btn--sm" disabled>
        <i class="fa-solid fa-circle-check"></i> تم التسليم
      </button>`;
    }
  } else {
    actionBtn = `<button class="btn btn--gold btn--sm" data-start="${exam.id}">
      <i class="fa-solid fa-play"></i> ابدأ الامتحان
    </button>`;
  }

  return `
    <div class="exam-card" data-id="${exam.id}">
      <div class="exam-card__head">
        <h3>${escapeHtml(exam.title)}</h3>
      </div>
      <div class="exam-card__meta">
        <span><i class="fa-solid fa-clock"></i> ${exam.duration_minutes} دقيقة</span>
        <span class="${closeCls}"><i class="fa-solid fa-hourglass-half"></i> ${closeLabel}</span>
        <span><i class="fa-solid fa-star"></i> ${exam.total_marks || 0} درجة</span>
      </div>
      ${exam.description ? `<p style="color:var(--muted);font-size:.85rem;margin-bottom:12px;">${escapeHtml(exam.description)}</p>` : ''}
      <div class="exam-card__acts">
        ${actionBtn}
      </div>
    </div>
  `;
}

function bindStartExam() {
  $$('[data-start]').forEach(btn => {
    btn.addEventListener('click', () => {
      const examId = btn.dataset.start;
      window.location.href = `exam.html?id=${examId}`;
    });
  });
}

/* ─────────────── الامتحانات اللي خلصها ─────────────── */
async function loadDoneExams() {
  const c = document.getElementById('doneContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  const { data, error } = await supabaseClient
    .from('attempts')
    .select(`
      id, score, total_marks, status, submitted_at,
      exams:exam_id (title, total_marks, pass_marks)
    `)
    .eq('student_id', currentUser.id)
    .in('status', ['submitted', 'graded'])
    .order('submitted_at', { ascending: false })
    .limit(50);

  if (error) { c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message); return; }

  if (!data?.length) {
    c.innerHTML = emptyState('fa-clock', 'لسه ما خلصتش امتحانات', 'لما تخلّص امتحان هيظهر هنا مع درجتك');
    return;
  }

  c.innerHTML = data.map(doneCard).join('');
}

function doneCard(a) {
  const exam = a.exams || {};
  const pct = a.total_marks ? Math.round((a.score / a.total_marks) * 100) : 0;

  let scoreCls = '';
  if (pct >= 75) scoreCls = '';
  else if (pct >= 50) scoreCls = 'exam-card__score--warn';
  else scoreCls = 'exam-card__score--err';

  const passed = a.total_marks && a.score >= (exam.pass_marks || 0);
  const labelIcon = passed ? 'fa-circle-check' : 'fa-circle-xmark';
  const labelTxt = passed ? 'ناجح' : 'يحتاج مراجعة';

  return `
    <div class="exam-card exam-card--done">
      <div class="exam-card__head">
        <h3>${escapeHtml(exam.title || 'امتحان')}</h3>
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
        <span><i class="fa-solid fa-calendar-check"></i> ${formatDate(a.submitted_at)}</span>
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
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bottom-bar__btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  loadStats();
  loadAvailableExams();
  loadDoneExams();
});