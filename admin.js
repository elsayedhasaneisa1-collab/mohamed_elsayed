'use strict';

/* ─────────────── الحالة ─────────────── */
let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let cache = { pending: [], students: [], exams: [], attempts: [], pdf: [] };

// حالة إنشاء الامتحان
let examModalState = {
  isOpen: false,
  editingId: null,      // لو بنعدّل
  kind: 'exam',         // exam / assignment
  questions: [],        // الأسئلة الحالية
  maxQuestions: 15      // 15 للامتحان، 5 للواجب
};

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
      <div class="mcard__acts">
        <button class="btn btn--gold btn--sm" data-action="approve" data-id="${p.id}">
          <i class="fa-solid fa-check"></i> موافقة
        </button>
        <button class="btn btn--danger btn--sm" data-action="reject" data-id="${p.id}">
          <i class="fa-solid fa-xmark"></i> رفض
        </button>
      </div>
    </div>
  `;
}

function bindPendingActions() {
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
      <div class="mcard__acts">
        <button class="btn btn--line btn--sm" data-action="toggle" data-id="${s.id}">
          <i class="fa-solid fa-ban"></i> إيقاف
        </button>
        <button class="btn btn--danger btn--sm" data-action="delete" data-id="${s.id}">
          <i class="fa-solid fa-trash"></i> حذف
        </button>
      </div>
    </div>
  `;
}

