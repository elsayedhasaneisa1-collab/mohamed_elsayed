/* ═══════════════════════════════════════════════════════════════
   حماية الصفحات + الجلسة الواحدة
   منصة الأستاذ محمد عيسى
   ═══════════════════════════════════════════════════════════════ */

'use strict';

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

    // 3) جلسة واحدة (بس لو الجدول شغال)
    //try {
      //await checkSingleSession(session, profile);
//    } catch (e) {
  //    console.warn('Session check //skipped:', e.message);
//    }

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
      if (!profile.is_active) {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return null;
      }

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
    // ⚠️ مهم: ما نطردش المستخدم لو حصل خطأ في الجلسة
    // بس نسيبه يكمل لو عنده session
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile) return { session, profile };
    }

    window.location.href = 'login.html';
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   الجلسة الواحدة
   ═══════════════════════════════════════════════════════════════ */
async function checkSingleSession(session, profile) {
  const token = session.access_token.slice(-40);

  // 1) نجيب الجلسات النشطة
  const { data: sessions, error } = await supabaseClient
    .from('sessions')
    .select('id, session_token, last_active')
    .eq('user_id', profile.id)
    .eq('is_active', true)
    .order('last_active', { ascending: false })
    .limit(1);

  if (error) throw error;

  const existing = sessions?.[0];

  // 2) مفيش جلسة → نسجل جديدة
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

  // 3) نفس التوكن → نحدّث last_active
  if (existing.session_token === token) {
    await supabaseClient
      .from('sessions')
      .update({ last_active: new Date().toISOString() })
      .eq('id', existing.id);
    sessionStorage.setItem('session_token', token);
    return true;
  }

  // 4) توكن مختلف → نقفل الجلسات القديمة
  await supabaseClient
    .from('sessions')
    .update({ is_active: false })
    .eq('user_id', profile.id)
    .eq('is_active', true);

  // نسجل الجلسة الجديدة
  await supabaseClient.from('sessions').insert({
    user_id: profile.id,
    session_token: token,
    device_info: navigator.userAgent.slice(0, 200),
    is_active: true
  });

  sessionStorage.setItem('session_token', token);
  return true;
}

window.guardPage = guardPage;