/* ═══════════════════════════════════════════════════════════════
   student.js — الصفحة الرئيسية للطالب
   منصة الأستاذ محمد عيسى
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
    supabaseClient
      .from('exams')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('kind', 'exam')
      .eq('grade', currentProfile.grade)
      .eq('type', currentProfile.type)
      .gte('closes_at', now),

    supabaseClient
      .from('exams')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('kind', 'assignment')
      .eq('grade', currentProfile.grade)
      .eq('type', currentProfile.type)
      .gte('closes_at', now),

    supabaseClient
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', currentUser.id)
      .eq('status', 'submitted'),

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
   قسم "قيد المراجعة"
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
   قسم "تم التصحيح" — مع Modal التفاصيل
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
  bindGradedAttemptClick();
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
    ? 'exam-card exam-card--done exam-card--assignment exam-card--clickable'
    : 'exam-card exam-card--done exam-card--clickable';

  return `
    <div class="${cardCls}" data-attempt-id="${a.id}">
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
      <div class="exam-card__acts">
        <button class="btn btn--gold btn--sm" data-action="view-details" data-attempt-id="${a.id}">
          <i class="fa-solid fa-circle-info"></i>
          عرض التفاصيل
        </button>
      </div>
    </div>
  `;
}

function bindGradedAttemptClick() {
  // الضغط على الكارت أو الزرار
  $$('#gradedContainer [data-attempt-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="view-details"]')) {
        e.stopPropagation();
        const id = card.dataset.attemptId;
        openStudentAttemptModal(id);
        return;
      }
      // الضغط على الكارت كله
      if (!e.target.closest('button')) {
        const id = card.dataset.attemptId;
        openStudentAttemptModal(id);
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Modal تفاصيل المحاولة (للطالب)
   ═══════════════════════════════════════════════════════════════ */
async function openStudentAttemptModal(attemptId) {
  const modal = document.getElementById('studentAttemptModal');
  const body = document.getElementById('studentAttemptBody');
  if (!modal || !body) return;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  body.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    // 1) نجيب المحاولة
    const { data: attempt, error: attErr } = await supabaseClient
      .from('attempts')
      .select(`
        id, score, total_marks, status, started_at, submitted_at, graded_at,
        exams:exam_id (id, title, total_marks, pass_marks, kind, duration_minutes)
      `)
      .eq('id', attemptId)
      .eq('student_id', currentUser.id)
      .maybeSingle();

    if (attErr || !attempt) {
      body.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'مش قادر أجيب التفاصيل');
      return;
    }

    // 2) نجيب الإجابات + الأسئلة
    const { data: answers, error: ansErr } = await supabaseClient
      .from('answers')
      .select(`
        id, selected_choice_id, essay_text, marks_awarded, teacher_feedback,
        questions:question_id (id, question_text, question_type, marks, order_index),
        selected_choice:selected_choice_id (id, choice_text, is_correct)
      `)
      .eq('attempt_id', attemptId);

    if (ansErr) {
      body.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', ansErr.message);
      return;
    }

    // 3) نجيب كل الاختيارات للأسئلة MCQ
    const mcqQuestionIds = (answers || [])
      .filter(a => a.questions?.question_type === 'mcq')
      .map(a => a.questions.id);

    let allChoices = [];
    if (mcqQuestionIds.length) {
      const { data: choicesData } = await supabaseClient
        .from('choices')
        .select('*')
        .in('question_id', mcqQuestionIds)
        .order('order_index', { ascending: true });
      allChoices = choicesData || [];
    }

    // 4) ترتيب
    const sortedAnswers = (answers || []).sort((a, b) => {
      const ai = a.questions?.order_index ?? 0;
      const bi = b.questions?.order_index ?? 0;
      return ai - bi;
    });

    // 5) نرندر
    body.innerHTML = renderStudentAttempt(attempt, sortedAnswers, allChoices);

  } catch (err) {
    console.error('Student attempt error:', err);
    body.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', err.message || 'حاول تاني');
  }
}