function bindStudentActions() {
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
          message: `سيتوقف "${name}" عن الدخول للمنصة.`,
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
          message: `سيتم حذف "${name}" وكل بياناته.`,
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
   3. الامتحانات والواجبات
   ═══════════════════════════════════════════════════════════════ */
async function loadExams() {
  const c = document.getElementById('examsContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('exams')
      .select('id, title, grade, type, branch, duration_minutes, opens_at, closes_at, total_marks, status, kind, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.exams = data || [];

    if (!data?.length) {
      c.innerHTML = emptyState('fa-file-pen', 'مفيش امتحانات', 'ابدأ بإنشاء امتحان أو واجب جديد');
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
  const isAssignment = e.kind === 'assignment';

  let statusBadge = '';
  if (e.status === 'draft') statusBadge = '<span class="badge badge--mut"><i class="fa-solid fa-pen"></i> مسودة</span>';
  else if (now < opens) statusBadge = '<span class="badge badge--info"><i class="fa-solid fa-clock"></i> لم يفتح</span>';
  else if (now > closes) statusBadge = '<span class="badge badge--err"><i class="fa-solid fa-lock"></i> مقفول</span>';
  else statusBadge = '<span class="badge badge--ok"><i class="fa-solid fa-play"></i> مفتوح</span>';

  const kindBadge = isAssignment
    ? '<span class="badge badge--info"><i class="fa-solid fa-clipboard-check"></i> واجب</span>'
    : '<span class="badge badge--gold"><i class="fa-solid fa-file-pen"></i> امتحان</span>';

  return `
    <div class="mcard" data-id="${e.id}">
      <div class="mcard__top">
        <h4>${escapeHtml(e.title)}</h4>
        ${kindBadge}
        ${statusBadge}
      </div>
      <div class="mcard__rows">
        <div><b>الصف:</b> ${escapeHtml(e.grade || '—')}</div>
        <div><b>النوع:</b> ${escapeHtml(e.type || 'عام')}${e.branch ? ' - ' + escapeHtml(e.branch) : ''}</div>
        <div><b>المدة:</b> ${e.duration_minutes} دقيقة</div>
        <div><b>يفتح:</b> ${formatDate(e.opens_at)}</div>
        <div><b>يقفل:</b> ${formatDate(e.closes_at)}</div>
      </div>
      <div class="mcard__acts">
        <button class="btn btn--line btn--sm" data-action="edit" data-id="${e.id}">
          <i class="fa-solid fa-pen"></i> تعديل
        </button>
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
    </div>
  `;
}

function bindExamActions() {
  $$('#examsContainer [data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const card = btn.closest('.mcard');
      const title = card.querySelector('h4').textContent;

      try {
        if (action === 'edit') {
          await openExamModal(id);
          return;

        } else if (action === 'publish') {
          const ok = await UI.confirm({
            type: 'success',
            title: 'نشر؟',
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
            title: 'إغلاق؟',
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
            title: 'حذف؟',
            message: `سيتم حذف "${title}" وكل أسئلته.`,
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
   Modal إنشاء / تعديل امتحان
   ═══════════════════════════════════════════════════════════════ */
function openExamModal(editId = null) {
  const modal = document.getElementById('examModal');
  if (!modal) return;

  examModalState.isOpen = true;
  examModalState.editingId = editId;
  examModalState.kind = 'exam';
  examModalState.maxQuestions = 15;
  examModalState.questions = [];

  // reset
  document.getElementById('examModalTitle').textContent = editId ? 'تعديل' : 'إنشاء امتحان';

  // لو بنعدّل → نجيب البيانات
  if (editId) {
    loadExamForEdit(editId);
  } else {
    resetExamForm();
  }

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeExamModal() {
  const modal = document.getElementById('examModal');
  if (!modal) return;

  modal.hidden = true;
  document.body.style.overflow = '';
  examModalState.isOpen = false;
  examModalState.editingId = null;
  examModalState.questions = [];
}

function resetExamForm() {
  document.getElementById('examTitle').value = '';
  document.getElementById('examDesc').value = '';
  document.getElementById('examDuration').value = '60';
  document.getElementById('examPassMarks').value = '50';

  // وقت الفتح = الآن
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('examOpensAt').value = now.toISOString().slice(0, 16);

  // وقت الإغلاق = بعد أسبوع
  const week = new Date();
  week.setDate(week.getDate() + 7);
  week.setMinutes(week.getMinutes() - week.getTimezoneOffset());
  document.getElementById('examClosesAt').value = week.toISOString().slice(0, 16);

  // مسح الاختيارات
  $$('input[name="grade"]').forEach(i => i.checked = false);
  $$('input[name="type"]').forEach(i => i.checked = false);
  $$('input[name="branch"]').forEach(i => i.checked = false);

  // tabs
  document.querySelector('input[name="examKind"][value="exam"]').checked = true;
  updateKindTabs();
  updateBranchesVisibility();

  // مسح الأسئلة
  examModalState.questions = [];
  examModalState.maxQuestions = 15;
  document.getElementById('questionsMax').textContent = '15';
  renderQuestions();
}

function updateKindTabs() {
  const kind = document.querySelector('input[name="examKind"]:checked')?.value || 'exam';
  examModalState.kind = kind;
  examModalState.maxQuestions = kind === 'exam' ? 15 : 5;

  $$('.exam-kind-tab').forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.kind === kind);
  });

  document.getElementById('questionsMax').textContent = examModalState.maxQuestions;
  document.getElementById('examModalTitle').textContent =
    (examModalState.editingId ? 'تعديل ' : 'إنشاء ') + (kind === 'exam' ? 'امتحان' : 'واجب');

  // لو عدد الأسئلة أكبر من الحد الجديد، نقص
  if (examModalState.questions.length > examModalState.maxQuestions) {
    examModalState.questions = examModalState.questions.slice(0, examModalState.maxQuestions);
  }

  renderQuestions();
}

function updateBranchesVisibility() {
  const types = $$('input[name="type"]:checked').map(i => i.value);
  const grades = $$('input[name="grade"]:checked').map(i => i.value);

  const hasAzhar = types.includes('أزهر');
  const hasThanwy = grades.some(g => g.includes('ثانوي'));

  const section = document.getElementById('branchesSection');
  if (hasAzhar && hasThanwy) {
    section.hidden = false;
  } else {
    section.hidden = true;
    $$('input[name="branch"]').forEach(i => i.checked = false);
  }
}

/* ─────────────── الأسئلة ─────────────── */
function renderQuestions() {
  const list = document.getElementById('questionsList');
  if (!list) return;

  const count = examModalState.questions.length;
  document.getElementById('questionsCount').textContent = count;

  if (!count) {
    list.innerHTML = `
      <div class="empty-state" style="padding:30px 20px">
        <i class="fa-solid fa-list-check"></i>
        <h4>لسه مفيش أسئلة</h4>
        <p>اضغط "إضافة سؤال" لتبدأ</p>
      </div>
    `;
    return;
  }

  list.innerHTML = examModalState.questions.map((q, i) => questionItem(q, i)).join('');

  // ربط الأحداث
  bindQuestionEvents();

  // تحديث حالة زرار الإضافة
  const addBtn = document.getElementById('addQuestionBtn');
  if (addBtn) {
    addBtn.disabled = count >= examModalState.maxQuestions;
    if (count >= examModalState.maxQuestions) {
      addBtn.innerHTML = `<i class="fa-solid fa-circle-info"></i> وصلت للحد الأقصى (${examModalState.maxQuestions})`;
    } else {
      addBtn.innerHTML = `<i class="fa-solid fa-plus"></i> إضافة سؤال`;
    }
  }
}

function questionItem(q, index) {
  const letters = ['أ', 'ب', 'ج', 'د'];
  const isMcq = q.question_type === 'mcq';

  return `
    <div class="q-item" data-qindex="${index}">
      <div class="q-item__head">
        <div class="q-item__num">${index + 1}</div>
        <div class="q-type-tabs">
          <label class="q-type-tab ${isMcq ? '' : ''}">
            <input type="radio" name="qtype_${index}" value="mcq" ${isMcq ? 'checked' : ''} data-qidx="${index}" data-qtype="mcq">
            <i class="fa-solid fa-list-ul"></i>
            MCQ
          </label>
          <label class="q-type-tab">
            <input type="radio" name="qtype_${index}" value="essay" ${!isMcq ? 'checked' : ''} data-qidx="${index}" data-qtype="essay">
            <i class="fa-solid fa-pen-fancy"></i>
            مقالي
          </label>
        </div>
        <button type="button" class="q-item__del" data-del="${index}" title="حذف السؤال">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>

      <div class="q-field">
        <label><i class="fa-solid fa-question"></i> نص السؤال <span class="req">*</span></label>
        <textarea class="q-textarea" data-field="text" data-qidx="${index}" placeholder="اكتب السؤال هنا...">${escapeHtml(q.question_text || '')}</textarea>
      </div>

      <div class="q-row">
        <div class="q-field">
          <label><i class="fa-solid fa-star"></i> الدرجة</label>
          <input type="number" class="q-input" data-field="marks" data-qidx="${index}" value="${q.marks || 1}" min="1" max="100">
        </div>
      </div>

      ${isMcq ? renderMcqChoices(q, index, letters) : ''}
    </div>
  `;
}

function renderMcqChoices(q, index, letters) {
  const choices = q.choices && q.choices.length === 4
    ? q.choices
    : [
        { choice_text: '', is_correct: false },
        { choice_text: '', is_correct: false },
        { choice_text: '', is_correct: false },
        { choice_text: '', is_correct: false }
      ];

  return `
    <div class="q-field">
      <label><i class="fa-solid fa-list"></i> الاختيارات <span class="req">*</span>
        <span style="color:var(--muted);font-weight:400;font-size:.75rem">— اختر الإجابة الصحيحة</span>
      </label>
      <div class="q-choices">
        ${choices.map((c, ci) => `
          <div class="q-choice ${c.is_correct ? 'is-correct' : ''}">
            <label class="q-choice__radio">
              <input type="radio" name="correct_${index}" value="${ci}" ${c.is_correct ? 'checked' : ''} data-correct="${index}" data-ci="${ci}">
              <span></span>
            </label>
            <div class="q-choice__letter">${letters[ci]}</div>
            <input type="text" data-choice="${index}" data-ci="${ci}" value="${escapeHtml(c.choice_text || '')}" placeholder="الاختيار ${letters[ci]}">
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function bindQuestionEvents() {
  const list = document.getElementById('questionsList');

  // حذف سؤال
  $$('[data-del]', list).forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.del, 10);
      const ok = await UI.confirm({
        type: 'danger',
        title: 'حذف السؤال؟',
        message: `سيتم حذف السؤال رقم ${idx + 1}.`,
        confirmText: 'حذف',
        cancelText: 'إلغاء'
      });
      if (!ok) return;
      examModalState.questions.splice(idx, 1);
      renderQuestions();
    });
  });

  // تغيير نوع السؤال
  $$('[data-qtype]', list).forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.qidx, 10);
      const type = input.dataset.qtype;
      const q = examModalState.questions[idx];
      if (!q) return;
      q.question_type = type;

      // لو MCQ ولسه مش عنده choices → نضيف 4
      if (type === 'mcq' && (!q.choices || q.choices.length !== 4)) {
        q.choices = [
          { choice_text: '', is_correct: false },
          { choice_text: '', is_correct: false },
          { choice_text: '', is_correct: false },
          { choice_text: '', is_correct: false }
        ];
      }
      renderQuestions();
    });
  });

  // نص السؤال
  $$('[data-field="text"]', list).forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.qidx, 10);
      if (examModalState.questions[idx]) {
        examModalState.questions[idx].question_text = el.value;
      }
    });
  });

  // الدرجة
  $$('[data-field="marks"]', list).forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.qidx, 10);
      if (examModalState.questions[idx]) {
        examModalState.questions[idx].marks = parseInt(el.value, 10) || 1;
      }
    });
  });

  // نص الاختيار
  $$('[data-choice]', list).forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.choice, 10);
      const ci = parseInt(el.dataset.ci, 10);
      const q = examModalState.questions[idx];
      if (q && q.choices && q.choices[ci]) {
        q.choices[ci].choice_text = el.value;
      }
    });
  });

  // الإجابة الصحيحة
  $$('[data-correct]', list).forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.correct, 10);
      const ci = parseInt(input.dataset.ci, 10);
      const q = examModalState.questions[idx];
      if (q && q.choices) {
        q.choices.forEach((c, i) => c.is_correct = (i === ci));
      }
      // تحديث الـ UI
      const item = input.closest('.q-item');
      $$('.q-choice', item).forEach((ch, i) => {
        ch.classList.toggle('is-correct', i === ci);
      });
    });
  });
}

