/* ═══════════════════════════════════════════════════════════════
   حماية الصفحات + الجلسة الواحدة
   منصة الأستاذ محمد عيسى
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/**
 * guardPage()
 * - لو مش مسجل → login
 * - لو الدور مش مناسب → التحويل
 * - جلسة واحدة: لو فيه جهاز تاني نشط → نطرد الأقدم
 *
 * @param {string|null} requiredRole — 'admin' / 'student' / null (أي دور)
 * @returns {Promise<{session, profile}|null>}
 */
async function guardPage(requiredRole = null) {
  try {
    // 1) جلسة؟
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
      sessionStorage.setItem('redirect_after_login', window.location.pathname);
      window.location.href = 'login.html';
      return null;
    }

    // 2) البروفايل
    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error || !profile) {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
      return null;
    }

    // 3) جلسة واحدة
    const sessionOk = await checkSingleSession(session, profile);
    if (!sessionOk) return null;

    // 4) الأدمن
    if (profile.role === 'admin') {
      if (requiredRole && requiredRole !== 'admin') {
        window.location.href = 'admin.html';
        return null;
      }
      return { session, profile };
    }

    // 5) الطالب
    if (profile.role === 'student') {
      // مش مفعّل
      if (!profile.is_active) {
        await supabaseClient.auth.signOut();
        sessionStorage.setItem('pending_account', '1');
        window.location.href = 'login.html';
        return null;
      }

      // لو الصفحة للأدمن بس
      if (requiredRole === 'admin') {
        window.location.href = 'index.html';
        return null;
      }

      return { session, profile };
    }

    // دور غير معروف
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
    return null;

  } catch (err) {
    console.error('Guard error:', err);
    window.location.href = 'login.html';
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   الجلسة الواحدة
   ═══════════════════════════════════════════════════════════════ */
async function checkSingleSession(session, profile) {
  try {
    // توكن الجلسة الحالية (نستخدمه كمفتاح)
    const token = session.access_token.slice(-40); // آخر 40 حرف

    // 1) نشوف فيه جلسة نشطة للمستخدم ده
    const { data: sessions } = await supabaseClient
      .from('sessions')
      .select('*')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .order('last_active', { ascending: false });

    const existing = sessions?.[0];

    // 2) لو مفيش جلسة → نسجل الجديدة
    if (!existing) {
      await supabaseClient.from('sessions').insert({
        user_id: profile.id,
        session_token: token,
        device_info: navigator.userAgent.slice(0, 200),
        is_active: true
      });
      sessionStorage.setItem('session_token', token);
      return true;
    }

    // 3) لو نفس التوكن → نحدّث last_active
    if (existing.session_token === token) {
      await supabaseClient
        .from('sessions')
        .update({ last_active: new Date().toISOString() })
        .eq('id', existing.id);
      sessionStorage.setItem('session_token', token);
      return true;
    }

    // 4) لو توكن مختلف → نطرد الجلسة القديمة
    // (المستخدم الجديد هو اللي بيدخل، فالقديم يتقفل)
    await supabaseClient
      .from('sessions')
      .update({ is_active: false })
      .eq('user_id', profile.id);

    // نسجل الجلسة الجديدة
    await supabaseClient.from('sessions').insert({
      user_id: profile.id,
      session_token: token,
      device_info: navigator.userAgent.slice(0, 200),
      is_active: true
    });

    sessionStorage.setItem('session_token', token);
    return true;

  } catch (err) {
    console.error('Session check error:', err);
    // لو حصل خطأ، نسيبه يكمل (ما نمنعوش)
    return true;
  }
}

/* ═══════════════════════════════════════════════════════════════
   تصدير
   ═══════════════════════════════════════════════════════════════ */
window.guardPage = guardPage;