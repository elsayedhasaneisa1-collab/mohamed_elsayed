/* ═══════════════════════════════════════════════════════════════
   course.js — صفحة الكورس
   منصة الأستاذ محمد عيسى
   ⚠️ $ و $$ معرّفين في auth.js
   ⚠️ UI.confirm في ui.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

let currentUser = null;
let currentProfile = null;
let currentCourse = null;
let currentEnrollment = null;
let folders = [];
let folderItemsMap = {};
let completedItems = new Set();
let ytPlayer = null;
let currentPlayingItem = null;
let watermarkTimer = null;
let blurOverlayActive = false;

/* ═══════════════════════════════════════════════════════════════
   التهيئة
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();

  const guard = await guardPage('student');
  if (!guard) return;

  currentUser = guard.session.user;
  currentProfile = guard.profile;

  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('id');

  if (!courseId) {
    Toast.error('خطأ', 'معرف الكورس غير موجود');
    setTimeout(() => window.location.href = 'index.html', 1500);
    return;
  }

  await loadCourse(courseId);
  setupEventListeners();
});

/* ═══════════════════════════════════════════════════════════════
   تحميل الكورس
   ═══════════════════════════════════════════════════════════════ */
async function loadCourse(courseId) {
  try {
    // 1) نجيب الكورس
    const { data: course, error: courseErr } = await supabaseClient
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .eq('is_published', true)
      .maybeSingle();

    if (courseErr || !course) {
      Toast.error('خطأ', 'الكورس غير موجود');
      setTimeout(() => window.location.href = 'index.html', 1500);
      return;
    }

    currentCourse = course;

    // 2) نتحقق من الاشتراك
    const { data: enrollment } = await supabaseClient
      .from('enrollments')
      .select('*')
      .eq('course_id', courseId)
      .eq('student_id', currentUser.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!enrollment) {
      // مش مشترك
      document.getElementById('courseLoading').hidden = true;
      document.getElementById('courseLocked').hidden = false;
      return;
    }

    currentEnrollment = enrollment;

    // 3) نجيب الفولدرات
    const { data: foldersData, error: fErr } = await supabaseClient
      .from('folders')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true });

    if (fErr) throw fErr;

    folders = foldersData || [];

    // 4) نجيب العناصر
    if (folders.length) {
      const folderIds = folders.map(f => f.id);
      const { data: itemsData } = await supabaseClient
        .from('folder_items')
        .select('*')
        .in('folder_id', folderIds)
        .order('order_index', { ascending: true });

      folderItemsMap = {};
      (itemsData || []).forEach(it => {
        if (!folderItemsMap[it.folder_id]) folderItemsMap[it.folder_id] = [];
        folderItemsMap[it.folder_id].push(it);
      });

      // 5) نجيب تقدم الطالب
      const { data: progressData } = await supabaseClient
        .from('lesson_progress')
        .select('folder_item_id, is_completed')
        .eq('enrollment_id', enrollment.id)
        .eq('is_completed', true);

      completedItems = new Set((progressData || []).map(p => p.folder_item_id));
    }

    // 6) نرندر
    renderCourse();

    document.getElementById('courseLoading').hidden = true;
    document.getElementById('courseShell').hidden = false;

  } catch (err) {
    console.error('Course error:', err);
    Toast.error('خطأ', err.message || 'حاول تاني');
    setTimeout(() => window.location.href = 'index.html', 1500);
  }
}

/* ═══════════════════════════════════════════════════════════════
   رندر الكورس
   ═══════════════════════════════════════════════════════════════ */
