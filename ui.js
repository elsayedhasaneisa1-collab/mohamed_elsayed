/* ═══════════════════════════════════════════════════════════════
   ui.js — Modal مخصص (confirm + alert)
   منصة الأستاذ محمد عيسى
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const UI = (() => {

  /* ─────────────── إنشاء Modal ─────────────── */
  function createModal({ type = 'info', title, message, confirmText = 'تأكيد', cancelText = 'إلغاء', showCancel = true }) {
    const overlay = document.createElement('div');
    overlay.className = 'ui-overlay';

    const typeClass = type !== 'info' ? `ui-modal--${type}` : '';
    const iconMap = {
      info: 'fa-circle-info',
      warn: 'fa-triangle-exclamation',
      danger: 'fa-circle-exclamation',
      success: 'fa-circle-check',
      question: 'fa-circle-question'
    };
    const icon = iconMap[type] || iconMap.info;

    overlay.innerHTML = `
      <div class="ui-modal ${typeClass}" role="dialog" aria-modal="true">
        <div class="ui-modal__icon">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="ui-modal__body">
          <div class="ui-modal__title">${escapeHtml(title)}</div>
          ${message ? `<div class="ui-modal__message">${escapeHtml(message)}</div>` : ''}
        </div>
        <div class="ui-modal__actions ${showCancel ? '' : 'ui-modal__actions--single'}">
          ${showCancel ? `
            <button class="ui-modal__btn ui-modal__btn--cancel" data-action="cancel">
              <i class="fa-solid fa-xmark"></i>
              ${escapeHtml(cancelText)}
            </button>
          ` : ''}
          <button class="ui-modal__btn ui-modal__btn--confirm" data-action="confirm">
            <i class="fa-solid fa-check"></i>
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
    });

    return overlay;
  }

  /* ─────────────── إغلاق ─────────────── */
  function closeModal(overlay) {
    if (!overlay) return;
    overlay.classList.remove('is-visible');
    overlay.classList.add('is-closing');
    setTimeout(() => overlay.remove(), 250);
  }

  /* ─────────────── Confirm ─────────────── */
  function confirm({ title = 'تأكيد', message = '', confirmText = 'تأكيد', cancelText = 'إلغاء', type = 'warn' } = {}) {
    return new Promise((resolve) => {
      const overlay = createModal({ type, title, message, confirmText, cancelText, showCancel: true });

      let resolved = false;

      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        document.removeEventListener('keydown', keyHandler);
        closeModal(overlay);
        resolve(result);
      };

      overlay.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        finish(btn.dataset.action === 'confirm');
      });

      const keyHandler = (e) => {
        if (e.key === 'Escape') finish(false);
        else if (e.key === 'Enter') finish(true);
      };
      document.addEventListener('keydown', keyHandler);

      setTimeout(() => {
        overlay.querySelector('[data-action="confirm"]')?.focus();
      }, 100);
    });
  }

  /* ─────────────── Alert ─────────────── */
  function alert({ title = 'تنبيه', message = '', buttonText = 'حسناً', type = 'info' } = {}) {
    return new Promise((resolve) => {
      const overlay = createModal({ type, title, message, confirmText: buttonText, showCancel: false });

      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        document.removeEventListener('keydown', keyHandler);
        closeModal(overlay);
        resolve();
      };

      overlay.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        finish();
      });

      const keyHandler = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') finish();
      };
      document.addEventListener('keydown', keyHandler);

      setTimeout(() => {
        overlay.querySelector('[data-action="confirm"]')?.focus();
      }, 100);
    });
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

  return { confirm, alert };
})();

window.UI = UI;