function addQuestion() {
  if (examModalState.questions.length >= examModalState.maxQuestions) {
    Toast.warn('وصلت للحد الأقصى', `الحد الأقصى ${examModalState.maxQuestions} أسئلة`);
    return;
  }

  examModalState.questions.push({
    question_text: '',
    question_type: 'mcq',
    marks: 1,
    choices: [
      { choice_text: '', is_correct: false },
      { choice_text: '', is_correct: false },
      { choice_text: '', is_correct: false },
      { choice_text: '', is_correct: false }
    ]
  });

  renderQuestions();

  // scroll للأسفل
  const list = document.getElementById('questionsList');
  list?.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/* ─────────────── حفظ ─────────────── */
async function saveExam(status = 'draft') {
  try {
    // 1) جمع البيانات
    const title = document.getElementById('examTitle').value.trim();
    const description = document.getElementById('examDesc').value.trim();
    const duration = parseInt(document.getElementById('examDuration').value, 10);
    const passMarks = parseInt(document.getElementById('examPassMarks').value, 10) || 0;
    const opensAt = document.getElementById('examOpensAt').value;
    const closesAt = document.getElementById('examClosesAt').value;
    const kind = examModalState.kind;

    const grades = $$('input[name="grade"]:checked').map(i => i.value);
    const types = $$('input[name="type"]:checked').map(i => i.value);
    const branches = $$('input[name="branch"]:checked').map(i => i.value);

    // 2) تحقق
    const errs = [];
    if (!title) errs.push('العنوان مطلوب');
    if (!grades.length) errs.push('اختر صف واحد على الأقل');
    if (!types.length) errs.push('اختر نوع واحد على الأقل');
    if (!duration || duration < 1) errs.push('المدة غير صحيحة');
    if (!closesAt) errs.push('وقت الإغلاق مطلوب');

    // لو أزهر + ثانوي → لازم فرع
    const hasAzhar = types.includes('أزهر');
    const hasThanwy = grades.some(g => g.includes('ثانوي'));
    if (hasAzhar && hasThanwy && !branches.length) {
      errs.push('اختر فرع واحد على الأقل (علمي / أدبي)');
    }

    if (!examModalState.questions.length) {
      errs.push('لازم تضيف سؤال واحد على الأقل');
    }

    // تحقق من كل سؤال
    for (let i = 0; i < examModalState.questions.length; i++) {
      const q = examModalState.questions[i];
      if (!q.question_text.trim()) {
        errs.push(`السؤال ${i + 1}: النص مطلوب`);
        break;
      }
      if (q.question_type === 'mcq') {
        const emptyChoice = q.choices.findIndex(c => !c.choice_text.trim());
        if (emptyChoice !== -1) {
          errs.push(`السؤال ${i + 1}: الاختيار ${emptyChoice + 1} فاضي`);
          break;
        }
        if (!q.choices.some(c => c.is_correct)) {
          errs.push(`السؤال ${i + 1}: اختر الإجابة الصحيحة`);
          break;
        }
      }
    }

    if (errs.length) {
      Toast.warn('تحقق من البيانات', errs[0]);
      return;
    }

    // 3) حساب total_marks
    const totalMarks = examModalState.questions.reduce((s, q) => s + (q.marks || 0), 0);

    // 4) تحويل التواريخ لـ ISO
    const opensISO = opensAt ? new Date(opensAt).toISOString() : new Date().toISOString();
    const closesISO = new Date(closesAt).toISOString();

    // 5) بناء الـ payload (نحفظ الصف الأول + النوع الأول + الفرع الأول)
    // (لأن الجداول مش بتدعم arrays في النسخة الحالية)
    const payload = {
      title,
      description,
      grade: grades[0],
      type: types[0],
      branch: branches[0] || null,
      duration_minutes: duration,
      opens_at: opensISO,
      closes_at: closesISO,
      total_marks: totalMarks,
      pass_marks: passMarks,
      status,
      kind,
      created_by: currentUser.id
    };

    // 6) حفظ أو تحديث
    let examId = examModalState.editingId;

    if (examId) {
      // تحديث
      const { error } = await supabaseClient
        .from('exams')
        .update(payload)
        .eq('id', examId);
      if (error) throw error;

      // مسح الأسئلة القديمة + إضافة الجديدة
      await supabaseClient.from('questions').delete().eq('exam_id', examId);
    } else {
      // إنشاء
      const { data, error } = await supabaseClient
        .from('exams')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      examId = data.id;
    }

    // 7) حفظ الأسئلة + الاختيارات
    for (let i = 0; i < examModalState.questions.length; i++) {
      const q = examModalState.questions[i];

      const { data: qData, error: qErr } = await supabaseClient
        .from('questions')
        .insert({
          exam_id: examId,
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          marks: q.marks || 1,
          order_index: i
        })
        .select('id')
        .single();

      if (qErr) throw qErr;

      // لو MCQ → احفظ الاختيارات
      if (q.question_type === 'mcq' && q.choices) {
        const choicesPayload = q.choices.map((c, ci) => ({
          question_id: qData.id,
          choice_text: c.choice_text.trim(),
          is_correct: c.is_correct,
          order_index: ci
        }));

        const { error: cErr } = await supabaseClient.from('choices').insert(choicesPayload);
        if (cErr) throw cErr;
      }
    }

    // 8) نجاح
    Toast.success(
      status === 'published' ? 'تم النشر ✅' : 'تم الحفظ ✅',
      `تم ${status === 'published' ? 'نشر' : 'حفظ'} "${title}"`
    );

    closeExamModal();
    loadExams();
    loadStats();

  } catch (err) {
    console.error(err);
    Toast.error('خطأ', err.message || 'حاول تاني');
  }
}

/* ─────────────── تحميل امتحان للتعديل ─────────────── */
async function loadExamForEdit(examId) {
  try {
    const { data: exam, error } = await supabaseClient
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();

    if (error || !exam) {
      Toast.error('خطأ', 'مش قادر أجيب الامتحان');
      closeExamModal();
      return;
    }

    // 1) الأساسيات
    document.getElementById('examTitle').value = exam.title || '';
    document.getElementById('examDesc').value = exam.description || '';
    document.getElementById('examDuration').value = exam.duration_minutes || 60;
    document.getElementById('examPassMarks').value = exam.pass_marks || 50;

    // التواريخ
    if (exam.opens_at) {
      const d = new Date(exam.opens_at);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      document.getElementById('examOpensAt').value = d.toISOString().slice(0, 16);
    }
    if (exam.closes_at) {
      const d = new Date(exam.closes_at);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      document.getElementById('examClosesAt').value = d.toISOString().slice(0, 16);
    }

    // 2) الصف / النوع / الفرع (checkbox)
    $$('input[name="grade"]').forEach(i => i.checked = (i.value === exam.grade));
    $$('input[name="type"]').forEach(i => i.checked = (i.value === exam.type));
    $$('input[name="branch"]').forEach(i => i.checked = (i.value === exam.branch));

    // 3) النوع (امتحان / واجب)
    const kind = exam.kind || 'exam';
    document.querySelector(`input[name="examKind"][value="${kind}"]`).checked = true;
    examModalState.kind = kind;
    examModalState.maxQuestions = kind === 'exam' ? 15 : 5;
    document.getElementById('questionsMax').textContent = examModalState.maxQuestions;

    $$('.exam-kind-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.kind === kind);
    });

    updateBranchesVisibility();

    // 4) الأسئلة
    const { data: questions } = await supabaseClient
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('order_index', { ascending: true });

    const qIds = (questions || []).map(q => q.id);
    let allChoices = [];
    if (qIds.length) {
      const { data: choices } = await supabaseClient
        .from('choices')
        .select('*')
        .in('question_id', qIds)
        .order('order_index', { ascending: true });
      allChoices = choices || [];
    }

    examModalState.questions = (questions || []).map(q => ({
      question_text: q.question_text,
      question_type: q.question_type,
      marks: q.marks,
      choices: q.question_type === 'mcq'
        ? allChoices.filter(c => c.question_id === q.id).map(c => ({
            choice_text: c.choice_text,
            is_correct: c.is_correct
          }))
        : []
    }));

    renderQuestions();

    // 5) تغيير العنوان
    document.getElementById('examModalTitle').textContent =
      'تعديل ' + (kind === 'exam' ? 'امتحان' : 'واجب');

  } catch (err) {
    console.error(err);
    Toast.error('خطأ', 'حاول تاني');
    closeExamModal();
  }
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

  const deleteBtn = done
    ? `<button class="btn btn--danger btn--sm" data-action="delete" data-id="${a.id}">
        <i class="fa-solid fa-trash"></i> مسح من القاعدة
      </button>`
    : `<button class="btn btn--line btn--sm" disabled>
        <i class="fa-solid fa-lock"></i> لازم تنزّل الأول
      </button>`;

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
  const count = cache.pdf.filter(a => a.pdf_exported).length;
  btn.disabled = count === 0;
  btn.innerHTML = `<i class="fa-solid fa-trash"></i> مسح اللي اتنزل (${count})`;
}