function renderCourse() {
  const course = currentCourse;

  // عنوان الهيدر
  document.getElementById('courseTopTitle').textContent = course.title || 'الكورس';

  // Hero
  document.getElementById('courseHeroTitle').textContent = course.title || '—';
  document.getElementById('courseHeroDesc').textContent = course.description || '';

  const coverEl = document.getElementById('courseHeroCover');
  if (course.cover_url) {
    coverEl.innerHTML = `<img src="${escapeHtml(course.cover_url)}" alt="${escapeHtml(course.title)}">`;
  }

  document.getElementById('courseHeroGrade').textContent = course.grade || '—';
  document.getElementById('courseHeroFolders').textContent = folders.length;

  const totalItems = Object.values(folderItemsMap).reduce((s, arr) => s + arr.length, 0);
  document.getElementById('courseHeroItems').textContent = totalItems;

  // Progress
  const completedCount = completedItems.size;
  const pct = totalItems ? Math.round((completedCount / totalItems) * 100) : 0;
  document.getElementById('courseProgressPct').textContent = `${pct}%`;
  document.getElementById('courseProgressFill').style.width = `${pct}%`;
  document.getElementById('courseProgressText').textContent = `${completedCount} / ${totalItems} درس`;

  // الفولدرات
  const list = document.getElementById('foldersList');
  const empty = document.getElementById('courseEmpty');

  if (!folders.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.innerHTML = folders.map((f, idx) => folderHtml(f, idx)).join('');
  bindFolderEvents();
}

function folderHtml(folder, idx) {
  const items = folderItemsMap[folder.id] || [];
  const itemsCount = items.length;
  const completedInFolder = items.filter(it => completedItems.has(it.id)).length;

  const itemsHtml = itemsCount
    ? items.map(it => itemHtml(it)).join('')
    : `<div style="text-align:center;padding:16px;color:var(--muted);font-size:.82rem;">
        <i class="fa-solid fa-inbox" style="font-size:1.5rem;color:var(--gold-deep);display:block;margin-bottom:6px;"></i>
        مفيش دروس في الفولدر ده
      </div>`;

  const isOpen = idx === 0 ? 'is-open' : '';

  return `
    <div class="cfolder ${isOpen}" data-folder-id="${folder.id}">
      <div class="cfolder__head">
        <div class="cfolder__icon">
          <i class="fa-solid fa-folder"></i>
        </div>
        <div class="cfolder__info">
          <h4>${escapeHtml(folder.title)}</h4>
          <p>
            <span><i class="fa-solid fa-circle-play"></i> ${itemsCount} درس</span>
            ${completedInFolder > 0 ? `<span style="color:var(--ok)"><i class="fa-solid fa-check"></i> ${completedInFolder} تم</span>` : ''}
          </p>
        </div>
        <div class="cfolder__arrow">
          <i class="fa-solid fa-chevron-down"></i>
        </div>
      </div>
      <div class="cfolder__body">
        ${folder.description ? `<p style="padding:10px 14px 0;font-size:.82rem;color:var(--muted);">${escapeHtml(folder.description)}</p>` : ''}
        <div class="cfolder__items">
          ${itemsHtml}
        </div>
      </div>
    </div>
  `;
}

function itemHtml(item) {
  const isYt = item.item_type === 'youtube';
  const isDone = completedItems.has(item.id);

  let iconCls = isYt ? 'citem__icon--youtube' : 'citem__icon--link';
  let icon = isYt ? 'fa-brands fa-youtube' : 'fa-solid fa-link';
  let subtitle = '';

  if (isYt) {
    subtitle = item.description || 'درس فيديو';
  } else {
    subtitle = item.description || 'رابط خارجي';
  }

  if (isDone) {
    iconCls = 'citem__icon--done';
    icon = 'fa-solid fa-circle-check';
  }

  return `
    <div class="citem ${isDone ? 'is-completed' : ''}" data-item-id="${item.id}" data-item-type="${item.item_type}">
      <div class="citem__icon ${iconCls}">
        <i class="${icon}"></i>
      </div>
      <div class="citem__body">
        <h5>${escapeHtml(item.title)}</h5>
        <small><i class="fa-solid ${isYt ? 'fa-circle-play' : 'fa-arrow-up-right-from-square'}"></i> ${escapeHtml(subtitle)}</small>
      </div>
      <div class="citem__status">
        <i class="fa-solid ${isDone ? 'fa-check' : (isYt ? 'fa-play' : 'fa-arrow-left')}"></i>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   أحداث الفولدرات
   ═══════════════════════════════════════════════════════════════ */
function bindFolderEvents() {
  // فتح/غلق الفولدر
  $$('.cfolder__head').forEach(head => {
    head.addEventListener('click', () => {
      const folder = head.closest('.cfolder');
      folder.classList.toggle('is-open');
    });
  });

  // فتح درس
  $$('.citem').forEach(item => {
    item.addEventListener('click', () => {
      const itemId = item.dataset.itemId;
      const type = item.dataset.itemType;
      openItem(itemId, type);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   فتح عنصر
   ═══════════════════════════════════════════════════════════════ */
function openItem(itemId, type) {
  // ندوّر على العنصر
  let item = null;
  for (const arr of Object.values(folderItemsMap)) {
    const found = arr.find(it => it.id === itemId);
    if (found) { item = found; break; }
  }

  if (!item) {
    Toast.error('خطأ', 'العنصر غير موجود');
    return;
  }

  if (type === 'youtube') {
    openVideoPlayer(item);
  } else {
    openLinkModal(item);
  }
}

/* ═══════════════════════════════════════════════════════════════
   مشغل YouTube
   ═══════════════════════════════════════════════════════════════ */
function openVideoPlayer(item) {
  currentPlayingItem = item;

  document.getElementById('videoPlayerTitle').textContent = item.title || '—';
  document.getElementById('videoPlayerDesc').textContent = item.description || '';
  document.getElementById('videoPlayerWatermark').textContent =
    `${currentProfile.full_name || ''} · ${currentProfile.phone || ''}`;

  const modal = document.getElementById('videoPlayerModal');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  // نحمّل الفيديو
  loadYouTubePlayer(item.youtube_id);

  // نبدأ watermark
  startVideoWatermark();

  // نراقب التركيز
  startFocusWatcher();
}

function loadYouTubePlayer(videoId) {
  const container = document.getElementById('ytPlayerContainer');
  container.innerHTML = '';

  // لو الـ API محمّل بالفعل
  if (window.YT && window.YT.Player) {
    createYTPlayer(videoId, container);
    return;
  }

  // ننتظر الـ API
  window.onYouTubeIframeAPIReady = function() {
    createYTPlayer(videoId, container);
  };
}

function createYTPlayer(videoId, container) {
  // نمسح أي مشغل قديم
  if (ytPlayer) {
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }

  const playerDiv = document.createElement('div');
  playerDiv.id = 'ytPlayer';
  container.appendChild(playerDiv);

  ytPlayer = new YT.Player('ytPlayer', {
    height: '100%',
    width: '100%',
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      showinfo: 0,
      iv_load_policy: 3,
      fs: 0,
      playsinline: 1,
      disablekb: 0
    },
    events: {
      onReady: (e) => {
        e.target.playVideo();
      },
      onStateChange: (e) => {
        // 0 = ended
        if (e.data === 0) {
          onVideoEnded();
        }
      },
      onError: (e) => {
        console.error('YT error:', e.data);
        Toast.error('خطأ', 'مش قادر أشغّل الفيديو');
      }
    }
  });
}

function onVideoEnded() {
  if (!currentPlayingItem) return;

  // نعلّمه كمكتمل
  markItemCompleted(currentPlayingItem.id);

  Toast.success('تم ✅', 'تم مشاهدة الدرس');
}

function closeVideoPlayer() {
  const modal = document.getElementById('videoPlayerModal');
  modal.hidden = true;
  document.body.style.overflow = '';

  // نوقف المشغل
  if (ytPlayer) {
    try { ytPlayer.stopVideo(); } catch (e) {}
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }

  document.getElementById('ytPlayerContainer').innerHTML = '';

  stopVideoWatermark();
  stopFocusWatcher();
  currentPlayingItem = null;
}

/* ═══════════════════════════════════════════════════════════════
   Watermark داخل الفيديو
   ═══════════════════════════════════════════════════════════════ */
function startVideoWatermark() {
  const overlay = document.getElementById('videoPlayerOverlay');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="video-player__overlay-text" id="videoWatermarkText">
      <span>—</span>
    </div>
  `;

  const textEl = document.getElementById('videoWatermarkText');
  const spanEl = textEl.querySelector('span');

  function update() {
    // رقم الهاتف فقط
    spanEl.textContent = currentProfile.phone || currentProfile.username || '—';

    // مكان عشوائي
    const maxX = Math.max(20, overlay.offsetWidth - 140);
    const maxY = Math.max(20, overlay.offsetHeight - 40);
    const x = Math.max(10, Math.floor(Math.random() * maxX));
    const y = Math.max(10, Math.floor(Math.random() * maxY));

    textEl.style.left = x + 'px';
    textEl.style.top = y + 'px';
    textEl.style.opacity = (Math.random() * 0.25 + 0.6).toFixed(2);
  }

  update();
  // كل 5 ثواني
  watermarkTimer = setInterval(update, 5000);
}

function stopVideoWatermark() {
  if (watermarkTimer) {
    clearInterval(watermarkTimer);
    watermarkTimer = null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   مراقبة التركيز (منع التصوير)
   ═══════════════════════════════════════════════════════════════ */
function startFocusWatcher() {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('keydown', handleKeyDown);
}

function stopFocusWatcher() {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('blur', handleBlur);
  window.removeEventListener('focus', handleFocus);
  document.removeEventListener('keydown', handleKeyDown);
  blurOverlayActive = false;
}

function handleVisibilityChange() {
  if (document.hidden && currentPlayingItem) {
    pauseVideoAndBlur('خروج من الشاشة');
  }
}

function handleBlur() {
  if (currentPlayingItem && !blurOverlayActive) {
    pauseVideoAndBlur('فقدان التركيز');
  }
}

function handleFocus() {
  removeBlurOverlay();
}

function handleKeyDown(e) {
  if (!currentPlayingItem) return;

  // Print Screen
  if (e.key === 'PrintScreen' || e.keyCode === 44) {
    e.preventDefault();
    handleScreenshotAttempt();
    return;
  }

  // Windows + Shift + S
  if (e.metaKey && e.shiftKey && e.key.toUpperCase() === 'S') {
    e.preventDefault();
    handleScreenshotAttempt();
    return;
  }
}

function handleScreenshotAttempt() {
  if (!currentPlayingItem) return;

  Toast.warn('⚠️ تحذير', 'ممنوع تصوير المحتوى');

  // نشيل الفيديو
  if (ytPlayer) {
    try { ytPlayer.pauseVideo(); } catch (e) {}
  }

  // overlay أسود
  addBlackoutOverlay();

  setTimeout(() => {
    removeBlackoutOverlay();
  }, 2500);
}

function pauseVideoAndBlur(reason) {
  if (ytPlayer) {
    try { ytPlayer.pauseVideo(); } catch (e) {}
  }
  addBlurOverlay(reason);
}

function addBlurOverlay(reason) {
  if (blurOverlayActive) return;
  blurOverlayActive = true;

  let overlay = document.getElementById('videoBlurOverlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'videoBlurOverlay';
  overlay.className = 'cheat-warning';
  overlay.innerHTML = `
    <div class="cheat-warning__box">
      <i class="fa-solid fa-eye-slash"></i>
      <h3>⚠️ رجّع تركيزك</h3>
      <p>${escapeHtml(reason || 'خروج من الشاشة')}</p>
      <button class="btn btn--gold" id="resumeVideoBtn">متابعة</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#resumeVideoBtn').addEventListener('click', () => {
    removeBlurOverlay();
    if (ytPlayer) {
      try { ytPlayer.playVideo(); } catch (e) {}
    }
  });
}

function removeBlurOverlay() {
  const overlay = document.getElementById('videoBlurOverlay');
  if (overlay) overlay.remove();
  blurOverlayActive = false;
}

function addBlackoutOverlay() {
  let overlay = document.getElementById('videoBlackout');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'videoBlackout';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;background:#000;
    display:grid;place-items:center;padding:24px;
    color:#fff;text-align:center;
  `;
  overlay.innerHTML = `
    <div>
      <i class="fa-solid fa-camera-retro" style="font-size:3rem;color:#ff5c5c;margin-bottom:16px;display:block;"></i>
      <h2 style="font-size:1.3rem;color:#ff8a8a;margin-bottom:10px;font-family:'Cairo',sans-serif;">⚠️ تم رصد محاولة تصوير</h2>
      <p style="color:rgba(255,255,255,.7);font-size:.9rem;">سيتم استئناف الفيديو خلال لحظات...</p>
    </div>
  `;
  document.body.appendChild(overlay);
}

function removeBlackoutOverlay() {
  const overlay = document.getElementById('videoBlackout');
  if (overlay) overlay.remove();
}

/* ═══════════════════════════════════════════════════════════════
   Modal اللينك
   ═══════════════════════════════════════════════════════════════ */
function openLinkModal(item) {
  document.getElementById('linkModalTitle').textContent = item.title || '—';
  document.getElementById('linkModalDesc').textContent = item.description || '';
  document.getElementById('linkModalGoBtn').href = item.external_url || '#';

  const modal = document.getElementById('linkModal');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  // نعلّمه كمكتمل تلقائي بعد الفتح
  setTimeout(() => {
    markItemCompleted(item.id);
  }, 1000);
}

function closeLinkModal() {
  const modal = document.getElementById('linkModal');
  modal.hidden = true;
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════════
   تسجيل الدرس كمكتمل
   ═══════════════════════════════════════════════════════════════ */
async function markItemCompleted(itemId) {
  if (!currentEnrollment) return;
  if (completedItems.has(itemId)) return;

  try {
    // نشوف لو موجود
    const { data: existing } = await supabaseClient
      .from('lesson_progress')
      .select('id')
      .eq('enrollment_id', currentEnrollment.id)
      .eq('folder_item_id', itemId)
      .maybeSingle();

    if (existing) {
      await supabaseClient
        .from('lesson_progress')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabaseClient.from('lesson_progress').insert({
        enrollment_id: currentEnrollment.id,
        folder_item_id: itemId,
        is_completed: true,
        completed_at: new Date().toISOString()
      });
    }

    completedItems.add(itemId);

    // نحدّث الواجهة
    updateProgressUI();

  } catch (err) {
    console.error('Mark completed error:', err);
  }
}

function updateProgressUI() {
  const totalItems = Object.values(folderItemsMap).reduce((s, arr) => s + arr.length, 0);
  const completedCount = completedItems.size;
  const pct = totalItems ? Math.round((completedCount / totalItems) * 100) : 0;

  document.getElementById('courseProgressPct').textContent = `${pct}%`;
  document.getElementById('courseProgressFill').style.width = `${pct}%`;
  document.getElementById('courseProgressText').textContent = `${completedCount} / ${totalItems} درس`;

  // نحدّث العناصر
  $$('.citem').forEach(el => {
    const id = el.dataset.itemId;
    if (completedItems.has(id)) {
      el.classList.add('is-completed');
      const icon = el.querySelector('.citem__icon');
      if (icon) {
        icon.className = 'citem__icon citem__icon--done';
        icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
      }
      const status = el.querySelector('.citem__status');
      if (status) status.innerHTML = '<i class="fa-solid fa-check"></i>';
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   أحداث
   ═══════════════════════════════════════════════════════════════ */
function setupEventListeners() {
  // إغلاق المشغل
  document.getElementById('closeVideoPlayer')?.addEventListener('click', closeVideoPlayer);

  // إغلاق اللينك
  document.getElementById('closeLinkModal')?.addEventListener('click', closeLinkModal);
  document.getElementById('linkModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeLinkModal();
  });

  // "تم مشاهدة الدرس"
  document.getElementById('markCompletedBtn')?.addEventListener('click', () => {
    if (currentPlayingItem) {
      markItemCompleted(currentPlayingItem.id);
      Toast.success('تم ✅', 'تم تسجيل الدرس كمكتمل');
      closeVideoPlayer();
    }
  });

  // تحديث
  document.getElementById('courseRefreshBtn')?.addEventListener('click', () => {
    window.location.reload();
  });

  // ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const videoModal = document.getElementById('videoPlayerModal');
      const linkModal = document.getElementById('linkModal');
      if (videoModal && !videoModal.hidden) closeVideoPlayer();
      if (linkModal && !linkModal.hidden) closeLinkModal();
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