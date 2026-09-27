/* ═══════════════════════════════════════════════════════════════
   شاشة الامتحان — منصة الأستاذ محمد عيسى
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ─────────────── الحالة ─────────────── */
let currentUser = null;
let currentProfile = null;
let exam = null;
let questions = [];
let attempt = null;
let answers = {}; // { questionId: { choiceId, essayText } }
let currentIndex = 0;
let timerInterval = null;
let timeLeftMs = 0;
let cheatCount = 0;
const MAX_CHEAT = 3;
let examEnded = false;

/* ═══════════════════════════════════════════════════════════════
   التهيئة
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();

  const ok = await guard();
  if (!ok) return;

  await loadExam();
  if (!exam) return;

  setupAntiCheat();
  setupEventListeners();
});

/* ─────────────── الحماية ─────────────── */
async function guard() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return false; }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'student' || !profile.is_active) {
    window.location.href = 'login.html';
    return false;
  }

  currentUser = session.user;
  currentProfile = profile;
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   تحميل الامتحان
   ═══════════════════════════════════════════════════════════════ */
async function loadExam() {
  const params = new URLSearchParams(window.location.search);
  const examId = params.get('id');

  if (!examId) {
    Toast.error('خطأ', 'معرف الامتحان غير موجود');
    setTimeout(() => window.location.href = 'index.html', 1500);
    return;
  }

  try {
    // الامتحان
    const { data: examData, error: examErr } = await supabaseClient
      .from('exams')
      .select('*')
      .eq('id', examId)
      .eq('status', 'published')
      .maybeSingle();

    if (examErr || !examData) {
      Toast.error('خطأ', 'الامتحان غير موجود أو غير منشور');
      setTimeout(() => window.location.href = 'index.html', 1500);
      return;
    }

    // نتأكد إنه لنفس الصف
    if (examData.grade !== currentProfile.grade) {
      Toast.error('غير مصرح', 'الامتحان ده مش لصفك');
      setTimeout(() => window.location.href = 'index.html', 1500);
      return;
    }

    // نتأكد إن الامتحان مفتوح
    const now = new Date();
    if (new Date(examData.closes_at) < now) {
      Toast.error('انتهى', 'الامتحان ده اتقفل');
      setTimeout(() => window.location.href = 'index.html', 1500);
      return;
    }

    exam = examData;

    // الأسئلة
    const { data: qs, error: qErr } = await supabaseClient
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('order_index', { ascending: true });

    if (qErr || !qs?.length) {
      Toast.error('خطأ', 'الامتحان ده مفيهوش أسئلة');
      setTimeout(() => window.location.href = 'index.html', 1500);
      return;
    }

    // الاختيارات
    const qIds = qs.map(q => q.id);
    const { data: choices } = await supabaseClient
      .from('choices')
      .select('*')
      .in('question_id', qIds)
      .order('order_index', { ascending: true });

    questions = qs.map(q => ({
      ...q,
      choices: (choices || []).filter(c => c.question_id === q.id)
    }));

    // shuffle
    if (exam.shuffle_questions) {
      questions = shuffle(questions);
    }

    // محاولة سابقة
    const { data: existingAttempt } = await supabaseClient
      .from('attempts')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', currentUser.id)
      .maybeSingle();

    if (existingAttempt) {
      if (existingAttempt.status === 'submitted' || existingAttempt.status === 'graded') {
        Toast.warn('تم التسليم', 'إنت سلّمت الامتحان ده بالفعل');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
      }

      // عندنا محاولة جارية — نكملها
      attempt = existingAttempt;
      timeLeftMs = new Date(attempt.expires_at) - new Date();

      // نحمل الإجابات المحفوظة
      const { data: savedAnswers } = await supabaseClient
        .from('answers')
        .select('*')
        .eq('attempt_id', attempt.id);

      (savedAnswers || []).forEach(a => {
        answers[a.question_id] = {
          choiceId: a.selected_choice_id,
          essayText: a.essay_text
        };
      });
    }

    // نعرض شاشة البدء
    showIntro();

  } catch (err) {
    console.error(err);
    Toast.error('خطأ', 'حصلت مشكلة أثناء التحميل');
    setTimeout(() => window.location.href = 'index.html', 1500);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ═══════════════════════════════════════════════════════════════
   شاشة البدء
   ═══════════════════════════════════════════════════════════════ */
function showIntro() {
  document.getElementById('examLoading').hidden = true;
  document.getElementById('examIntro').hidden = false;

  const totalMarks = questions.reduce((s, q) => s + (q.marks || 0), 0);

  $('#introTitle').textContent = exam.title;
  $('#introDesc').textContent = exam.description || '';
  $('#introDuration').textContent = `${exam.duration_minutes} دقيقة`;
  $('#introCount').textContent = `${questions.length} سؤال`;
  $('#introMarks').textContent = `${totalMarks} درجة`;
}

/* ═══════════════════════════════════════════════════════════════
   بدء الامتحان
   ═══════════════════════════════════════════════════════════════ */
async function startExam() {
  if (!attempt) {
    // إنشاء محاولة جديدة
    const expiresAt = new Date(Date.now() + exam.duration_minutes * 60 * 1000).toISOString();

    const { data, error } = await supabaseClient
      .from('attempts')
      .insert({
        exam_id: exam.id,
        student_id: currentUser.id,
        expires_at: expiresAt,
        total_marks: questions.reduce((s, q) => s + (q.marks || 0), 0),
        status: 'in_progress'
      })
      .select()
      .single();

    if (error) {
      Toast.error('خطأ', 'مش قادر أبدأ الامتحان');
      return;
    }

    attempt = data;
    timeLeftMs = exam.duration_minutes * 60 * 1000;
  }

  document.getElementById('examIntro').hidden = true;
  document.getElementById('examStage').hidden = false;
  document.body.classList.add('exam-locked');

  $('#examTitle').textContent = exam.title;
  renderQuestionNav();
  renderQuestion();
  startTimer();
  enterFullscreen();
}

/* ═══════════════════════════════════════════════════════════════
   المؤقت
   ═══════════════════════════════════════════════════════════════ */
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeftMs -= 1000;

    if (timeLeftMs <= 0) {
      timeLeftMs = 0;
      updateTimerDisplay();
      clearInterval(timerInterval);
      endExam('timeout');
      return;
    }

    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const totalSec = Math.floor(timeLeftMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const text = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const el = $('#timerText');
  const wrap = $('#examTimer');
  if (el) el.textContent = text;

  wrap?.classList.remove('is-warning', 'is-danger');
  if (totalSec <= 60) wrap?.classList.add('is-danger');
  else if (totalSec <= 300) wrap?.classList.add('is-warning');
}

/* ═══════════════════════════════════════════════════════════════
   عرض السؤال
   ═══════════════════════════════════════════════════════════════ */
function renderQuestion() {
  const q = questions[currentIndex];
  if (!q) return;

  const container = $('#questionContainer');
  const progress = $('#examProgress');
  const progressFill = $('#progressFill');

  progress.textContent = `السؤال ${currentIndex + 1} من ${questions.length}`;
  progressFill.style.width = `${((currentIndex + 1) / questions.length) * 100}%`;

  const saved = answers[q.id] || {};

  let html = `
    <div class="question-block" data-qid="${q.id}">
      <div class="question-block__num">
        <i class="fa-solid fa-hashtag"></i>
        سؤال ${currentIndex + 1}
      </div>
      <div class="question-block__text">${escapeHtml(q.question_text)}</div>
      <div class="question-block__marks">
        <i class="fa-solid fa-star"></i>
        ${q.marks} ${q.marks === 1 ? 'درجة' : 'درجات'}
      </div>
  `;

  if (q.question_type === 'mcq') {
    html += `<div class="mcq-choices">`;
    q.choices.forEach((c, i) => {
      const checked = saved.choiceId === c.id ? 'checked' : '';
      html += `
        <label class="mcq-choice">
          <input type="radio" name="q_${q.id}" value="${c.id}" ${checked}>
          <span class="mcq-choice__radio"></span>
          <span class="mcq-choice__text">${escapeHtml(c.choice_text)}</span>
        </label>
      `;
    });
    html += `</div>`;
  } else {
    html += `
      <div class="essay-field">
        <label>
          <i class="fa-solid fa-pen-fancy"></i>
          اكتب إجابتك هنا
        </label>
        <textarea id="essay_${q.id}" placeholder="اكتب إجابتك...">${escapeHtml(saved.essayText || '')}</textarea>
        <div class="essay-field__count" id="count_${q.id}">
          ${(saved.essayText || '').length} حرف
        </div>
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;

  // ربط الأحداث
  if (q.question_type === 'mcq') {
    $$(`input[name="q_${q.id}"]`).forEach(input => {
      input.addEventListener('change', () => {
        answers[q.id] = { ...answers[q.id], choiceId: input.value };
        saveAnswer(q.id);
        renderQuestionNav();
      });
    });
  } else {
    const ta = document.getElementById(`essay_${q.id}`);
    const counter = document.getElementById(`count_${q.id}`);
    ta?.addEventListener('input', () => {
      answers[q.id] = { ...answers[q.id], essayText: ta.value };
      if (counter) counter.textContent = `${ta.value.length} حرف`;
      debouncedSaveAnswer(q.id);
    });
  }

  // أزرار
  $('#prevBtn').disabled = currentIndex === 0;
  $('#nextBtn').innerHTML = currentIndex === questions.length - 1
    ? '<i class="fa-solid fa-paper-plane"></i> تسليم الامتحان'
    : 'التالي <i class="fa-solid fa-arrow-left"></i>';

  updateNavButtons();
}

function renderQuestionNav() {
  const nav = $('#questionNav');
  if (!nav) return;

  nav.innerHTML = questions.map((q, i) => {
    const answered = answers[q.id] &&
      (answers[q.id].choiceId || (answers[q.id].essayText && answers[q.id].essayText.trim()));
    const cls = [
      'q-nav-btn',
      i === currentIndex ? 'is-current' : '',
      answered ? 'is-answered' : ''
    ].filter(Boolean).join(' ');

    return `<button class="${cls}" data-idx="${i}">${i + 1}</button>`;
  }).join('');

  $$('.q-nav-btn', nav).forEach(btn => {
    btn.addEventListener('click', () => {
      currentIndex = parseInt(btn.dataset.idx, 10);
      renderQuestion();
    });
  });
}

function updateNavButtons() {
  // نحدّث حالة الأسئلة في النافبار
  $$('.q-nav-btn').forEach((btn, i) => {
    const q = questions[i];
    if (!q) return;
    const answered = answers[q.id] &&
      (answers[q.id].choiceId || (answers[q.id].essayText && answers[q.id].essayText.trim()));
    btn.classList.toggle('is-answered', !!answered);
  });
}

/* ═══════════════════════════════════════════════════════════════
   حفظ الإجابات
   ═══════════════════════════════════════════════════════════════ */
const saveTimers = {};

function debouncedSaveAnswer(questionId) {
  clearTimeout(saveTimers[questionId]);
  saveTimers[questionId] = setTimeout(() => saveAnswer(questionId), 800);
}

async function saveAnswer(questionId) {
  if (!attempt) return;

  const q = questions.find(x => x.id === questionId);
  if (!q) return;

  const ans = answers[questionId] || {};

  try {
    // نشوف لو موجودة
    const { data: existing } = await supabaseClient
      .from('answers')
      .select('id')
      .eq('attempt_id', attempt.id)
      .eq('question_id', questionId)
      .maybeSingle();

    const payload = {
      attempt_id: attempt.id,
      question_id: questionId,
      selected_choice_id: ans.choiceId || null,
      essay_text: ans.essayText || null,
      answered_at: new Date().toISOString()
    };

    if (existing) {
      await supabaseClient.from('answers').update(payload).eq('id', existing.id);
    } else {
      await supabaseClient.from('answers').insert(payload);
    }
  } catch (err) {
    console.error('Save error:', err);
  }
}

async function saveAllAnswers() {
  for (const q of questions) {
    await saveAnswer(q.id);
  }
}

/* ═══════════════════════════════════════════════════════════════
   نهاية الامتحان
   ═══════════════════════════════════════════════════════════════ */
async function endExam(reason = 'submit') {
  if (examEnded) return;
  examEnded = true;

  clearInterval(timerInterval);

  Toast.info('جارٍ التسليم...', 'من فضلك استنى');

  // احفظ كل الإجابات
  await saveAllAnswers();

  // احسب الدرجة للـ MCQ
  let score = 0;
  for (const q of questions) {
    const ans = answers[q.id];
    if (!ans) continue;

    if (q.question_type === 'mcq' && ans.choiceId) {
      const choice = q.choices.find(c => c.id === ans.choiceId);
      if (choice?.is_correct) score += q.marks || 0;
    }
  }

  // تحديث المحاولة
  try {
    await supabaseClient
      .from('attempts')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        score
      })
      .eq('id', attempt.id);
  } catch (err) {
    console.error(err);
  }

  // خروج من fullscreen
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  // شاشة النتيجة
  document.getElementById('examStage').hidden = true;
  document.getElementById('examResult').hidden = false;
  document.body.classList.remove('exam-locked');

  $('#resultScore').textContent = score;

  if (reason === 'timeout') {
    Toast.warn('انتهى الوقت', 'تم تسليم إجاباتك تلقائياً');
  } else if (reason === 'cheat') {
    Toast.error('تم إنهاء الامتحان', 'بسبب تجاوز عدد التحذيرات');
  } else {
    Toast.success('تم التسليم ✅', 'هيتم التصحيح من قِبل الأستاذ');
  }
}

/* ═══════════════════════════════════════════════════════════════
   منع الغش
   ═══════════════════════════════════════════════════════════════ */
function setupAntiCheat() {
  // منع النسخ
  document.addEventListener('copy', e => { e.preventDefault(); });
  document.addEventListener('cut', e => { e.preventDefault(); });
  document.addEventListener('paste', e => { e.preventDefault(); });
  document.addEventListener('contextmenu', e => { e.preventDefault(); });

  // منع اختصارات
  document.addEventListener('keydown', e => {
    if (e.key === 'F12') { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key.toUpperCase())) {
      e.preventDefault(); return;
    }
    if (e.ctrlKey && ['U','P','S'].includes(e.key.toUpperCase())) {
      e.preventDefault(); return;
    }
  });

  // كشف الخروج من الشاشة
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !examEnded) {
      registerCheat('خروج من الشاشة');
    }
  });

  window.addEventListener('blur', () => {
    if (!examEnded) registerCheat('فقدان التركيز');
  });

  // منع الرجوع
  history.pushState(null, '', location.href);
  window.addEventListener('popstate', () => {
    history.pushState(null, '', location.href);
  });
}

function registerCheat(reason) {
  if (examEnded) return;
  cheatCount++;

  // سجّل في قاعدة البيانات
  if (attempt) {
    supabaseClient.from('cheat_logs').insert({
      attempt_id: attempt.id,
      event_type: reason,
      event_details: navigator.userAgent
    }).then(() => {});
  }

  if (cheatCount >= MAX_CHEAT) {
    endExam('cheat');
    return;
  }

  // أظهر التحذير
  const warning = $('#cheatWarning');
  $('#cheatMsg').textContent = `تم رصد: ${reason}`;
  $('#cheatCount').textContent = cheatCount;
  warning.hidden = false;
}

/* ═══════════════════════════════════════════════════════════════
   Fullscreen
   ═══════════════════════════════════════════════════════════════ */
function enterFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }
}

/* ═══════════════════════════════════════════════════════════════
   الأحداث
   ═══════════════════════════════════════════════════════════════ */
function setupEventListeners() {
  document.getElementById('startExamBtn')?.addEventListener('click', startExam);

  document.getElementById('prevBtn')?.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  });

  document.getElementById('nextBtn')?.addEventListener('click', () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      if (confirm('متأكد إنك عايز تسلّم الامتحان؟')) {
        endExam('submit');
      }
    }
  });

  document.getElementById('resumeExamBtn')?.addEventListener('click', () => {
    $('#cheatWarning').hidden = true;
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (!examEnded && attempt) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
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