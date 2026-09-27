/* ═══════════════════════════════════════════════════════════════
   guard.js — حماية الصفحات
   منصة الأستاذ محمد عيسى
   ═══════════════════════════════════════════════════════════════ */

'use strict';

async function guardPage(requiredRole = null) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
      window.location.href = 'login.html';
      return null;
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!profile) {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
      return null;
    }

    // ═══════════════ الأدمن ═══════════════
    if (profile.role === 'admin') {
      if (requiredRole === 'student') {
        window.location.href = 'admin.html';
        return null;
      }
      return { session, profile };
    }

    // ═══════════════ المدرس ═══════════════
    if (profile.role === 'teacher') {
      if (!profile.is_active) {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return null;
      }
      if (requiredRole === 'student') {
        window.location.href = 'admin.html';
        return null;
      }
      return { session, profile };
    }

    // ═══════════════ الطالب ═══════════════
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
    window.location.href = 'login.html';
    return null;
  }
}

window.guardPage = guardPage;