function closeStudentAttemptModal() {
  const modal = document.getElementById('studentAttemptModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function renderStudentAttempt(attempt, answers, allChoices) {
  const exam = attempt.exams || {};
  const pct = attempt.total_marks ? Math.round((attempt.score / attempt.total_marks) * 100) : 0;
  const passed = attempt.total_marks && attempt.score >= (exam.pass_marks || 0);
  const isAssignment = exam.kind === 'assignment';

  // ─── Hero (النتيجة النهائية) ───
  let barCls = '';
  if (pct >= 75) barCls = 'percent-bar__fill--ok';
  else if (pct >= 50) barCls = 'percent-bar__fill--warn';
  else barCls = 'percent-bar__fill--err';

  const hero = `
    <div class="student-attempt-hero">
      <div class="student-attempt-hero__icon ${passed ? 'is-pass' : 'is-fail'}">
        <i class="fa-solid ${passed ? 'fa-trophy' : 'fa-circle-xmark'}"></i>
      </div>
      <div class="student-attempt-hero__info">
        <h3>${escapeHtml(exam.title || '—')}</h3>
        <p>
          <span><i class="fa-solid ${isAssignment ? 'fa-clipboard-check' : 'fa-file-pen'}"></i> ${isAssignment ? 'واجب' : 'امتحان'}</span>
          <span><i class="fa-solid fa-calendar-check"></i> ${formatDate(attempt.graded_at || attempt.submitted_at)}</span>
        </p>
      </div>
    </div>

    <div class="student-attempt-result">
      <div class="student-attempt-result__item">
        <b>${attempt.score ?? 0}</b>
        <span>الدرجة</span>
      </div>
      <div class="student-attempt-result__item">
        <b>${attempt.total_marks ?? 0}</b>
        <span>من</span>
      </div>
      <div class="student-attempt-result__item ${pct >= 75 ? 'is-ok' : (pct >= 50 ? 'is-warn' : 'is-err')}">
        <b>${pct}%</b>
        <span>النسبة</span>
      </div>
      <div class="student-attempt-result__item ${passed ? 'is-ok' : 'is-err'}">
        <b>${passed ? '✓' : '✗'}</b>
        <span>${passed ? 'ناجح' : 'يحتاج مراجعة'}</span>
      </div>
    </div>

    <div class="percent-bar">
      <div class="percent-bar__head">
        <span><i class="fa-solid fa-chart-line"></i> النسبة النهائية</span>
        <b>${pct}%</b>
      </div>
      <div class="percent-bar__track">
        <div class="percent-bar__fill ${barCls}" style="width:${pct}%"></div>
      </div>
    </div>
  `;

  // ─── قائمة الأسئلة ───
  let listHtml = '<div class="student-attempt-list">';

  answers.forEach((ans, idx) => {
    const q = ans.questions || {};
    const isMcq = q.question_type === 'mcq';
    const maxMarks = q.marks || 0;
    const awarded = ans.marks_awarded ?? 0;
    const earnedPct = maxMarks ? Math.round((awarded / maxMarks) * 100) : 0;

    // حالة السؤال
    let statusCls = '';
    let statusLabel = '';
    let statusIcon = '';

    if (awarded === maxMarks) {
      statusCls = 'is-correct';
      statusLabel = 'إجابة كاملة';
      statusIcon = 'fa-circle-check';
    } else if (awarded === 0) {
      statusCls = 'is-wrong';
      statusLabel = 'إجابة خاطئة';
      statusIcon = 'fa-circle-xmark';
    } else {
      statusCls = 'is-partial';
      statusLabel = 'إجابة جزئية';
      statusIcon = 'fa-circle-half-stroke';
    }

    const typeBadge = isMcq
      ? '<span class="student-q-type student-q-type--mcq"><i class="fa-solid fa-list-ul"></i> اختيار</span>'
      : '<span class="student-q-type student-q-type--essay"><i class="fa-solid fa-pen-fancy"></i> مقالي</span>';

    // نص السؤال
    const questionHtml = `
      <div class="student-q-question">
        ${escapeHtml(q.question_text || '')}
      </div>
    `;

    // إجابة الطالب
    let answerHtml = '';

    if (isMcq) {
      const selectedChoice = ans.selected_choice;
      const choicesForQ = allChoices.filter(c => c.question_id === q.id);
      const correctChoice = choicesForQ.find(c => c.is_correct);
      const isEmpty = !ans.selected_choice_id;

      answerHtml = `
        <div class="student-q-answer-block">
          <div class="student-q-answer-label">
            <i class="fa-solid fa-user"></i>
            إجابتك:
          </div>
          <div class="student-q-answer-text ${isEmpty ? 'is-empty' : (selectedChoice?.is_correct ? 'is-correct' : 'is-wrong')}">
            ${isEmpty
              ? 'لم تجب على السؤال'
              : `${escapeHtml(selectedChoice?.choice_text || '')}
                 ${selectedChoice?.is_correct
                   ? '<i class="fa-solid fa-circle-check" style="color:var(--ok)"></i>'
                   : '<i class="fa-solid fa-circle-xmark" style="color:var(--err)"></i>'}`}
          </div>
        </div>

        ${!selectedChoice?.is_correct && correctChoice ? `
          <div class="student-q-correct-block">
            <div class="student-q-answer-label">
              <i class="fa-solid fa-circle-check" style="color:var(--ok)"></i>
              الإجابة الصحيحة:
            </div>
            <div class="student-q-answer-text is-correct">
              ${escapeHtml(correctChoice.choice_text)}
            </div>
          </div>
        ` : ''}
      `;
    } else {
      const essayText = ans.essay_text || '';
      const isEmpty = !essayText.trim();
      answerHtml = `
        <div class="student-q-answer-block">
          <div class="student-q-answer-label">
            <i class="fa-solid fa-pen-fancy"></i>
            إجابتك:
          </div>
          <div class="student-q-answer-text ${isEmpty ? 'is-empty' : ''}">
            ${isEmpty ? 'لم تجب على السؤال' : escapeHtml(essayText)}
          </div>
        </div>
      `;
    }

    // تعليق المدرس
    let feedbackHtml = '';
    if (ans.teacher_feedback && ans.teacher_feedback.trim()) {
      feedbackHtml = `
        <div class="student-q-feedback">
          <div class="student-q-feedback__head">
            <i class="fa-solid fa-comment-dots"></i>
            تعليق الأستاذ:
          </div>
          <div class="student-q-feedback__body">
            ${escapeHtml(ans.teacher_feedback)}
          </div>
        </div>
      `;
    }

    listHtml += `
      <div class="student-q-item ${statusCls}">
        <div class="student-q-head">
          <div class="student-q-num">${idx + 1}</div>
          ${typeBadge}
          <div class="student-q-marks">
            <i class="fa-solid fa-star"></i>
            <b>${awarded}</b>
            <span>/ ${maxMarks}</span>
          </div>
          <div class="student-q-status">
            <i class="fa-solid ${statusIcon}"></i>
            ${statusLabel}
          </div>
        </div>

        ${questionHtml}
        ${answerHtml}
        ${feedbackHtml}
      </div>
    `;
  });

  listHtml += '</div>';

  return hero + listHtml;
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

  /* ─── Modal أحداث ─── */
  document.getElementById('closeStudentAttemptModal')?.addEventListener('click', closeStudentAttemptModal);
  document.getElementById('studentAttemptModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeStudentAttemptModal();
  });

  // ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('studentAttemptModal');
      if (modal && !modal.hidden) closeStudentAttemptModal();
    }
  });

  // تحميل
  loadStats();
  loadAvailableExams();
  loadAssignments();
  loadPendingAttempts();
  loadGradedAttempts();
});