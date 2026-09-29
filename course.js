/* ═══════════════════════════════════════════════════════════════
   course.js — صفحة الكورس
   منصة الأستاذ محمد عيسى
   مشغل YouTube مخصص + حماية قوية
   ═══════════════════════════════════════════════════════════════ */

'use strict';

let currentUser = null;
let currentProfile = null;
let currentCourse = null;
let currentEnrollment = null;
let folders = [];
let folderItemsMap = {};
let completedItems = new Set();

/* ─── حالة المشغل ─── */
let ytPlayer = null;
let ytReady = false;
let isPlaying = false;
let isMuted = false;
let currentPlayingItem = null;
let progressInterval = null;
let watermarkTimer = null;
let controlsTimer = null;
let isSeeking = false;
let blackoutActive = false;

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

    const { data: enrollment } = await supabaseClient
      .from('enrollments')
      .select('*')
      .eq('course_id', courseId)
      .eq('student_id', currentUser.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!enrollment) {
      document.getElementById('courseLoading').hidden = true;
      document.getElementById('courseLocked').hidden = false;
      return;
    }

    currentEnrollment = enrollment;

    const { data: foldersData, error: fErr } = await supabaseClient
      .from('folders')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true });

    if (fErr) throw fErr;

    folders = foldersData || [];

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

      const { data: progressData } = await supabaseClient
        .from('lesson_progress')
        .select('folder_item_id, is_completed')
        .eq('enrollment_id', enrollment.id)
        .eq('is_completed', true);

      completedItems = new Set((progressData || []).map(p => p.folder_item_id));
    }

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

  document.getElementById('courseTopTitle').textContent = course.title || 'الكورس';
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

  const completedCount = completedItems.size;
  const pct = totalItems ? Math.round((completedCount / totalItems) * 100) : 0;
  document.getElementById('courseProgressPct').textContent = `${pct}%`;
  document.getElementById('courseProgressFill').style.width = `${pct}%`;
  document.getElementById('courseProgressText').textContent = `${completedCount} / ${totalItems} درس`;

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
  let subtitle = item.description || (isYt ? 'درس فيديو' : 'رابط خارجي');

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
  $$('.cfolder__head').forEach(head => {
    head.addEventListener('click', () => {
      head.closest('.cfolder').classList.toggle('is-open');
    });
  });

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
   مشغل YouTube المخصص
   ═══════════════════════════════════════════════════════════════ */
function openVideoPlayer(item) {
  currentPlayingItem = item;

  document.getElementById('videoPlayerTitle').textContent = item.title || '—';
  document.getElementById('videoPlayerDesc').textContent = item.description || '';

  const modal = document.getElementById('videoPlayerModal');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  resetPlayerUI();
  loadYouTubePlayer(item.youtube_id);

  startVideoWatermark();
  showControlsTemporarily();
}

function resetPlayerUI() {
  isPlaying = false;
  isMuted = false;
  ytReady = false;
  blackoutActive = false;

  const bigPlay = document.getElementById('videoBigPlay');
  if (bigPlay) bigPlay.hidden = false;

  const playBtn = document.getElementById('videoPlayBtn');
  if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';

  const muteBtn = document.getElementById('videoMuteBtn');
  if (muteBtn) muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';

  const blackout = document.getElementById('playerBlackout');
  if (blackout) blackout.hidden = true;

  const progressFill = document.getElementById('videoProgressFill');
  const progressThumb = document.getElementById('videoProgressThumb');
  const timeCurrent = document.getElementById('videoTimeCurrent');
  const timeTotal = document.getElementById('videoTimeTotal');

  if (progressFill) progressFill.style.width = '0%';
  if (progressThumb) progressThumb.style.insetInlineStart = '0%';
  if (timeCurrent) timeCurrent.textContent = '00:00';
  if (timeTotal) timeTotal.textContent = '00:00';
}

function loadYouTubePlayer(videoId) {
  const container = document.getElementById('ytPlayerContainer');
  container.innerHTML = '';

  if (window.YT && window.YT.Player) {
    createYTPlayer(videoId, container);
    return;
  }

  window.onYouTubeIframeAPIReady = function() {
    createYTPlayer(videoId, container);
  };
}

function createYTPlayer(videoId, container) {
  if (ytPlayer) {
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }

  const playerDiv = document.createElement('div');
  playerDiv.id = 'ytPlayer';
  playerDiv.style.cssText = 'width:100%;height:100%;';
  container.appendChild(playerDiv);

  ytPlayer = new YT.Player('ytPlayer', {
    height: '100%',
    width: '100%',
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      showinfo: 0,
      iv_load_policy: 3,
      fs: 0,
      playsinline: 1,
      disablekb: 1,
      cc_load_policy: 0,
      origin: window.location.origin
    },
    events: {
      onReady: (e) => {
        ytReady = true;
        updateTotalTime(e.target.getDuration());
        e.target.playVideo();
      },
      onStateChange: (e) => {
        handlePlayerStateChange(e.data);
      },
      onError: (e) => {
        console.error('YT error:', e.data);
        Toast.error('خطأ', 'مش قادر أشغّل الفيديو');
      }
    }
  });
}

