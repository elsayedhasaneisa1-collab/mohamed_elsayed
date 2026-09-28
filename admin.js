/* ═══════════════════════════════════════════════════════════════
   admin.js — لوحة التحكم
   منصة الأستاذ محمد عيسى
   الكورسات + الفولدرات + الاشتراكات + الامتحانات + التصحيح
   ═══════════════════════════════════════════════════════════════ */

'use strict';

let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let cache = {
  pending: [],
  students: [],
  courses: [],
  enrollments: [],
  exams: [],
  attempts: [],
  grading: [],
  pdf: []
};
let currentDetailsAttempt = null;
let currentGradingAttempt = null;
let gradingAnswers = {};
let currentCourseId = null;
let currentFolderId = null;
let currentItemId = null;

let examModalState = {
  isOpen: false,
  editingId: null,
  kind: 'exam',
  questions: [],
  maxQuestions: 15
};

/* ═══════════════════════════════════════════════════════════════
   الإحصائيات
   ═══════════════════════════════════════════════════════════════ */
async function loadStats() {
  try {
    const [profilesRes, coursesRes, enrollmentsRes, examsRes, toGradeRes] = await Promise.all([
      supabaseClient.from('profiles').select('is_active, role').eq('role', 'student').limit(1000),
      supabaseClient.from('courses').select('id', { count: 'exact', head: true }),
      supabaseClient.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseClient.from('exams').select('id', { count: 'exact', head: true }),
      supabaseClient.from('attempts').select('id', { count: 'exact', head: true }).eq('status', 'submitted')
    ]);

    const students = profilesRes.data || [];
    const pendingCount = students.filter(s => !s.is_active).length;
    const studentsCount = students.filter(s => s.is_active).length;
    const coursesCount = coursesRes.count ?? 0;
    const enrollmentsCount = enrollmentsRes.count ?? 0;
    const examsCount = examsRes.count ?? 0;
    const toGradeCount = toGradeRes.count ?? 0;

    setText('statPending', pendingCount);
    setText('statStudents', studentsCount);
    setText('statCourses', coursesCount);
    setText('statEnrollments', enrollmentsCount);
    setText('statExams', examsCount);
    setText('statToGrade', toGradeCount);

    setText('cntPending', pendingCount);
    setText('cntStudents', studentsCount);
    setText('cntCourses', coursesCount);
    setText('cntEnrollments', enrollmentsCount);
    setText('cntExams', examsCount);
    setText('cntGrading', toGradeCount);

  } catch (err) {
    console.error('Stats error:', err);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ═══════════════════════════════════════════════════════════════
   Tabs
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
        else if (tab === 'courses') loadCourses();
        else if (tab === 'enrollments') loadEnrollments();
        else if (tab === 'exams') loadExams();
        else if (tab === 'grading') loadGrading();
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
            message: `سيتم تفعيل حساب "${name}".`,
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
            message: `سيتم حذف حساب "${name}" نهائياً.`,
            confirmText: 'حذف نهائي',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

          const { error } = await supabaseClient.rpc('delete_user_completely', { p_user_id: id });
          if (error) {
            console.warn('RPC failed, deleting from profiles only:', error);
            const { error: pErr } = await supabaseClient.from('profiles').delete().eq('id', id);
            if (pErr) throw pErr;
            Toast.warn('تم الحذف', 'الحساب محذوف.');
          } else {
            Toast.warn('تم الرفض', `تم حذف حساب ${name} نهائياً`);
          }
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
          message: `سيتوقف "${name}" عن الدخول.`,
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
   3. الكورسات
   ═══════════════════════════════════════════════════════════════ */
async function loadCourses() {
  const c = document.getElementById('coursesContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('courses')
      .select(`
        id, title, description, cover_url, grade, type, branch, is_published, created_at,
        folders:folders (count)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.courses = data || [];
    renderCourses();

  } catch (err) {
    console.error(err);
    c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تحدّث الصفحة');
  }
}

function renderCourses() {
  const c = document.getElementById('coursesContainer');
  const q = (document.getElementById('searchCourses')?.value || '').toLowerCase().trim();

  let list = cache.courses;
  if (q) list = list.filter(x =>
    x.title.toLowerCase().includes(q) ||
    (x.description || '').toLowerCase().includes(q)
  );

  if (!list.length) {
    c.innerHTML = emptyState('fa-book-open', 'مفيش كورسات', 'ابدأ بإنشاء كورس جديد');
    return;
  }

  c.innerHTML = `<div class="cards-mobile">${list.map(courseCard).join('')}</div>`;
  bindCourseActions();
}

function courseCard(course) {
  const foldersCount = Array.isArray(course.folders) && course.folders[0]?.count !== undefined
    ? course.folders[0].count
    : 0;

  const coverHtml = course.cover_url
    ? `<img src="${escapeHtml(course.cover_url)}" alt="${escapeHtml(course.title)}" loading="lazy">`
    : `<i class="fa-solid fa-book-open"></i>`;

  const statusBadge = course.is_published
    ? '<span class="badge badge--ok"><i class="fa-solid fa-check"></i> منشور</span>'
    : '<span class="badge badge--mut"><i class="fa-solid fa-pen"></i> مسودة</span>';

  return `
    <div class="course-card-admin" data-id="${course.id}">
      <div class="course-card-admin__cover">
        ${coverHtml}
      </div>
      <div class="course-card-admin__body">
        <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <h4>${escapeHtml(course.title)}</h4>
          ${statusBadge}
        </div>
        <div class="course-card-admin__meta">
          <span><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(course.grade || '—')}</span>
          <span><i class="fa-solid fa-school"></i> ${escapeHtml(course.type || 'عام')}${course.branch ? ' - ' + escapeHtml(course.branch) : ''}</span>
          <span><i class="fa-solid fa-folder-tree"></i> ${foldersCount} فولدر</span>
        </div>
        <div class="course-card-admin__acts">
          <button class="btn btn--line btn--sm" data-action="edit-course" data-id="${course.id}">
            <i class="fa-solid fa-pen"></i> تعديل
          </button>
          <button class="btn btn--line btn--sm" data-action="folders" data-id="${course.id}">
            <i class="fa-solid fa-folder-tree"></i> الفولدرات
          </button>
          <button class="btn btn--line btn--sm" data-action="publish-course" data-id="${course.id}" ${course.is_published ? 'disabled' : ''}>
            <i class="fa-solid fa-upload"></i> نشر
          </button>
          <button class="btn btn--danger btn--sm" data-action="delete-course" data-id="${course.id}">
            <i class="fa-solid fa-trash"></i> حذف
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindCourseActions() {
  $$('#coursesContainer [data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const card = btn.closest('.course-card-admin');
      const title = card.querySelector('h4').textContent;

      try {
        if (action === 'edit-course') {
          openCourseModal(id);
          return;

        } else if (action === 'folders') {
          openFoldersModal(id);
          return;

        } else if (action === 'publish-course') {
          const ok = await UI.confirm({
            type: 'success',
            title: 'نشر الكورس؟',
            message: `سيظهر "${title}" للطلاب في صفهم.`,
            confirmText: 'نشر',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          const { error } = await supabaseClient.from('courses').update({ is_published: true }).eq('id', id);
          if (error) throw error;
          Toast.success('تم النشر', `تم نشر "${title}"`);

        } else if (action === 'delete-course') {
          const ok = await UI.confirm({
            type: 'danger',
            title: 'حذف الكورس؟',
            message: `سيتم حذف "${title}" وكل الفولدرات والعناصر.`,
            confirmText: 'حذف',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          const { error } = await supabaseClient.from('courses').delete().eq('id', id);
          if (error) throw error;
          Toast.error('تم الحذف', `تم حذف "${title}"`);
        }

        loadCourses();
        loadStats();
      } catch (err) {
        console.error(err);
        Toast.error('خطأ', err.message || 'حاول تاني');
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Modal الكورس
   ═══════════════════════════════════════════════════════════════ */
function openCourseModal(courseId = null) {
  const modal = document.getElementById('courseModal');
  if (!modal) return;

  currentCourseId = courseId;

  document.getElementById('courseModalTitle').innerHTML = courseId
    ? '<i class="fa-solid fa-pen"></i> تعديل كورس'
    : '<i class="fa-solid fa-book-open"></i> كورس جديد';

  resetCourseForm();

  if (courseId) {
    loadCourseForEdit(courseId);
  }

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCourseModal() {
  const modal = document.getElementById('courseModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  currentCourseId = null;
}

function resetCourseForm() {
  document.getElementById('courseTitle').value = '';
  document.getElementById('courseDesc').value = '';
  document.getElementById('courseCoverUrl').value = '';
  $$('input[name="courseGrade"]').forEach(i => i.checked = false);
  $$('input[name="courseType"]').forEach(i => i.checked = false);
  $$('input[name="courseBranch"]').forEach(i => i.checked = false);
  document.getElementById('courseBranchesSection').hidden = true;

  const preview = document.getElementById('courseCoverPreview');
  preview.innerHTML = '<i class="fa-solid fa-image"></i><p>هتلاقي معاينة الصورة هنا</p>';
  preview.classList.remove('has-image');
}

async function loadCourseForEdit(courseId) {
  try {
    const { data: course, error } = await supabaseClient
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (error || !course) {
      Toast.error('خطأ', 'مش قادر أجيب الكورس');
      closeCourseModal();
      return;
    }

    document.getElementById('courseTitle').value = course.title || '';
    document.getElementById('courseDesc').value = course.description || '';
    document.getElementById('courseCoverUrl').value = course.cover_url || '';

    $$('input[name="courseGrade"]').forEach(i => i.checked = (i.value === course.grade));
    $$('input[name="courseType"]').forEach(i => i.checked = (i.value === course.type));
    $$('input[name="courseBranch"]').forEach(i => i.checked = (i.value === course.branch));

    updateCourseBranchesVisibility();

    // معاينة الغلاف
    if (course.cover_url) {
      const preview = document.getElementById('courseCoverPreview');
      preview.innerHTML = `<img src="${escapeHtml(course.cover_url)}" alt="Cover" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-triangle-exclamation\\'></i><p>الصورة مش موجودة</p>';this.parentElement.classList.remove('has-image');">`;
      preview.classList.add('has-image');
    }

  } catch (err) {
    console.error(err);
    Toast.error('خطأ', 'حاول تاني');
    closeCourseModal();
  }
}

function updateCourseBranchesVisibility() {
  const types = $$('input[name="courseType"]:checked').map(i => i.value);
  const grades = $$('input[name="courseGrade"]:checked').map(i => i.value);

  const hasAzhar = types.includes('أزهر');
  const hasThanwy = grades.some(g => g.includes('ثانوي'));

  const section = document.getElementById('courseBranchesSection');
  section.hidden = !(hasAzhar && hasThanwy);
  if (section.hidden) {
    $$('input[name="courseBranch"]').forEach(i => i.checked = false);
  }
}

async function saveCourse() {
  try {
    const title = document.getElementById('courseTitle').value.trim();
    const description = document.getElementById('courseDesc').value.trim();
    const coverUrl = document.getElementById('courseCoverUrl').value.trim();
    const grades = $$('input[name="courseGrade"]:checked').map(i => i.value);
    const types = $$('input[name="courseType"]:checked').map(i => i.value);
    const branches = $$('input[name="courseBranch"]:checked').map(i => i.value);

    const errs = [];
    if (!title) errs.push('عنوان الكورس مطلوب');
    if (!grades.length) errs.push('اختر صف واحد على الأقل');
    if (!types.length) errs.push('اختر نوع واحد على الأقل');

    const hasAzhar = types.includes('أزهر');
    const hasThanwy = grades.some(g => g.includes('ثانوي'));
    if (hasAzhar && hasThanwy && !branches.length) {
      errs.push('اختر فرع واحد على الأقل');
    }

    if (errs.length) {
      Toast.warn('تحقق من البيانات', errs[0]);
      return;
    }

    const payload = {
      title,
      description: description || null,
      grade: grades[0],
      type: types[0],
      branch: branches[0] || null,
      cover_url: coverUrl || null,
      created_by: currentUser.id
    };

    if (currentCourseId) {
      const { error } = await supabaseClient
        .from('courses')
        .update(payload)
        .eq('id', currentCourseId);
      if (error) throw error;
      Toast.success('تم التعديل', `تم تعديل "${title}"`);
    } else {
      const { error } = await supabaseClient.from('courses').insert(payload);
      if (error) throw error;
      Toast.success('تم الإضافة', `تم إضافة "${title}"`);
    }

    closeCourseModal();
    loadCourses();
    loadStats();

  } catch (err) {
    console.error(err);
    Toast.error('خطأ', err.message || 'حاول تاني');
  }
}

/* ═══════════════════════════════════════════════════════════════
   4. الاشتراكات
   ═══════════════════════════════════════════════════════════════ */
async function loadEnrollments() {
  const c = document.getElementById('enrollmentsContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('enrollments')
      .select(`
        id, status, requested_at, approved_at, note,
        student:student_id (id, full_name, username, grade, phone),
        course:course_id (id, title, grade)
      `)
      .order('requested_at', { ascending: false })
      .limit(200);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.enrollments = data || [];
    renderEnrollments();

  } catch (err) {
    console.error(err);
    c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تحدّث الصفحة');
  }
}

function renderEnrollments() {
  const c = document.getElementById('enrollmentsContainer');
  const filter = document.getElementById('filterEnrollmentStatus')?.value || 'pending';
  const q = (document.getElementById('searchEnrollments')?.value || '').toLowerCase().trim();

  let list = cache.enrollments;
  if (filter !== 'all') list = list.filter(e => e.status === filter);

  if (q) {
    list = list.filter(e => {
      const s = e.student || {};
      const co = e.course || {};
      return (s.full_name || '').toLowerCase().includes(q) ||
             (s.username || '').toLowerCase().includes(q) ||
             (s.phone || '').includes(q) ||
             (co.title || '').toLowerCase().includes(q);
    });
  }

  if (!list.length) {
    c.innerHTML = emptyState('fa-user-plus', 'مفيش طلبات', 'جرب تغير الفلتر');
    return;
  }

  c.innerHTML = `<div class="cards-mobile">${list.map(enrollmentCard).join('')}</div>`;
  bindEnrollmentActions();
}

function enrollmentCard(e) {
  const student = e.student || {};
  const course = e.course || {};

  const statusMap = {
    pending: ['warn', 'fa-clock', 'قيد المراجعة'],
    active: ['ok', 'fa-check', 'مفعّل'],
    rejected: ['err', 'fa-xmark', 'مرفوض']
  };
  const [cls, ic, label] = statusMap[e.status] || ['mut', 'fa-circle', e.status];

  const actions = e.status === 'pending'
    ? `
      <button class="btn btn--gold btn--sm" data-action="approve" data-id="${e.id}">
        <i class="fa-solid fa-check"></i> موافقة
      </button>
      <button class="btn btn--danger btn--sm" data-action="reject" data-id="${e.id}">
        <i class="fa-solid fa-xmark"></i> رفض
      </button>
    `
    : `
      <button class="btn btn--danger btn--sm" data-action="delete" data-id="${e.id}">
        <i class="fa-solid fa-trash"></i> حذف
      </button>
    `;

  return `
    <div class="enroll-card enroll-card--${e.status}" data-id="${e.id}">
      <div class="enroll-card__head">
        <h4>${escapeHtml(student.full_name || '—')}</h4>
        <span class="badge badge--${cls}"><i class="fa-solid ${ic}"></i> ${label}</span>
      </div>
      <div class="enroll-card__rows">
        <div><b>الكورس:</b> ${escapeHtml(course.title || '—')}</div>
        <div><b>الصف:</b> ${escapeHtml(student.grade || '—')}</div>
        <div><b>هاتف الطالب:</b> <span dir="ltr">${escapeHtml(student.phone || '—')}</span></div>
        <div><b>التاريخ:</b> ${formatDate(e.requested_at)}</div>
        ${e.approved_at ? `<div><b>الموافقة:</b> ${formatDate(e.approved_at)}</div>` : ''}
      </div>
      <div class="enroll-card__acts">
        ${actions}
      </div>
    </div>
  `;
}

function bindEnrollmentActions() {
  $$('#enrollmentsContainer [data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const card = btn.closest('.enroll-card');
      const name = card.querySelector('h4').textContent;

      try {
        if (action === 'approve') {
          const ok = await UI.confirm({
            type: 'success',
            title: 'تفعيل الاشتراك؟',
            message: `سيتم تفعيل اشتراك "${name}" في الكورس.`,
            confirmText: 'تفعيل',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          const { error } = await supabaseClient
            .from('enrollments')
            .update({
              status: 'active',
              approved_at: new Date().toISOString(),
              approved_by: currentUser.id
            })
            .eq('id', id);
          if (error) throw error;
          Toast.success('تم التفعيل', `تم تفعيل ${name}`);

        } else if (action === 'reject') {
          const ok = await UI.confirm({
            type: 'warn',
            title: 'رفض الطلب؟',
            message: `سيتم رفض طلب "${name}".`,
            confirmText: 'رفض',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          const { error } = await supabaseClient
            .from('enrollments')
            .update({ status: 'rejected' })
            .eq('id', id);
          if (error) throw error;
          Toast.warn('تم الرفض', `تم رفض ${name}`);

        } else if (action === 'delete') {
          const ok = await UI.confirm({
            type: 'danger',
            title: 'حذف الطلب؟',
            message: `سيتم حذف الطلب نهائياً.`,
            confirmText: 'حذف',
            cancelText: 'إلغاء'
          });
          if (!ok) return;

          const { error } = await supabaseClient.from('enrollments').delete().eq('id', id);
          if (error) throw error;
          Toast.error('تم الحذف', 'اتمسح الطلب');
        }

        loadEnrollments();
        loadStats();
      } catch (err) {
        console.error(err);
        Toast.error('خطأ', err.message || 'حاول تاني');
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   5. الفولدرات
   ═══════════════════════════════════════════════════════════════ */
async function openFoldersModal(courseId) {
  const modal = document.getElementById('foldersModal');
  const body = document.getElementById('foldersBody');
  if (!modal || !body) return;

  currentCourseId = courseId;
  currentFolderId = null;
  currentItemId = null;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  body.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data: course } = await supabaseClient
      .from('courses')
      .select('id, title')
      .eq('id', courseId)
      .single();

    if (course) {
      document.getElementById('foldersModalTitle').innerHTML =
        `<i class="fa-solid fa-folder-tree"></i> فولدرات: ${escapeHtml(course.title)}`;
    }

    await loadFolders(courseId);

  } catch (err) {
    console.error(err);
    body.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تاني');
  }
}

function closeFoldersModal() {
  const modal = document.getElementById('foldersModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  currentCourseId = null;
}

async function loadFolders(courseId) {
  const body = document.getElementById('foldersBody');
  if (!body) return;

  body.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data: folders, error: fErr } = await supabaseClient
      .from('folders')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true });

    if (fErr) throw fErr;

    if (!folders?.length) {
      body.innerHTML = emptyState(
        'fa-folder-open',
        'مفيش فولدرات',
        'اضغط "إضافة فولدر" لتبدأ'
      );
      return;
    }

    const folderIds = folders.map(f => f.id);
    const { data: items } = await supabaseClient
      .from('folder_items')
      .select('*')
      .in('folder_id', folderIds)
      .order('order_index', { ascending: true });

    const itemsMap = {};
    (items || []).forEach(it => {
      if (!itemsMap[it.folder_id]) itemsMap[it.folder_id] = [];
      itemsMap[it.folder_id].push(it);
    });

    body.innerHTML = folders.map((f, idx) => folderBlock(f, idx, itemsMap[f.id] || [])).join('');
    bindFolderActions();

  } catch (err) {
    console.error(err);
    body.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', err.message || 'حاول تاني');
  }
}

function folderBlock(folder, idx, items) {
  const itemsHtml = items.length
    ? items.map(it => folderItemHtml(it)).join('')
    : `<div class="folder-block__empty">
        <i class="fa-solid fa-inbox"></i>
        <p style="margin-top:6px;">مفيش عناصر في الفولدر ده</p>
      </div>`;

  return `
    <div class="folder-block" data-folder-id="${folder.id}">
      <div class="folder-block__head">
        <i class="fa-solid fa-folder folder-icon"></i>
        <h4>${escapeHtml(folder.title)}</h4>
        <small>${items.length} عنصر</small>
        <div class="folder-block__acts">
          <button class="icon-btn icon-btn--edit" data-action="edit-folder" data-id="${folder.id}" title="تعديل">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="icon-btn icon-btn--del" data-action="delete-folder" data-id="${folder.id}" title="حذف">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="folder-block__body">
        ${folder.description ? `<p style="color:var(--muted);font-size:.82rem;padding:4px 6px;">${escapeHtml(folder.description)}</p>` : ''}
        ${itemsHtml}
        <button type="button" class="add-item-btn" data-action="add-item" data-folder-id="${folder.id}">
          <i class="fa-solid fa-plus"></i>
          إضافة عنصر
        </button>
      </div>
    </div>
  `;
}

function folderItemHtml(item) {
  const isYt = item.item_type === 'youtube';
  const iconCls = isYt ? 'folder-item__icon--youtube' : 'folder-item__icon--link';
  const icon = isYt ? 'fa-brands fa-youtube' : 'fa-solid fa-link';
  const subtitle = isYt
    ? `YouTube · ${item.youtube_id || ''}`
    : (item.external_url || '').slice(0, 50);

  return `
    <div class="folder-item" data-item-id="${item.id}">
      <div class="folder-item__icon ${iconCls}">
        <i class="${icon}"></i>
      </div>
      <div class="folder-item__body">
        <h5>${escapeHtml(item.title)}</h5>
        <small dir="ltr">${escapeHtml(subtitle)}</small>
      </div>
      <div class="folder-item__acts">
        <button class="icon-btn icon-btn--edit" data-action="edit-item" data-id="${item.id}" title="تعديل">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="icon-btn icon-btn--del" data-action="delete-item" data-id="${item.id}" title="حذف">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function bindFolderActions() {
  $$('#foldersBody [data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const folderId = btn.dataset.folderId;

      if (action === 'edit-folder') {
        openFolderModal(id);
      } else if (action === 'delete-folder') {
        const ok = await UI.confirm({
          type: 'danger',
          title: 'حذف الفولدر؟',
          message: 'هيتم حذف الفولدر وكل محتواه.',
          confirmText: 'حذف',
          cancelText: 'إلغاء'
        });
        if (!ok) return;

        const { error } = await supabaseClient.from('folders').delete().eq('id', id);
        if (error) { Toast.error('خطأ', error.message); return; }
        Toast.error('تم الحذف', 'اتمسح الفولدر');
        loadFolders(currentCourseId);

      } else if (action === 'add-item') {
        openItemModal(null, folderId);
      } else if (action === 'edit-item') {
        openItemModal(id, null);
      } else if (action === 'delete-item') {
        const ok = await UI.confirm({
          type: 'warn',
          title: 'حذف العنصر؟',
          message: 'هيتم حذف العنصر نهائياً.',
          confirmText: 'حذف',
          cancelText: 'إلغاء'
        });
        if (!ok) return;

        const { error } = await supabaseClient.from('folder_items').delete().eq('id', id);
        if (error) { Toast.error('خطأ', error.message); return; }
        Toast.error('تم الحذف', 'اتمسح العنصر');
        loadFolders(currentCourseId);
      }
    });
  });
}

/* ─────────────── Modal الفولدر ─────────────── */
function openFolderModal(folderId = null) {
  const modal = document.getElementById('folderModal');
  if (!modal) return;

  currentFolderId = folderId;

  document.getElementById('folderModalTitle').textContent =
    folderId ? 'تعديل فولدر' : 'فولدر جديد';
  document.getElementById('folderTitle').value = '';
  document.getElementById('folderDesc').value = '';

  if (folderId) {
    supabaseClient
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single()
      .then(({ data }) => {
        if (data) {
          document.getElementById('folderTitle').value = data.title || '';
          document.getElementById('folderDesc').value = data.description || '';
        }
      });
  }

  modal.hidden = false;
}

function closeFolderModal() {
  const modal = document.getElementById('folderModal');
  if (!modal) return;
  modal.hidden = true;
  currentFolderId = null;
}

async function saveFolder() {
  const title = document.getElementById('folderTitle').value.trim();
  const description = document.getElementById('folderDesc').value.trim();

  if (!title) {
    Toast.warn('تحقق', 'عنوان الفولدر مطلوب');
    return;
  }

  if (!currentCourseId) {
    Toast.error('خطأ', 'مفيش كورس محدد');
    return;
  }

  try {
    const payload = {
      course_id: currentCourseId,
      title,
      description: description || null
    };

    if (currentFolderId) {
      const { error } = await supabaseClient
        .from('folders')
        .update(payload)
        .eq('id', currentFolderId);
      if (error) throw error;
      Toast.success('تم التعديل', 'تم تعديل الفولدر');
    } else {
      const { error } = await supabaseClient.from('folders').insert(payload);
      if (error) throw error;
      Toast.success('تم الإضافة', 'تم إضافة الفولدر');
    }

    closeFolderModal();
    loadFolders(currentCourseId);

  } catch (err) {
    console.error(err);
    Toast.error('خطأ', err.message || 'حاول تاني');
  }
}

/* ─────────────── Modal العنصر ─────────────── */
function openItemModal(itemId = null, folderId = null) {
  const modal = document.getElementById('itemModal');
  if (!modal) return;

  currentItemId = itemId;
  if (folderId) currentFolderId = folderId;

  document.getElementById('itemModalTitle').textContent =
    itemId ? 'تعديل عنصر' : 'عنصر جديد';

  document.getElementById('itemTitle').value = '';
  document.getElementById('itemYoutubeId').value = '';
  document.getElementById('itemExternalUrl').value = '';
  document.getElementById('itemDesc').value = '';

  document.querySelector('input[name="itemType"][value="youtube"]').checked = true;
  updateItemTypeTabs();

  if (itemId) {
    supabaseClient
      .from('folder_items')
      .select('*')
      .eq('id', itemId)
      .single()
      .then(({ data }) => {
        if (data) {
          document.getElementById('itemTitle').value = data.title || '';
          document.getElementById('itemDesc').value = data.description || '';

          const type = data.item_type || 'youtube';
          document.querySelector(`input[name="itemType"][value="${type}"]`).checked = true;
          updateItemTypeTabs();

          if (type === 'youtube') {
            document.getElementById('itemYoutubeId').value = data.youtube_id || '';
          } else {
            document.getElementById('itemExternalUrl').value = data.external_url || '';
          }
        }
      });
  }

  modal.hidden = false;
}

function closeItemModal() {
  const modal = document.getElementById('itemModal');
  if (!modal) return;
  modal.hidden = true;
  currentItemId = null;
}

function updateItemTypeTabs() {
  const type = document.querySelector('input[name="itemType"]:checked')?.value || 'youtube';

  $$('.exam-kind-tab', document.getElementById('itemModal')).forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.itemtype === type);
  });

  document.getElementById('itemYoutubeField').hidden = (type !== 'youtube');
  document.getElementById('itemLinkField').hidden = (type !== 'link');
}

function extractYoutubeId(input) {
  if (!input) return null;
  input = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];

  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }

  return null;
}

async function saveItem() {
  const type = document.querySelector('input[name="itemType"]:checked')?.value || 'youtube';
  const title = document.getElementById('itemTitle').value.trim();
  const description = document.getElementById('itemDesc').value.trim();

  if (!title) {
    Toast.warn('تحقق', 'عنوان العنصر مطلوب');
    return;
  }

  if (!currentFolderId) {
    Toast.error('خطأ', 'مفيش فولدر محدد');
    return;
  }

  let youtube_id = null;
  let external_url = null;

  if (type === 'youtube') {
    const raw = document.getElementById('itemYoutubeId').value.trim();
    youtube_id = extractYoutubeId(raw);

    if (!youtube_id) {
      Toast.error('خطأ', 'رابط YouTube غير صالح');
      return;
    }
  } else {
    external_url = document.getElementById('itemExternalUrl').value.trim();
    if (!external_url) {
      Toast.warn('تحقق', 'الرابط مطلوب');
      return;
    }
  }

  try {
    const payload = {
      folder_id: currentFolderId,
      title,
      item_type: type,
      youtube_id,
      external_url,
      description: description || null
    };

    if (currentItemId) {
      const { error } = await supabaseClient
        .from('folder_items')
        .update(payload)
        .eq('id', currentItemId);
      if (error) throw error;
      Toast.success('تم التعديل', 'تم تعديل العنصر');
    } else {
      const { error } = await supabaseClient.from('folder_items').insert(payload);
      if (error) throw error;
      Toast.success('تم الإضافة', 'تم إضافة العنصر');
    }

    closeItemModal();
    loadFolders(currentCourseId);

  } catch (err) {
    console.error(err);
    Toast.error('خطأ', err.message || 'حاول تاني');
  }
}

/* ═══════════════════════════════════════════════════════════════
   6. الامتحانات
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
   7. تصحيح المقالي
   ═══════════════════════════════════════════════════════════════ */
async function loadGrading() {
  const c = document.getElementById('gradingContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('attempts')
      .select(`
        id, score, total_marks, status, started_at, submitted_at, graded_at,
        profiles:student_id (id, full_name, username, grade, phone),
        exams:exam_id (id, title, total_marks, pass_marks, kind)
      `)
      .in('status', ['submitted', 'graded'])
      .order('submitted_at', { ascending: false })
      .limit(200);

    if (error) {
      c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', error.message);
      return;
    }

    cache.grading = data || [];
    renderGrading();

  } catch (err) {
    console.error(err);
    c.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'حاول تحدّث الصفحة');
  }
}

function renderGrading() {
  const c = document.getElementById('gradingContainer');
  const filter = document.getElementById('filterGrading')?.value || 'pending';
  const q = (document.getElementById('searchGrading')?.value || '').toLowerCase().trim();

  let list = cache.grading;
  if (filter === 'pending') list = list.filter(a => a.status === 'submitted');
  else if (filter === 'graded') list = list.filter(a => a.status === 'graded');

  if (q) {
    list = list.filter(a => {
      const s = a.profiles || {};
      const e = a.exams || {};
      return (s.full_name || '').toLowerCase().includes(q) ||
             (s.username || '').toLowerCase().includes(q) ||
             (s.phone || '').includes(q) ||
             (e.title || '').toLowerCase().includes(q);
    });
  }

  if (!list.length) {
    c.innerHTML = emptyState('fa-marker', 'مفيش محاولات', filter === 'pending' ? 'كل المحاولات اتصححت' : 'جرب تغير الفلتر');
    return;
  }

  c.innerHTML = `<div class="cards-mobile">${list.map(gradingCard).join('')}</div>`;
  bindGradingActions();
}

function gradingCard(a) {
  const student = a.profiles || {};
  const exam = a.exams || {};
  const isGraded = a.status === 'graded';
  const pct = a.total_marks ? Math.round((a.score / a.total_marks) * 100) : 0;

  const statusBadge = isGraded
    ? '<span class="badge badge--ok"><i class="fa-solid fa-check"></i> تم التصحيح</span>'
    : '<span class="badge badge--warn"><i class="fa-solid fa-marker"></i> محتاج تصحيح</span>';

  return `
    <div class="mcard mcard--clickable" data-attempt-id="${a.id}">
      <div class="mcard__top">
        <h4>${escapeHtml(student.full_name || '—')}</h4>
        ${statusBadge}
      </div>
      <div class="mcard__rows">
        <div><b>الامتحان:</b> ${escapeHtml(exam.title || '—')}</div>
        <div><b>الصف:</b> ${escapeHtml(student.grade || '—')}</div>
        <div><b>النتيجة:</b> ${a.score ?? 0}/${a.total_marks ?? 0} (${pct}%)</div>
        <div><b>التسليم:</b> ${formatDate(a.submitted_at)}</div>
        ${isGraded ? `<div><b>تم التصحيح:</b> ${formatDate(a.graded_at)}</div>` : ''}
      </div>
      <div class="mcard__acts">
        <button class="btn btn--gold btn--sm" data-action="grade" data-id="${a.id}">
          <i class="fa-solid fa-marker"></i>
          ${isGraded ? 'عرض / تعديل التصحيح' : 'تصحيح الآن'}
        </button>
      </div>
    </div>
  `;
}

function bindGradingActions() {
  $$('#gradingContainer [data-attempt-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = card.dataset.attemptId;
      openGradingModal(id);
    });
  });

  $$('#gradingContainer [data-action="grade"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      openGradingModal(id);
    });
  });
}

async function openGradingModal(attemptId) {
  const modal = document.getElementById('gradingModal');
  const body = document.getElementById('gradingBody');
  if (!modal || !body) return;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  body.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data: attempt, error: attErr } = await supabaseClient
      .from('attempts')
      .select(`
        id, score, total_marks, status, started_at, submitted_at, expires_at, graded_at,
        profiles:student_id (id, full_name, username, grade, phone, parent_phone, type, branch),
        exams:exam_id (id, title, total_marks, pass_marks, kind, duration_minutes)
      `)
      .eq('id', attemptId)
      .maybeSingle();

    if (attErr || !attempt) {
      body.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', 'مش قادر أجيب المحاولة');
      return;
    }

    currentGradingAttempt = attempt;

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

    const sortedAnswers = (answers || []).sort((a, b) => {
      const ai = a.questions?.order_index ?? 0;
      const bi = b.questions?.order_index ?? 0;
      return ai - bi;
    });

    gradingAnswers = {};
    sortedAnswers.forEach(a => {
      const isMcq = a.questions?.question_type === 'mcq';
      const choicesForQ = allChoices.filter(c => c.question_id === a.questions?.id);

      gradingAnswers[a.id] = {
        marks_awarded: a.marks_awarded ?? (isMcq && a.selected_choice?.is_correct ? a.questions.marks : 0),
        teacher_feedback: a.teacher_feedback || '',
        question: a.questions,
        answer: a,
        choices: choicesForQ,
        selectedChoice: a.selected_choice || null
      };
    });

    body.innerHTML = renderGradingModal(attempt, sortedAnswers, allChoices);
    bindGradingModalEvents();

  } catch (err) {
    console.error('Grading error:', err);
    body.innerHTML = emptyState('fa-triangle-exclamation', 'خطأ', err.message || 'حاول تاني');
  }
}

function closeGradingModal() {
  const modal = document.getElementById('gradingModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  currentGradingAttempt = null;
  gradingAnswers = {};
}

function renderGradingModal(attempt, answers, allChoices) {
  const student = attempt.profiles || {};
  const exam = attempt.exams || {};

  const hero = `
    <div class="grading-hero">
      <div class="grading-hero__info">
        <h3>${escapeHtml(student.full_name || '—')}</h3>
        <div class="grading-hero__meta">
          <span><i class="fa-solid fa-file-pen"></i> ${escapeHtml(exam.title || '—')}</span>
          <span><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(student.grade || '—')}</span>
          <span><i class="fa-solid fa-calendar-check"></i> ${formatDate(attempt.submitted_at)}</span>
        </div>
      </div>
    </div>
  `;

  let listHtml = '<div class="grading-list">';

  answers.forEach((ans, idx) => {
    const q = ans.questions || {};
    const isMcq = q.question_type === 'mcq';
    const maxMarks = q.marks || 0;

    const typeBadge = isMcq
      ? '<span class="grading-item__type grading-item__type--mcq"><i class="fa-solid fa-list-ul"></i> اختيار</span>'
      : '<span class="grading-item__type grading-item__type--essay"><i class="fa-solid fa-pen-fancy"></i> مقالي</span>';

    const questionHtml = `
      <div class="grading-item__question">
        ${escapeHtml(q.question_text || '')}
      </div>
    `;

    let answerHtml = '';

    if (isMcq) {
      const selectedChoice = ans.selected_choice;
      const choicesForQ = ans.choices || [];
      const correctChoice = choicesForQ.find(c => c.is_correct);
      const isCorrect = selectedChoice?.is_correct === true;
      const isEmpty = !ans.selected_choice_id;

      answerHtml = `
        <div class="grading-item__answer">
          <div class="grading-item__answer-label">
            <i class="fa-solid fa-check-circle" style="color:var(--ok)"></i>
            الإجابة الصحيحة: <strong style="color:var(--ok)">${escapeHtml(correctChoice?.choice_text || '—')}</strong>
          </div>
          <div class="grading-item__answer-label" style="margin-top:10px">
            <i class="fa-solid fa-user"></i>
            إجابة الطالب:
            ${isEmpty
              ? '<strong style="color:var(--muted)">لم يجب</strong>'
              : (isCorrect
                  ? '<strong style="color:var(--ok)">صحيحة ✅</strong>'
                  : '<strong style="color:var(--err)">خاطئة ❌</strong>')}
          </div>
          <div class="mcq-choices-review">
            ${(choicesForQ || []).map(c => {
              const isSelected = ans.selected_choice_id === c.id;
              const isCorrectChoice = c.is_correct;
              let cls = 'mcq-choice-review';
              let icon = '<i class="fa-solid fa-circle" style="opacity:.2"></i>';
              let iconCls = 'mcq-choice-review__icon mcq-choice-review__icon--empty';

              if (isCorrectChoice) {
                cls += ' is-correct';
                icon = '<i class="fa-solid fa-check"></i>';
                iconCls = 'mcq-choice-review__icon';
              }
              if (isSelected && !isCorrectChoice) {
                cls += ' is-selected is-wrong';
                icon = '<i class="fa-solid fa-xmark"></i>';
                iconCls = 'mcq-choice-review__icon';
              }
              if (isSelected && isCorrectChoice) cls += ' is-selected';

              return `
                <div class="${cls}">
                  <div class="${iconCls}">${icon}</div>
                  <div class="mcq-choice-review__text">${escapeHtml(c.choice_text || '')}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      const essayText = ans.essay_text || '';
      const isEmpty = !essayText.trim();
      answerHtml = `
        <div class="grading-item__answer">
          <div class="grading-item__answer-label">
            <i class="fa-solid fa-pen-fancy"></i>
            إجابة الطالب:
          </div>
          <div class="grading-item__answer-text ${isEmpty ? 'grading-item__answer-text--empty' : ''}">
            ${isEmpty ? 'لم يجب على السؤال' : escapeHtml(essayText)}
          </div>
        </div>
      `;
    }

    let marksHtml = '';
    if (isMcq) {
      const currentMarks = ans.marks_awarded ?? (ans.selected_choice?.is_correct ? maxMarks : 0);
      marksHtml = `
        <div class="grading-empty-note">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          ${currentMarks > 0
            ? `تم تصحيحه تلقائياً — الدرجة: <strong>${currentMarks}</strong> من ${maxMarks}`
            : `تم تصحيحه تلقائياً — خاطئ — 0 من ${maxMarks}`}
        </div>
      `;
    } else {
      const currentMarks = ans.marks_awarded ?? 0;
      marksHtml = `
        <div class="grading-marks-row">
          <div class="grading-field">
            <label><i class="fa-solid fa-star"></i> الدرجة (من ${maxMarks})</label>
            <input type="number"
                   class="grading-input"
                   data-answer-id="${ans.id}"
                   data-max="${maxMarks}"
                   value="${currentMarks}"
                   min="0"
                   max="${maxMarks}"
                   step="0.5">
            <div class="grading-marks-hint">اكتب درجة من 0 لـ ${maxMarks}</div>
          </div>
          <div class="grading-field">
            <label><i class="fa-solid fa-comment"></i> تعليق (اختياري)</label>
            <textarea class="grading-textarea"
                      data-answer-id="${ans.id}"
                      placeholder="ملاحظات للطالب...">${escapeHtml(ans.teacher_feedback || '')}</textarea>
          </div>
        </div>
      `;
    }

    let itemCls = 'grading-item';
    if (isMcq) {
      itemCls += ' grading-item--mcq';
      if (ans.selected_choice?.is_correct) itemCls += ' is-correct';
      else if (ans.selected_choice_id) itemCls += ' is-wrong';
    }

    listHtml += `
      <div class="${itemCls}" data-answer-id="${ans.id}">
        <div class="grading-item__head">
          <div class="grading-item__num">${idx + 1}</div>
          ${typeBadge}
          <div class="grading-item__marks-info">${maxMarks} درجة</div>
        </div>
        ${questionHtml}
        ${answerHtml}
        ${marksHtml}
      </div>
    `;
  });

  listHtml += '</div>';

  const summary = renderGradingSummary(attempt);

  return hero + listHtml + summary;
}

function renderGradingSummary(attempt) {
  let autoScore = 0;
  let manualScore = 0;
  let essayCount = 0;

  Object.values(gradingAnswers).forEach(ans => {
    const q = ans.question;
    if (!q) return;

    if (q.question_type === 'mcq') {
      if (ans.selectedChoice?.is_correct) autoScore += q.marks || 0;
    } else {
      essayCount++;
      manualScore += Number(ans.marks_awarded) || 0;
    }
  });

  const totalScore = autoScore + manualScore;
  const totalMarks = attempt.total_marks || 0;
  const pct = totalMarks ? Math.round((totalScore / totalMarks) * 100) : 0;

  return `
    <div class="grading-summary">
      <div class="grading-summary__row">
        <span><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--gold)"></i> درجات MCQ (تلقائي)</span>
        <b>${autoScore}</b>
      </div>
      <div class="grading-summary__row">
        <span><i class="fa-solid fa-marker" style="color:var(--info)"></i> درجات المقالي (${essayCount} سؤال)</span>
        <b id="manualScoreLabel">${manualScore}</b>
      </div>
      <div class="grading-summary__row grading-summary__row--total">
        <span><i class="fa-solid fa-star" style="color:var(--gold)"></i> المجموع</span>
        <b id="totalScoreLabel">${totalScore} / ${totalMarks} (${pct}%)</b>
      </div>
    </div>
  `;
}

function bindGradingModalEvents() {
  const body = document.getElementById('gradingBody');
  if (!body) return;

  $$('.grading-input', body).forEach(input => {
    input.addEventListener('input', () => {
      const answerId = input.dataset.answerId;
      const max = Number(input.dataset.max) || 0;
      let val = Number(input.value) || 0;
      if (val > max) { val = max; input.value = max; }
      if (val < 0) { val = 0; input.value = 0; }

      if (gradingAnswers[answerId]) {
        gradingAnswers[answerId].marks_awarded = val;
      }
      updateGradingSummary();
    });
  });

  $$('.grading-textarea', body).forEach(ta => {
    ta.addEventListener('input', () => {
      const answerId = ta.dataset.answerId;
      if (gradingAnswers[answerId]) {
        gradingAnswers[answerId].teacher_feedback = ta.value;
      }
    });
  });
}

function updateGradingSummary() {
  if (!currentGradingAttempt) return;

  let autoScore = 0;
  let manualScore = 0;

  Object.values(gradingAnswers).forEach(ans => {
    const q = ans.question;
    if (!q) return;

    if (q.question_type === 'mcq') {
      if (ans.selectedChoice?.is_correct) autoScore += q.marks || 0;
    } else {
      manualScore += Number(ans.marks_awarded) || 0;
    }
  });

  const totalScore = autoScore + manualScore;
  const totalMarks = currentGradingAttempt.total_marks || 0;
  const pct = totalMarks ? Math.round((totalScore / totalMarks) * 100) : 0;

  const manualLabel = document.getElementById('manualScoreLabel');
  const totalLabel = document.getElementById('totalScoreLabel');

  if (manualLabel) manualLabel.textContent = manualScore;
  if (totalLabel) totalLabel.textContent = `${totalScore} / ${totalMarks} (${pct}%)`;
}

async function saveGrading() {
  if (!currentGradingAttempt) return;

  try {
    const ok = await UI.confirm({
      type: 'success',
      title: 'حفظ التصحيح؟',
      message: 'هيتم حفظ الدرجات + تحديث النتيجة النهائية للطالب.',
      confirmText: 'حفظ',
      cancelText: 'إلغاء'
    });
    if (!ok) return;

    const attemptId = currentGradingAttempt.id;

    for (const answerId in gradingAnswers) {
      const ans = gradingAnswers[answerId];
      const q = ans.question;
      if (!q) continue;

      if (q.question_type === 'essay') {
        const { error } = await supabaseClient
          .from('answers')
          .update({
            marks_awarded: Number(ans.marks_awarded) || 0,
            teacher_feedback: ans.teacher_feedback || null
          })
          .eq('id', answerId);
        if (error) throw error;
      }
    }

    let totalScore = 0;
    Object.values(gradingAnswers).forEach(ans => {
      const q = ans.question;
      if (!q) return;
      if (q.question_type === 'mcq') {
        if (ans.selectedChoice?.is_correct) totalScore += q.marks || 0;
      } else {
        totalScore += Number(ans.marks_awarded) || 0;
      }
    });

    const { error: attemptErr } = await supabaseClient
      .from('attempts')
      .update({
        score: totalScore,
        status: 'graded',
        graded_at: new Date().toISOString(),
        graded_by: currentUser.id
      })
      .eq('id', attemptId);

    if (attemptErr) throw attemptErr;

    Toast.success('تم الحفظ ✅', 'الطالب هيتشوف النتيجة النهائية');
    closeGradingModal();
    loadGrading();
    loadStats();

  } catch (err) {
    console.error('Save grading error:', err);
    Toast.error('خطأ', err.message || 'حاول تاني');
  }
}

/* ═══════════════════════════════════════════════════════════════
   8. المحاولات
   ═══════════════════════════════════════════════════════════════ */
async function loadAttempts() {
  const c = document.getElementById('attemptsContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('attempts')
      .select(`
        id, score, total_marks, status, started_at, submitted_at, expires_at,
        profiles:student_id (id, full_name, username, grade, phone, parent_phone),
        exams:exam_id (id, title, total_marks, pass_marks, kind)
      `)
      .order('started_at', { ascending: false })
      .limit(200);

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
  const q = (document.getElementById('searchAttempts')?.value || '').toLowerCase().trim();

  let list = cache.attempts;
  if (filter !== 'all') list = list.filter(a => a.status === filter);

  if (q) {
    list = list.filter(a => {
      const s = a.profiles || {};
      const e = a.exams || {};
      return (s.full_name || '').toLowerCase().includes(q) ||
             (s.username || '').toLowerCase().includes(q) ||
             (s.phone || '').includes(q) ||
             (e.title || '').toLowerCase().includes(q);
    });
  }

  if (!list.length) {
    c.innerHTML = emptyState('fa-file-circle-xmark', 'مفيش محاولات', 'جرب تغير البحث أو الفلتر');
    return;
  }

  c.innerHTML = `<div class="cards-mobile">${list.map(a => attemptCard(a, true)).join('')}</div>`;
  bindAttemptClick();
}

function attemptCard(a, clickable = false) {
  const student = a.profiles || {};
  const exam = a.exams || {};
  const statusMap = {
    in_progress: ['warn', 'fa-hourglass-half', 'قيد الحل'],
    submitted: ['info', 'fa-marker', 'محتاج تصحيح'],
    graded: ['ok', 'fa-check-double', 'تم التصحيح'],
    expired: ['err', 'fa-clock', 'منتهي']
  };
  const [cls, ic, label] = statusMap[a.status] || ['mut', 'fa-circle', a.status];

  const pct = a.total_marks ? Math.round((a.score / a.total_marks) * 100) : 0;
  const time = calcDuration(a.started_at, a.submitted_at || a.expires_at);
  const cls2 = clickable ? 'mcard mcard--clickable' : 'mcard';

  return `
    <div class="${cls2}" data-attempt-id="${a.id}">
      <div class="mcard__top">
        <h4>${escapeHtml(student.full_name || '—')}</h4>
        <span class="badge badge--${cls}"><i class="fa-solid ${ic}"></i> ${label}</span>
      </div>
      <div class="mcard__rows">
        <div><b>الامتحان:</b> ${escapeHtml(exam.title || '—')}</div>
        <div><b>الصف:</b> ${escapeHtml(student.grade || '—')}</div>
        <div><b>النتيجة:</b> ${a.score ?? 0}/${a.total_marks ?? 0} (${pct}%)</div>
        <div><b>الوقت المستغرق:</b> ${time}</div>
        <div><b>التسليم:</b> ${formatDate(a.submitted_at || a.started_at)}</div>
      </div>
    </div>
  `;
}

function bindAttemptClick() {
  $$('#attemptsContainer [data-attempt-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = card.dataset.attemptId;
      openStudentDetails(id);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   9. PDF
   ═══════════════════════════════════════════════════════════════ */
async function loadPdfList() {
  const c = document.getElementById('pdfContainer');
  c.innerHTML = `<div class="loader"><span></span><span></span><span></span></div>`;

  try {
    const { data, error } = await supabaseClient
      .from('attempts')
      .select(`
        id, score, total_marks, status, submitted_at, started_at, expires_at, pdf_exported,
        profiles:student_id (id, full_name, username, grade, phone, parent_phone),
        exams:exam_id (id, title, total_marks, pass_marks, kind)
      `)
      .in('status', ['submitted', 'graded'])
      .order('submitted_at', { ascending: false })
      .limit(200);

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
  const q = (document.getElementById('searchPdf')?.value || '').toLowerCase().trim();

  let list = cache.pdf;
  if (q) {
    list = list.filter(a => {
      const s = a.profiles || {};
      const e = a.exams || {};
      return (s.full_name || '').toLowerCase().includes(q) ||
             (s.username || '').toLowerCase().includes(q) ||
             (s.phone || '').includes(q) ||
             (e.title || '').toLowerCase().includes(q);
    });
  }

  if (!list.length) {
    c.innerHTML = emptyState('fa-file-pdf', 'مفيش محاولات جاهزة', 'لما طالب يسلّم امتحان هيظهر هنا');
    return;
  }

  c.innerHTML = `<div class="cards-mobile">${list.map(pdfCard).join('')}</div>`;
  bindPdfActions();
}

function pdfCard(a) {
  const student = a.profiles || {};
  const exam = a.exams || {};
  const done = a.pdf_exported === true;
  const pct = a.total_marks ? Math.round((a.score / a.total_marks) * 100) : 0;
  const time = calcDuration(a.started_at, a.submitted_at || a.expires_at);

  const deleteBtn = done
    ? `<button class="btn btn--danger btn--sm" data-action="delete" data-id="${a.id}">
        <i class="fa-solid fa-trash"></i> مسح
      </button>`
    : `<button class="btn btn--line btn--sm" disabled>
        <i class="fa-solid fa-lock"></i> لازم تنزّل الأول
      </button>`;

  return `
    <div class="mcard mcard--clickable" data-attempt-id="${a.id}">
      <div class="mcard__top">
        <h4>${escapeHtml(student.full_name || '—')}</h4>
        ${done
          ? '<span class="badge badge--ok"><i class="fa-solid fa-check"></i> اتنزل</span>'
          : '<span class="badge badge--warn"><i class="fa-solid fa-download"></i> لسه</span>'}
      </div>
      <div class="mcard__rows">
        <div><b>الامتحان:</b> ${escapeHtml(exam.title || '—')}</div>
        <div><b>النتيجة:</b> ${a.score ?? 0}/${a.total_marks ?? 0} (${pct}%)</div>
        <div><b>الوقت:</b> ${time}</div>
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
  $$('#pdfContainer [data-attempt-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = card.dataset.attemptId;
      openStudentDetails(id);
    });
  });

  $$('#pdfContainer [data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const attempt = cache.pdf.find(a => a.id === id);
      if (!attempt) return;

      if (action === 'download') {
        await exportSinglePdf(attempt);
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

async function exportSinglePdf(attempt) {
  try {
    showProgress('جارٍ توليد PDF...', 'من فضلك استنى');

    const { data: answers, error } = await supabaseClient
      .from('answers')
      .select(`
        id, selected_choice_id, essay_text, marks_awarded, teacher_feedback,
        questions:question_id (question_text, question_type, marks, order_index),
        choices:selected_choice_id (choice_text)
      `)
      .eq('attempt_id', attempt.id)
      .order('answered_at', { ascending: true });

    if (error) throw error;

    const sortedAnswers = (answers || []).sort((a, b) => {
      const ai = a.questions?.order_index ?? 0;
      const bi = b.questions?.order_index ?? 0;
      return ai - bi;
    });

    updateProgress(15, 'جارٍ التحضير...');

    const html = buildPdfHtml(attempt, sortedAnswers);
    const template = document.getElementById('pdfTemplate');
    template.innerHTML = html;

    updateProgress(30, 'جارٍ التحويل لصورة...');

    const canvas = await html2canvas(template.firstElementChild, {
      scale: 1.5,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      allowTaint: true
    });

    updateProgress(70, 'جارٍ إنشاء PDF...');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (imgHeight <= pageHeight) {
      doc.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let yPos = 0;
      const pageHeightPx = (pageHeight * canvas.width) / pageWidth;

      while (heightLeft > 0) {
        const sourceY = (imgHeight - heightLeft) * (canvas.height / imgHeight);
        const sourceHeight = Math.min(pageHeightPx, canvas.height - sourceY);

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;
        const ctx = pageCanvas.getContext('2d');

        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);

        const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.92);
        const drawHeight = (sourceHeight * imgWidth) / canvas.width;

        if (yPos > 0) doc.addPage();
        doc.addImage(pageImgData, 'JPEG', 0, 0, imgWidth, drawHeight);

        heightLeft -= pageHeightPx;
        yPos++;
      }
    }

    updateProgress(90, 'جارٍ الحفظ...');

    const student = attempt.profiles || {};
    const exam = attempt.exams || {};
    const safeName = (student.username || 'student').replace(/[^a-z0-9_]/gi, '_');
    const safeExam = (exam.title || 'exam').replace(/[^\u0600-\u06FFa-z0-9]/gi, '_').slice(0, 30);
    doc.save(`${safeName}_${safeExam}_${Date.now()}.pdf`);

    await supabaseClient
      .from('attempts')
      .update({ pdf_exported: true, pdf_exported_at: new Date().toISOString() })
      .eq('id', attempt.id);

    updateProgress(100, 'تم ✅');

    setTimeout(() => {
      hideProgress();
      Toast.success('تم التنزيل ✅', 'دلوقتي تقدر تمسح من القاعدة');
      const inCache = cache.pdf.find(x => x.id === attempt.id);
      if (inCache) inCache.pdf_exported = true;
      renderPdfList();
      updateDeleteBtn();
      loadStats();
    }, 400);

    template.innerHTML = '';

  } catch (err) {
    console.error('PDF error:', err);
    hideProgress();
    Toast.error('خطأ', err.message || 'فشل توليد الـ PDF');
  }
}

function buildPdfHtml(attempt, answers) {
  const student = attempt.profiles || {};
  const exam = attempt.exams || {};
  const pct = attempt.total_marks ? Math.round((attempt.score / attempt.total_marks) * 100) : 0;
  const passed = attempt.total_marks && attempt.score >= (exam.pass_marks || 0);
  const time = calcDuration(attempt.started_at, attempt.submitted_at);
  const examType = exam.kind === 'assignment' ? 'واجب' : 'امتحان';

  const rows = answers.map((ans, i) => {
    const q = ans.questions || {};
    const isMcq = q.question_type === 'mcq';
    const studentAns = isMcq
      ? (ans.choices?.choice_text || 'لم يجب')
      : (ans.essay_text || 'لم يجب');
    const typeLabel = isMcq ? 'اختيار' : 'مقالي';
    const awarded = ans.marks_awarded ?? '—';

    return `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="q">${escapeHtml(q.question_text || '')}</td>
        <td class="c">${typeLabel}</td>
        <td>${escapeHtml(studentAns)}</td>
        <td class="c">${awarded}</td>
        <td class="c">${q.marks || 0}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="pdf-page" dir="rtl">
      <div class="pdf-page__header">
        <h1>منصة الأستاذ محمد عيسى التعليمية</h1>
        <p>مدرس اللغة العربية</p>
        <p style="font-size:10px;color:#888;margin-top:4px;">تقرير ${examType} رقمي</p>
      </div>

      <div class="pdf-section">
        <div class="pdf-section__title">بيانات الطالب</div>
        <div class="pdf-grid">
          <div class="pdf-grid__item"><b>الاسم:</b> <span>${escapeHtml(student.full_name || '—')}</span></div>
          <div class="pdf-grid__item"><b>اسم المستخدم:</b> <span>${escapeHtml(student.username || '—')}</span></div>
          <div class="pdf-grid__item"><b>الصف:</b> <span>${escapeHtml(student.grade || '—')}</span></div>
          <div class="pdf-grid__item"><b>النوع:</b> <span>${escapeHtml(student.type || '—')}${student.branch ? ' - ' + escapeHtml(student.branch) : ''}</span></div>
          <div class="pdf-grid__item"><b>هاتف الطالب:</b> <span>${escapeHtml(student.phone || '—')}</span></div>
          <div class="pdf-grid__item"><b>هاتف ولي الأمر:</b> <span>${escapeHtml(student.parent_phone || '—')}</span></div>
        </div>
      </div>

      <div class="pdf-section">
        <div class="pdf-section__title">بيانات ${examType}</div>
        <div class="pdf-grid">
          <div class="pdf-grid__item"><b>العنوان:</b> <span>${escapeHtml(exam.title || '—')}</span></div>
          <div class="pdf-grid__item"><b>المدة:</b> <span>${exam.duration_minutes || 0} دقيقة</span></div>
          <div class="pdf-grid__item"><b>البداية:</b> <span>${formatDate(attempt.started_at)}</span></div>
          <div class="pdf-grid__item"><b>التسليم:</b> <span>${formatDate(attempt.submitted_at)}</span></div>
          <div class="pdf-grid__item"><b>الوقت المستغرق:</b> <span>${time}</span></div>
        </div>
      </div>

      <div class="pdf-result">
        <div class="pdf-result__item"><b>${attempt.score ?? 0}</b><span>الدرجة</span></div>
        <div class="pdf-result__item"><b>${attempt.total_marks ?? 0}</b><span>الدرجة الكلية</span></div>
        <div class="pdf-result__item"><b>${pct}%</b><span>النسبة</span></div>
        <div class="pdf-result__item"><b>${passed ? '✓' : '✗'}</b><span>${passed ? 'ناجح' : 'راسب'}</span></div>
      </div>

      <div class="pdf-section" style="background:#fff;border:0;padding:0;">
        <div class="pdf-section__title">تفاصيل الإجابات</div>
        <table class="pdf-table">
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th>السؤال</th>
              <th style="width:60px;">النوع</th>
              <th>الإجابة</th>
              <th style="width:60px;">الدرجة</th>
              <th style="width:50px;">من</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center;color:#888;">لا توجد إجابات</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="pdf-page__footer">
        منصة الأستاذ محمد عيسى · ${new Date().toLocaleDateString('ar-EG')}
      </div>
    </div>
  `;
}

async function downloadAllPdf() {
  if (!cache.pdf.length) { Toast.warn('مفيش حاجة', 'مفيش محاولات'); return; }

  const notExported = cache.pdf.filter(a => !a.pdf_exported);
  const list = notExported.length ? notExported : cache.pdf;

  const ok = await UI.confirm({
    type: 'info',
    title: 'تنزيل كل الملفات؟',
    message: `سيتم تنزيل ${list.length} تقرير PDF. قد ياخد وقت.`,
    confirmText: 'تنزيل',
    cancelText: 'إلغاء'
  });
  if (!ok) return;

  showProgress('جارٍ التحضير...', `0 / ${list.length}`);

  let done = 0;
  for (const attempt of list) {
    try {
      await exportSinglePdfWithoutDialog(attempt, done, list.length);
      done++;
      updateProgress((done / list.length) * 100, `${done} / ${list.length}`);
    } catch (err) {
      console.error('فشل:', attempt.id, err);
    }
  }

  hideProgress();
  Toast.success('خلص التنزيل ✅', `اتنزل ${done} ملف`);
  loadPdfList();
  loadStats();
}

async function exportSinglePdfWithoutDialog(attempt, done, total) {
  const { data: answers, error } = await supabaseClient
    .from('answers')
    .select(`
      id, selected_choice_id, essay_text, marks_awarded,
      questions:question_id (question_text, question_type, marks, order_index),
      choices:selected_choice_id (choice_text)
    `)
    .eq('attempt_id', attempt.id)
    .order('answered_at', { ascending: true });

  if (error) throw error;

  const sortedAnswers = (answers || []).sort((a, b) => {
    const ai = a.questions?.order_index ?? 0;
    const bi = b.questions?.order_index ?? 0;
    return ai - bi;
  });

  const html = buildPdfHtml(attempt, sortedAnswers);
  const template = document.getElementById('pdfTemplate');
  template.innerHTML = html;

  const canvas = await html2canvas(template.firstElementChild, {
    scale: 1.5,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false
  });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  if (imgHeight <= pageHeight) {
    doc.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
  } else {
    let yPos = 0;
    let heightLeft = imgHeight;
    const pageHeightPx = (pageHeight * canvas.width) / pageWidth;

    while (heightLeft > 0) {
      const sourceY = (imgHeight - heightLeft) * (canvas.height / imgHeight);
      const sourceHeight = Math.min(pageHeightPx, canvas.height - sourceY);

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;
      const ctx = pageCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);

      const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.92);
      const drawHeight = (sourceHeight * imgWidth) / canvas.width;

      if (yPos > 0) doc.addPage();
      doc.addImage(pageImgData, 'JPEG', 0, 0, imgWidth, drawHeight);

      heightLeft -= pageHeightPx;
      yPos++;
    }
  }

  const student = attempt.profiles || {};
  const exam = attempt.exams || {};
  const safeName = (student.username || 'student').replace(/[^a-z0-9_]/gi, '_');
  const safeExam = (exam.title || 'exam').replace(/[^\u0600-\u06FFa-z0-9]/gi, '_').slice(0, 30);
  doc.save(`${String(done + 1).padStart(3, '0')}_${safeName}_${safeExam}.pdf`);

  await supabaseClient
    .from('attempts')
    .update({ pdf_exported: true, pdf_exported_at: new Date().toISOString() })
    .eq('id', attempt.id);

  const inCache = cache.pdf.find(x => x.id === attempt.id);
  if (inCache) inCache.pdf_exported = true;

  template.innerHTML = '';
}

function showProgress(title, text) {
  const modal = document.getElementById('progressModal');
  if (!modal) return;
  document.getElementById('progressTitle').textContent = title || 'جارٍ...';
  document.getElementById('progressText').textContent = text || '';
  document.getElementById('progressFill').style.width = '0%';
  modal.hidden = false;
}

function updateProgress(percent, text) {
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = `${Math.min(percent, 100)}%`;
  if (text) {
    const textEl = document.getElementById('progressText');
    if (textEl) textEl.textContent = text;
  }
}

function hideProgress() {
  const modal = document.getElementById('progressModal');
  if (modal) modal.hidden = true;
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
   10. Modal تفاصيل الطالب
   ═══════════════════════════════════════════════════════════════ */
async function openStudentDetails(attemptId) {
  let attempt = cache.attempts.find(a => a.id === attemptId);
  if (!attempt) attempt = cache.pdf.find(a => a.id === attemptId);
  if (!attempt) attempt = cache.grading.find(a => a.id === attemptId);

  if (!attempt) {
    const { data, error } = await supabaseClient
      .from('attempts')
      .select(`
        id, score, total_marks, status, started_at, submitted_at, expires_at, pdf_exported,
        profiles:student_id (id, full_name, username, grade, phone, parent_phone, type, branch),
        exams:exam_id (id, title, total_marks, pass_marks, kind, duration_minutes)
      `)
      .eq('id', attemptId)
      .maybeSingle();

    if (error || !data) { Toast.error('خطأ', 'مش قادر أجيب البيانات'); return; }
    attempt = data;
  }

  currentDetailsAttempt = attempt;

  const modal = document.getElementById('studentDetailsModal');
  const body = document.getElementById('detailsBody');

  body.innerHTML = renderDetails(attempt);

  const pdfBtn = document.getElementById('downloadStudentPdfBtn');
  if (pdfBtn) {
    pdfBtn.innerHTML = attempt.pdf_exported
      ? '<i class="fa-solid fa-rotate"></i> إعادة تنزيل PDF'
      : '<i class="fa-solid fa-file-pdf"></i> تنزيل PDF';
  }

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeStudentDetails() {
  const modal = document.getElementById('studentDetailsModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  currentDetailsAttempt = null;
}

function renderDetails(a) {
  const student = a.profiles || {};
  const exam = a.exams || {};
  const pct = a.total_marks ? Math.round((a.score / a.total_marks) * 100) : 0;
  const passed = a.total_marks && a.score >= (exam.pass_marks || 0);
  const time = calcDuration(a.started_at, a.submitted_at || a.expires_at);
  const isGraded = a.status === 'graded';

  let barCls = '';
  if (pct >= 75) barCls = 'percent-bar__fill--ok';
  else if (pct >= 50) barCls = 'percent-bar__fill--warn';
  else barCls = 'percent-bar__fill--err';

  const initials = (student.full_name || '؟').trim().split(' ')[0].charAt(0);

  const statusBadge = isGraded
    ? '<span class="badge badge--ok"><i class="fa-solid fa-check"></i> تم التصحيح</span>'
    : '<span class="badge badge--info"><i class="fa-solid fa-marker"></i> محتاج تصحيح</span>';

  return `
    <div class="details-hero">
      <div class="details-hero__avatar">${escapeHtml(initials)}</div>
      <div class="details-hero__info">
        <h3>${escapeHtml(student.full_name || '—')}</h3>
        <p>
          <span><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(student.grade || '—')}</span>
          <span><i class="fa-solid fa-school"></i> ${escapeHtml(student.type || '—')}${student.branch ? ' - ' + escapeHtml(student.branch) : ''}</span>
          ${statusBadge}
        </p>
      </div>
    </div>

    <div class="result-stats">
      <div class="rstat ${pct >= 75 ? 'rstat--ok' : (pct >= 50 ? 'rstat--warn' : 'rstat--err')}">
        <div class="rstat__ic"><i class="fa-solid fa-star"></i></div>
        <b>${a.score ?? 0}</b>
        <span>الدرجة</span>
      </div>
      <div class="rstat">
        <div class="rstat__ic"><i class="fa-solid fa-trophy"></i></div>
        <b>${a.total_marks ?? 0}</b>
        <span>من</span>
      </div>
      <div class="rstat ${pct >= 75 ? 'rstat--ok' : (pct >= 50 ? 'rstat--warn' : 'rstat--err')}">
        <div class="rstat__ic"><i class="fa-solid fa-percent"></i></div>
        <b>${pct}%</b>
        <span>النسبة</span>
      </div>
      <div class="rstat rstat--warn">
        <div class="rstat__ic"><i class="fa-solid fa-clock"></i></div>
        <b>${escapeHtml(time.split(' ')[0])}</b>
        <span>الوقت</span>
      </div>
    </div>

    <div class="percent-bar">
      <div class="percent-bar__head">
        <span><i class="fa-solid fa-chart-line"></i> نسبة النجاح</span>
        <b>${pct}%</b>
      </div>
      <div class="percent-bar__track">
        <div class="percent-bar__fill ${barCls}" style="width:${pct}%"></div>
      </div>
    </div>

    <div class="details-info">
      <div class="dinfo">
        <i class="fa-solid fa-file-pen"></i>
        <b>الامتحان:</b>
        <span class="ar">${escapeHtml(exam.title || '—')}</span>
      </div>
      <div class="dinfo">
        <i class="fa-solid fa-calendar-plus"></i>
        <b>البداية:</b>
        <span>${formatDate(a.started_at)}</span>
      </div>
      <div class="dinfo">
        <i class="fa-solid fa-calendar-check"></i>
        <b>التسليم:</b>
        <span>${formatDate(a.submitted_at || '—')}</span>
      </div>
      <div class="dinfo">
        <i class="fa-solid fa-hourglass-half"></i>
        <b>الوقت المستغرق:</b>
        <span class="ar">${escapeHtml(time)}</span>
      </div>
      <div class="dinfo">
        <i class="fa-solid fa-mobile-screen"></i>
        <b>هاتف الطالب:</b>
        <span>${escapeHtml(student.phone || '—')}</span>
      </div>
      <div class="dinfo">
        <i class="fa-solid fa-phone"></i>
        <b>ولي الأمر:</b>
        <span>${escapeHtml(student.parent_phone || '—')}</span>
      </div>
      <div class="dinfo">
        <i class="fa-solid ${passed ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
        <b>النتيجة:</b>
        <span class="ar" style="color:${passed ? 'var(--ok)' : 'var(--err)'};font-weight:700;">
          ${passed ? 'ناجح ✅' : 'يحتاج مراجعة ❌'}
        </span>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   11. Modal إنشاء امتحان
   ═══════════════════════════════════════════════════════════════ */
function openExamModal(editId = null) {
  const modal = document.getElementById('examModal');
  if (!modal) return;

  examModalState.isOpen = true;
  examModalState.editingId = editId;
  examModalState.kind = 'exam';
  examModalState.maxQuestions = 15;
  examModalState.questions = [];

  document.getElementById('examModalTitle').textContent = editId ? 'تعديل' : 'إنشاء امتحان';

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

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('examOpensAt').value = now.toISOString().slice(0, 16);

  const week = new Date();
  week.setDate(week.getDate() + 7);
  week.setMinutes(week.getMinutes() - week.getTimezoneOffset());
  document.getElementById('examClosesAt').value = week.toISOString().slice(0, 16);

  $$('input[name="grade"]').forEach(i => i.checked = false);
  $$('input[name="type"]').forEach(i => i.checked = false);
  $$('input[name="branch"]').forEach(i => i.checked = false);

  document.querySelector('input[name="examKind"][value="exam"]').checked = true;
  updateKindTabs();
  updateBranchesVisibility();

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
    if (tab.dataset.kind) {
      tab.classList.toggle('is-active', tab.dataset.kind === kind);
    }
  });

  const maxEl = document.getElementById('questionsMax');
  if (maxEl) maxEl.textContent = examModalState.maxQuestions;

  const titleEl = document.getElementById('examModalTitle');
  if (titleEl) {
    titleEl.textContent = (examModalState.editingId ? 'تعديل ' : 'إنشاء ') + (kind === 'exam' ? 'امتحان' : 'واجب');
  }

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
  if (section) {
    section.hidden = !(hasAzhar && hasThanwy);
    if (section.hidden) $$('input[name="branch"]').forEach(i => i.checked = false);
  }
}

function renderQuestions() {
  const list = document.getElementById('questionsList');
  if (!list) return;

  const count = examModalState.questions.length;
  const countEl = document.getElementById('questionsCount');
  if (countEl) countEl.textContent = count;

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
  bindQuestionEvents();

  const addBtn = document.getElementById('addQuestionBtn');
  if (addBtn) {
    addBtn.disabled = count >= examModalState.maxQuestions;
    addBtn.innerHTML = count >= examModalState.maxQuestions
      ? `<i class="fa-solid fa-circle-info"></i> وصلت للحد الأقصى (${examModalState.maxQuestions})`
      : `<i class="fa-solid fa-plus"></i> إضافة سؤال`;
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
          <label class="q-type-tab">
            <input type="radio" name="qtype_${index}" value="mcq" ${isMcq ? 'checked' : ''} data-qidx="${index}" data-qtype="mcq">
            <i class="fa-solid fa-list-ul"></i> MCQ
          </label>
          <label class="q-type-tab">
            <input type="radio" name="qtype_${index}" value="essay" ${!isMcq ? 'checked' : ''} data-qidx="${index}" data-qtype="essay">
            <i class="fa-solid fa-pen-fancy"></i> مقالي
          </label>
        </div>
        <button type="button" class="q-item__del" data-del="${index}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>

      <div class="q-field">
        <label><i class="fa-solid fa-question"></i> نص السؤال <span class="req">*</span></label>
        <textarea class="q-textarea" data-field="text" data-qidx="${index}" placeholder="اكتب السؤال...">${escapeHtml(q.question_text || '')}</textarea>
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
  const choices = q.choices && q.choices.length === 4 ? q.choices : [
    { choice_text: '', is_correct: false },
    { choice_text: '', is_correct: false },
    { choice_text: '', is_correct: false },
    { choice_text: '', is_correct: false }
  ];

  return `
    <div class="q-field">
      <label><i class="fa-solid fa-list"></i> الاختيارات <span class="req">*</span></label>
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
  if (!list) return;

  $$('[data-del]', list).forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.del, 10);
      const ok = await UI.confirm({
        type: 'danger', title: 'حذف السؤال؟',
        message: `سيتم حذف السؤال رقم ${idx + 1}.`,
        confirmText: 'حذف', cancelText: 'إلغاء'
      });
      if (!ok) return;
      examModalState.questions.splice(idx, 1);
      renderQuestions();
    });
  });

  $$('[data-qtype]', list).forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.qidx, 10);
      const type = input.dataset.qtype;
      const q = examModalState.questions[idx];
      if (!q) return;
      q.question_type = type;

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

  $$('[data-field="text"]', list).forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.qidx, 10);
      if (examModalState.questions[idx]) examModalState.questions[idx].question_text = el.value;
    });
  });

  $$('[data-field="marks"]', list).forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.qidx, 10);
      if (examModalState.questions[idx]) examModalState.questions[idx].marks = parseInt(el.value, 10) || 1;
    });
  });

  $$('[data-choice]', list).forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.choice, 10);
      const ci = parseInt(el.dataset.ci, 10);
      const q = examModalState.questions[idx];
      if (q && q.choices && q.choices[ci]) q.choices[ci].choice_text = el.value;
    });
  });

  $$('[data-correct]', list).forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.correct, 10);
      const ci = parseInt(input.dataset.ci, 10);
      const q = examModalState.questions[idx];
      if (q && q.choices) q.choices.forEach((c, i) => c.is_correct = (i === ci));
      const item = input.closest('.q-item');
      $$('.q-choice', item).forEach((ch, i) => ch.classList.toggle('is-correct', i === ci));
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
}