async function deleteExported() {
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
  isAdmin = (currentProfile.role === 'admin');

  if (currentProfile.role === 'teacher') {
    const titleEl = document.querySelector('.admin-top__title h1');
    if (titleEl) titleEl.textContent = 'لوحة المدرس';
    const subtitleEl = document.querySelector('.admin-top__title small');
    if (subtitleEl) subtitleEl.textContent = 'إدارة كاملة';
  }

  initTabs();

  /* ─── أزرار الهيدر ─── */
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

  /* ─── بحث ─── */
  document.getElementById('searchPending')?.addEventListener('input', () => {
    const q = document.getElementById('searchPending').value.toLowerCase();
    $$('#pendingContainer .mcard').forEach(card => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  document.getElementById('searchStudents')?.addEventListener('input', renderStudents);
  document.getElementById('filterGrade')?.addEventListener('change', renderStudents);
  document.getElementById('filterAttempts')?.addEventListener('change', renderAttempts);

  /* ─── PDF ─── */
  document.getElementById('downloadAllPdfBtn')?.addEventListener('click', downloadAllPdf);
  document.getElementById('deleteExportedBtn')?.addEventListener('click', deleteExported);

  /* ─── إنشاء امتحان ─── */
  document.getElementById('newExamBtn')?.addEventListener('click', () => {
    openExamModal();
  });

  /* ─── Modal أحداث ─── */
  document.getElementById('closeExamModal')?.addEventListener('click', closeExamModal);
  document.getElementById('cancelExamBtn')?.addEventListener('click', closeExamModal);

  // الإغلاق بـ ESC أو backdrop
  document.getElementById('examModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeExamModal();
  });

  // tabs الامتحان/الواجب
  $$('.exam-kind-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const kind = tab.dataset.kind;
      document.querySelector(`input[name="examKind"][value="${kind}"]`).checked = true;
      updateKindTabs();
    });
  });

  // الصف / النوع (لتحديث الفرع)
  $$('input[name="grade"]').forEach(i => {
    i.addEventListener('change', updateBranchesVisibility);
  });
  $$('input[name="type"]').forEach(i => {
    i.addEventListener('change', updateBranchesVisibility);
  });

  // إضافة سؤال
  document.getElementById('addQuestionBtn')?.addEventListener('click', addQuestion);

  // حفظ
  document.getElementById('saveDraftBtn')?.addEventListener('click', () => saveExam('draft'));
  document.getElementById('publishExamBtn')?.addEventListener('click', () => saveExam('published'));

  /* ─── تحميل أولي ─── */
  loadStats();
  loadPending();
});