function handlePlayerStateChange(state) {
  if (state === 1) {
    isPlaying = true;
    updatePlayBtn(true);
    hideBigPlay();
    startProgressTracker();
    showControlsTemporarily();
  } else if (state === 2) {
    isPlaying = false;
    updatePlayBtn(false);
    showControls();
    stopProgressTracker();
  } else if (state === 0) {
    isPlaying = false;
    updatePlayBtn(false);
    stopProgressTracker();
    showBigPlay();
    showControls();

    if (currentPlayingItem) {
      markItemCompleted(currentPlayingItem.id);
      Toast.success('تم ✅', 'تم مشاهدة الدرس');
    }
  }
}

function updatePlayBtn(playing) {
  const btn = document.getElementById('videoPlayBtn');
  if (!btn) return;
  btn.innerHTML = playing
    ? '<i class="fa-solid fa-pause"></i>'
    : '<i class="fa-solid fa-play"></i>';
}

function showBigPlay() {
  const bigPlay = document.getElementById('videoBigPlay');
  if (bigPlay) bigPlay.hidden = false;
}

function hideBigPlay() {
  const bigPlay = document.getElementById('videoBigPlay');
  if (bigPlay) bigPlay.hidden = true;
}

/* ─── إظهار / إخفاء الأزرار ─── */
function showControls() {
  const controls = document.getElementById('playerControls');
  if (controls) controls.classList.add('is-visible');

  if (controlsTimer) clearTimeout(controlsTimer);

  if (isPlaying) {
    controlsTimer = setTimeout(() => hideControls(), 3000);
  }
}

function showControlsTemporarily() {
  showControls();
}

function hideControls() {
  const controls = document.getElementById('playerControls');
  if (controls) controls.classList.remove('is-visible');
}