async function saveExam(status = 'draft') {
  try {
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

    const errs = [];
    if (!title) errs.push('العنوان مطلوب');
    if (!grades.length) errs.push('اختر صف واحد على الأقل');
    if (!types.length) errs.push('اختر نوع واحد على الأقل');
    if (!duration || duration < 1) errs.push('المدة غير صحيحة');
    if (!closesAt) errs.push('وقت الإغلاق مطلوب');

    const hasAzhar = types.includes('أزهر');
    const hasThanwy = grades.some(g => g.includes('ثانوي'));
    if (hasAzhar && hasThanwy && !branches.length) errs.push('اختر فرع واحد على الأقل');

    if (!examModalState.questions.length) errs.push('لازم تضيف سؤال واحد على الأقل');

    for (let i = 0; i < examModalState.questions.length; i++) {
      const q = examModalState.questions[i];
      if (!q.question_text.trim()) { errs.push(`السؤال ${i + 1}: النص مطلوب`); break; }
      if (q.question_type === 'mcq') {
        const emptyChoice = q.choices.findIndex(c => !c.choice_text.trim());
        if (emptyChoice !== -1) { errs.push(`السؤال ${i + 1}: الاختيار ${emptyChoice + 1} فاضي`); break; }
        if (!q.choices.some(c => c.is_correct)) { errs.push(`السؤال ${i + 1}: اختر الإجابة الصحيحة`); break; }
      }
    }

    if (errs.length) { Toast.warn('تحقق من البيانات', errs[0]); return; }

    const totalMarks = examModalState.questions.reduce((s, q) => s + (q.marks || 0), 0);
    const opensISO = opensAt ? new Date(opensAt).toISOString() : new Date().toISOString();
    const closesISO = new Date(closesAt).toISOString();

    const payload = {
      title, description,
      grade: grades[0], type: types[0], branch: branches[0] || null,
      duration_minutes: duration,
      opens_at: opensISO, closes_at: closesISO,
      total_marks: totalMarks, pass_marks: passMarks,
      status, kind, created_by: currentUser.id
    };

    let examId = examModalState.editingId;

    if (examId) {
      const { error } = await supabaseClient.from('exams').update(payload).eq('id', examId);
      if (error) throw error;
      await supabaseClient.from('questions').delete().eq('exam_id', examId);
    } else {
      const { data, error } = await supabaseClient.from('exams').insert(payload).select('id').single();
      if (error) throw error;
      examId = data.id;
    }

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

async function loadExamForEdit(examId) {
  try {
    const { data: exam, error } = await supabaseClient
      .from('exams').select('*').eq('id', examId).single();

    if (error || !exam) {
      Toast.error('خطأ', 'مش قادر أجيب الامتحان');
      closeExamModal();
      return;
    }

    document.getElementById('examTitle').value = exam.title || '';
    document.getElementById('examDesc').value = exam.description || '';
    document.getElementById('examDuration').value = exam.duration_minutes || 60;
    document.getElementById('examPassMarks').value = exam.pass_marks || 50;

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

    $$('input[name="grade"]').forEach(i => i.checked = (i.value === exam.grade));
    $$('input[name="type"]').forEach(i => i.checked = (i.value === exam.type));
    $$('input[name="branch"]').forEach(i => i.checked = (i.value === exam.branch));

    const kind = exam.kind || 'exam';
    document.querySelector(`input[name="examKind"][value="${kind}"]`).checked = true;
    examModalState.kind = kind;
    examModalState.maxQuestions = kind === 'exam' ? 15 : 5;
    document.getElementById('questionsMax').textContent = examModalState.maxQuestions;

    $$('.exam-kind-tab').forEach(tab => {
      if (tab.dataset.kind) tab.classList.toggle('is-active', tab.dataset.kind === kind);
    });

    updateBranchesVisibility();

    const { data: questions } = await supabaseClient
      .from('questions').select('*').eq('exam_id', examId).order('order_index', { ascending: true });

    const qIds = (questions || []).map(q => q.id);
    let allChoices = [];
    if (qIds.length) {
      const { data: choices } = await supabaseClient
        .from('choices').select('*').in('question_id', qIds).order('order_index', { ascending: true });
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
    document.getElementById('examModalTitle').textContent = 'تعديل ' + (kind === 'exam' ? 'امتحان' : 'واجب');

  } catch (err) {
    console.error(err);
    Toast.error('خطأ', 'حاول تاني');
    closeExamModal();
  }
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

function calcDuration(startISO, endISO) {
  if (!startISO || !endISO) return '—';
  const start = new Date(startISO);
  const end = new Date(endISO);
  const diffMs = end - start;
  if (diffMs < 0) return '—';

  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) return `${hours} س ${mins} د`;
  if (mins > 0) return `${mins} د ${secs} ث`;
  return `${secs} ث`;
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
  }

  initTabs();

  /* ─── أزرار الهيدر ─── */
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    const ok = await UI.confirm({
      type: 'warn', title: 'تسجيل الخروج؟',
      message: 'هترجع لصفحة تسجيل الدخول.',
      confirmText: 'خروج', cancelText: 'إلغاء'
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
    else if (active === 'courses') loadCourses();
    else if (active === 'enrollments') loadEnrollments();
    else if (active === 'exams') loadExams();
    else if (active === 'grading') loadGrading();
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
  document.getElementById('searchCourses')?.addEventListener('input', renderCourses);
  document.getElementById('searchEnrollments')?.addEventListener('input', renderEnrollments);
  document.getElementById('filterEnrollmentStatus')?.addEventListener('change', renderEnrollments);
  document.getElementById('searchGrading')?.addEventListener('input', renderGrading);
  document.getElementById('filterGrading')?.addEventListener('change', renderGrading);
  document.getElementById('searchAttempts')?.addEventListener('input', renderAttempts);
  document.getElementById('filterAttempts')?.addEventListener('change', renderAttempts);
  document.getElementById('searchPdf')?.addEventListener('input', renderPdfList);

  /* ─── PDF ─── */
  document.getElementById('downloadAllPdfBtn')?.addEventListener('click', downloadAllPdf);
  document.getElementById('deleteExportedBtn')?.addEventListener('click', deleteExported);

  /* ─── كورسات ─── */
  document.getElementById('newCourseBtn')?.addEventListener('click', () => openCourseModal());
  document.getElementById('closeCourseModal')?.addEventListener('click', closeCourseModal);
  document.getElementById('cancelCourseBtn')?.addEventListener('click', closeCourseModal);
  document.getElementById('courseModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeCourseModal();
  });
  document.getElementById('saveCourseBtn')?.addEventListener('click', saveCourse);

  /* ─── معاينة لينك الغلاف ─── */
  document.getElementById('courseCoverUrl')?.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    const preview = document.getElementById('courseCoverPreview');
    if (!preview) return;

    if (!url) {
      preview.innerHTML = '<i class="fa-solid fa-image"></i><p>هتلاقي معاينة الصورة هنا</p>';
      preview.classList.remove('has-image');
      return;
    }

    const img = new Image();
    img.onload = () => {
      preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Cover">`;
      preview.classList.add('has-image');
    };
    img.onerror = () => {
      preview.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><p>اللينك مش صورة صالحة</p>';
      preview.classList.remove('has-image');
    };
    img.src = url;
  });

  /* ─── تحديث الفروع في الكورس ─── */
  $$('input[name="courseGrade"], input[name="courseType"]').forEach(i => {
    i.addEventListener('change', updateCourseBranchesVisibility);
  });

  /* ─── الفولدرات ─── */
  document.getElementById('closeFoldersModal')?.addEventListener('click', closeFoldersModal);
  document.getElementById('closeFoldersBtn')?.addEventListener('click', closeFoldersModal);
  document.getElementById('foldersModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeFoldersModal();
  });
  document.getElementById('addFolderBtn')?.addEventListener('click', () => openFolderModal());

  document.getElementById('closeFolderModal')?.addEventListener('click', closeFolderModal);
  document.getElementById('cancelFolderBtn')?.addEventListener('click', closeFolderModal);
  document.getElementById('saveFolderBtn')?.addEventListener('click', saveFolder);
  document.getElementById('folderModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeFolderModal();
  });

  /* ─── العنصر ─── */
  document.getElementById('closeItemModal')?.addEventListener('click', closeItemModal);
  document.getElementById('cancelItemBtn')?.addEventListener('click', closeItemModal);
  document.getElementById('saveItemBtn')?.addEventListener('click', saveItem);
  document.getElementById('itemModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeItemModal();
  });

  document.querySelectorAll('input[name="itemType"]').forEach(input => {
    input.addEventListener('change', updateItemTypeTabs);
  });

  document.querySelectorAll('.exam-kind-tab[data-itemtype]').forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.itemtype;
      const input = document.querySelector(`input[name="itemType"][value="${type}"]`);
      if (input) {
        input.checked = true;
        updateItemTypeTabs();
      }
    });
  });

  /* ─── الامتحانات ─── */
  document.getElementById('newExamBtn')?.addEventListener('click', () => openExamModal());
  document.getElementById('closeExamModal')?.addEventListener('click', closeExamModal);
  document.getElementById('cancelExamBtn')?.addEventListener('click', closeExamModal);
  document.getElementById('examModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeExamModal();
  });

  $$('.exam-kind-tab').forEach(tab => {
    if (tab.dataset.kind) {
      tab.addEventListener('click', () => {
        const kind = tab.dataset.kind;
        document.querySelector(`input[name="examKind"][value="${kind}"]`).checked = true;
        updateKindTabs();
      });
    }
  });

  document.querySelectorAll('input[name="grade"]').forEach(function(i) {
    i.addEventListener('change', updateBranchesVisibility);
  });
  document.querySelectorAll('input[name="type"]').forEach(function(i) {
    i.addEventListener('change', updateBranchesVisibility);
  });

  document.getElementById('addQuestionBtn')?.addEventListener('click', addQuestion);
  document.getElementById('saveDraftBtn')?.addEventListener('click', () => saveExam('draft'));
  document.getElementById('publishExamBtn')?.addEventListener('click', () => saveExam('published'));

  /* ─── Modal تفاصيل الطالب ─── */
  document.getElementById('closeDetailsModal')?.addEventListener('click', closeStudentDetails);
  document.getElementById('closeDetailsBtn')?.addEventListener('click', closeStudentDetails);
  document.getElementById('studentDetailsModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeStudentDetails();
  });

  document.getElementById('downloadStudentPdfBtn')?.addEventListener('click', async () => {
    if (!currentDetailsAttempt) return;
    const att = currentDetailsAttempt;
    closeStudentDetails();
    await exportSinglePdf(att);
  });

  /* ─── Modal التصحيح ─── */
  document.getElementById('closeGradingModal')?.addEventListener('click', closeGradingModal);
  document.getElementById('cancelGradingBtn')?.addEventListener('click', closeGradingModal);
  document.getElementById('gradingModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeGradingModal();
  });
  document.getElementById('saveGradingBtn')?.addEventListener('click', saveGrading);

  /* ─── تحميل أولي ─── */
  loadStats();
  loadPending();
});