/* ─── أزرار التحكم ─── */
function togglePlay() {
  if (!ytPlayer || !ytReady || blackoutActive) return;
  if (isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function seekBackward() {
  if (!ytPlayer || !ytReady || blackoutActive) return;
  const current = ytPlayer.getCurrentTime() || 0;
  ytPlayer.seekTo(Math.max(0, current - 10), true);
  showControlsTemporarily();
}

function seekForward() {
  if (!ytPlayer || !ytReady || blackoutActive) return;
  const current = ytPlayer.getCurrentTime() || 0;
  const total = ytPlayer.getDuration() || 0;
  ytPlayer.seekTo(Math.min(total, current + 10), true);
  showControlsTemporarily();
}

function toggleMute() {
  if (!ytPlayer || !ytReady) return;
  if (isMuted) {
    ytPlayer.unMute();
    isMuted = false;
  } else {
    ytPlayer.mute();
    isMuted = true;
  }
  updateMuteBtn();
}

function updateMuteBtn() {
  const btn = document.getElementById('videoMuteBtn');
  if (!btn) return;
  btn.innerHTML = isMuted
    ? '<i class="fa-solid fa-volume-xmark"></i>'
    : '<i class="fa-solid fa-volume-high"></i>';
}

function toggleFullscreen() {
  const modal = document.getElementById('videoPlayerModal');
  const box = modal?.querySelector('.modal__box--player');
  if (!box) return;

  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (box.requestFullscreen) box.requestFullscreen();
    else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

/* ─── شريط التقدم ─── */
function startProgressTracker() {
  stopProgressTracker();
  progressInterval = setInterval(updateProgressUI, 250);
}

function stopProgressTracker() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function updateProgressUI() {
  if (!ytPlayer || !ytReady || isSeeking) return;

  const current = ytPlayer.getCurrentTime() || 0;
  const total = ytPlayer.getDuration() || 0;
  if (!total) return;

  const pct = (current / total) * 100;

  const fill = document.getElementById('videoProgressFill');
  const thumb = document.getElementById('videoProgressThumb');
  const timeCurrent = document.getElementById('videoTimeCurrent');
  const timeTotal = document.getElementById('videoTimeTotal');

  if (fill) fill.style.width = `${pct}%`;
  if (thumb) thumb.style.insetInlineStart = `${pct}%`;
  if (timeCurrent) timeCurrent.textContent = formatTime(current);
  if (timeTotal) timeTotal.textContent = formatTime(total);
}

function updateTotalTime(seconds) {
  const timeTotal = document.getElementById('videoTimeTotal');
  if (timeTotal) timeTotal.textContent = formatTime(seconds || 0);
}

function formatTime(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function seekToPercent(pct) {
  if (!ytPlayer || !ytReady || blackoutActive) return;
  const total = ytPlayer.getDuration() || 0;
  if (!total) return;
  ytPlayer.seekTo((pct / 100) * total, true);
}

/* ═══════════════════════════════════════════════════════════════
   Watermark
   ═══════════════════════════════════════════════════════════════ */
function startVideoWatermark() {
  const wm = document.getElementById('playerWatermark');
  const stage = document.querySelector('.player-stage');
  if (!wm || !stage) return;

  const span = wm.querySelector('span');

  function update() {
    span.textContent = currentProfile.phone || currentProfile.username || '—';

    const maxX = Math.max(20, stage.offsetWidth - 140);
    const maxY = Math.max(20, stage.offsetHeight - 40);
    const x = Math.max(10, Math.floor(Math.random() * maxX));
    const y = Math.max(10, Math.floor(Math.random() * maxY));

    wm.style.left = x + 'px';
    wm.style.top = y + 'px';
    wm.style.opacity = (Math.random() * 0.25 + 0.65).toFixed(2);
  }

  update();
  watermarkTimer = setInterval(update, 5000);
}

function stopVideoWatermark() {
  if (watermarkTimer) {
    clearInterval(watermarkTimer);
    watermarkTimer = null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   🛡️ الحماية
   ═══════════════════════════════════════════════════════════════ */
function setupProtection() {
  document.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('copy', e => {
    if (currentPlayingItem) e.preventDefault();
  });

  document.addEventListener('cut', e => e.preventDefault());

  document.addEventListener('paste', e => {
    if (currentPlayingItem) e.preventDefault();
  });

  document.addEventListener('keydown', handleKeyDown);

  document.addEventListener('dragstart', e => e.preventDefault());

  document.addEventListener('selectstart', e => {
    if (currentPlayingItem) e.preventDefault();
  });
}

function handleKeyDown(e) {
  // Print Screen
  if (e.key === 'PrintScreen' || e.keyCode === 44) {
    e.preventDefault();
    if (currentPlayingItem) triggerBlackout('محاولة تصوير');
    return;
  }

  // Windows + Shift + S
  if (e.metaKey && e.shiftKey && e.key.toUpperCase() === 'S') {
    e.preventDefault();
    if (currentPlayingItem) triggerBlackout('محاولة تصوير');
    return;
  }

  // F12
  if (e.key === 'F12') {
    if (currentPlayingItem) e.preventDefault();
    return;
  }

  // Ctrl + Shift + I / J / C
  if (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key.toUpperCase())) {
    if (currentPlayingItem) e.preventDefault();
    return;
  }

  // Ctrl + U / S / P
  if (e.ctrlKey && ['U','S','P'].includes(e.key.toUpperCase())) {
    if (currentPlayingItem) e.preventDefault();
    return;
  }

  // Space
  if (e.code === 'Space' && currentPlayingItem) {
    e.preventDefault();
    togglePlay();
    return;
  }

  // Escape
  if (e.key === 'Escape') {
    const vModal = document.getElementById('videoPlayerModal');
    const lModal = document.getElementById('linkModal');
    if (vModal && !vModal.hidden) closeVideoPlayer();
    if (lModal && !lModal.hidden) closeLinkModal();
  }
}

function triggerBlackout(reason) {
  if (blackoutActive) return;
  blackoutActive = true;

  if (ytPlayer && ytReady) {
    try { ytPlayer.pauseVideo(); } catch (e) {}
  }

  const blackout = document.getElementById('playerBlackout');
  if (blackout) blackout.hidden = false;

  Toast.warn('⚠️ تحذير', 'ممنوع تصوير المحتوى');

  setTimeout(() => {
    const el = document.getElementById('playerBlackout');
    if (el) el.hidden = true;
    blackoutActive = false;
  }, 2500);
}

/* ─── مراقبة التركيز ─── */
function handleVisibilityChange() {
  if (document.hidden && currentPlayingItem) {
    if (ytPlayer && ytReady) {
      try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    showBlurWarning('خروج من الشاشة');
  }
}

function handleBlur() {
  if (currentPlayingItem && !blackoutActive) {
    if (ytPlayer && ytReady) {
      try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    showBlurWarning('فقدان التركيز');
  }
}

function showBlurWarning(reason) {
  const warning = document.getElementById('cheatWarning');
  const msg = document.getElementById('cheatMsg');
  if (!warning) return;

  if (msg) msg.textContent = reason || 'تم رصد خروجك من الشاشة';
  warning.hidden = false;
}

function hideBlurWarning() {
  const warning = document.getElementById('cheatWarning');
  if (warning) warning.hidden = true;
}

/* ═══════════════════════════════════════════════════════════════
   إغلاق المشغل
   ═══════════════════════════════════════════════════════════════ */
function closeVideoPlayer() {
  const modal = document.getElementById('videoPlayerModal');
  modal.hidden = true;
  document.body.style.overflow = '';

  if (ytPlayer) {
    try { ytPlayer.stopVideo(); } catch (e) {}
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
    ytReady = false;
  }

  document.getElementById('ytPlayerContainer').innerHTML = '';

  stopProgressTracker();
  stopVideoWatermark();

  if (controlsTimer) {
    clearTimeout(controlsTimer);
    controlsTimer = null;
  }

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  currentPlayingItem = null;
  isPlaying = false;
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

  setTimeout(() => markItemCompleted(item.id), 1000);
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
    updateProgressSection();

  } catch (err) {
    console.error('Mark completed error:', err);
  }
}

function updateProgressSection() {
  const totalItems = Object.values(folderItemsMap).reduce((s, arr) => s + arr.length, 0);
  const completedCount = completedItems.size;
  const pct = totalItems ? Math.round((completedCount / totalItems) * 100) : 0;

  document.getElementById('courseProgressPct').textContent = `${pct}%`;
  document.getElementById('courseProgressFill').style.width = `${pct}%`;
  document.getElementById('courseProgressText').textContent = `${completedCount} / ${totalItems} درس`;

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
   الأحداث
   ═══════════════════════════════════════════════════════════════ */
function setupEventListeners() {
  // إغلاق المشغل
  document.getElementById('closeVideoPlayer')?.addEventListener('click', closeVideoPlayer);

  // إغلاق اللينك
  document.getElementById('closeLinkModal')?.addEventListener('click', closeLinkModal);
  document.getElementById('linkModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal__backdrop')) closeLinkModal();
  });

  // أزرار التحكم
  document.getElementById('videoPlayBtn')?.addEventListener('click', togglePlay);
  document.getElementById('videoBigPlay')?.addEventListener('click', togglePlay);
  document.getElementById('videoBackBtn')?.addEventListener('click', seekBackward);
  document.getElementById('videoForwardBtn')?.addEventListener('click', seekForward);
  document.getElementById('videoMuteBtn')?.addEventListener('click', toggleMute);
  document.getElementById('videoFullscreenBtn')?.addEventListener('click', toggleFullscreen);

  // الشيلد (منع اللمس)
  const shield = document.getElementById('playerShield');
  const stage = document.querySelector('.player-stage');

  if (shield) {
    shield.addEventListener('click', (e) => {
      // لو الفيديو واقف
      if (!isPlaying) {
        togglePlay();
        return;
      }

      // لو شغال → نلمس على يمين/يسار
      const rect = stage.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const half = rect.width / 2;

      // RTL: يمين الفيديو = أول الفيديو (رجوع)
      if (x > half) {
        seekBackward();
      } else {
        seekForward();
      }

      showControlsTemporarily();
    });
  }

  // شريط التقدم — النقر والسحب
  const progressBar = document.getElementById('videoProgressBar');
  if (progressBar) {
    let isDragging = false;

    const getPct = (e) => {
      const rect = progressBar.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const pct = ((rect.right - clientX) / rect.width) * 100;
      return Math.max(0, Math.min(100, pct));
    };

    const onStart = (e) => {
      isDragging = true;
      isSeeking = true;
      const pct = getPct(e);
      const fill = document.getElementById('videoProgressFill');
      const thumb = document.getElementById('videoProgressThumb');
      if (fill) fill.style.width = `${pct}%`;
      if (thumb) thumb.style.insetInlineStart = `${pct}%`;
      showControlsTemporarily();
    };

    const onMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const pct = getPct(e);
      const fill = document.getElementById('videoProgressFill');
      const thumb = document.getElementById('videoProgressThumb');
      if (fill) fill.style.width = `${pct}%`;
      if (thumb) thumb.style.insetInlineStart = `${pct}%`;
    };

    const onEnd = (e) => {
      if (!isDragging) return;
      const pct = getPct(e.changedTouches ? { touches: e.changedTouches } : e);
      seekToPercent(pct);
      isDragging = false;
      setTimeout(() => { isSeeking = false; }, 200);
    };

    progressBar.addEventListener('mousedown', onStart);
    progressBar.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }

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

  // التحذير — زر المتابعة
  document.getElementById('resumeBtn')?.addEventListener('click', () => {
    hideBlurWarning();
    if (ytPlayer && ytReady) {
      try { ytPlayer.playVideo(); } catch (e) {}
    }
  });

  // مراقبة التركيز
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleBlur);

  // Fullscreen change
  document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('videoFullscreenBtn');
    if (btn) {
      btn.innerHTML = document.fullscreenElement
        ? '<i class="fa-solid fa-compress"></i>'
        : '<i class="fa-solid fa-expand"></i>';
    }
  });

  // تفعيل الحماية
  setupProtection();
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