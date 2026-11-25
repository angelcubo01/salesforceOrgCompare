import { element as el, button, loading } from './userManagementUi.js';
export function openUserLoginMenu(doc, { trigger, user, orgId, bridge, copy, onMessage }) {
  const menu = el(doc, 'div', 'sfoc-um-login-menu');
  menu.dataset.sfocUserOverlay = 'login'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', copy.loginAs); menu.tabIndex = -1;
  let closed = false; let busy = false;
  trigger.setAttribute('aria-expanded', 'true');
  const close = (restore = true) => {
    if (closed) return; closed = true;
    doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('pointerdown', outside, true);
    menu.remove(); trigger.setAttribute('aria-expanded', 'false');
    if (restore && trigger.isConnected) trigger.focus();
  };
  const outside = (e) => { if (!menu.contains(e.target) && !trigger.contains(e.target)) close(false); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === 'Tab') { close(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
    const n = buttons.indexOf(doc.activeElement); const index = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (n + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
    buttons[index]?.focus();
  };
  const targets = [['currentTab', copy.loginCurrent], ['newTab', copy.loginNew], ['incognito', copy.loginIncognito]];
  menu.append(loading(doc, copy));
  // El diálogo de la paleta usa transform. Un elemento fixed dentro de él se
  // posicionaría respecto al diálogo, no respecto al viewport, y acabaría lejos
  // del botón que lo abrió. Se monta directamente en body para anclarlo al botón.
  doc.body.append(menu);
  const rect = trigger.getBoundingClientRect();
  const width = 290; const gap = 5;
  menu.style.left = Math.max(8, Math.min(rect.left, doc.documentElement.clientWidth - width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(rect.bottom + gap, doc.documentElement.clientHeight - 180)) + 'px';
  doc.addEventListener('keydown', onKey, true); doc.addEventListener('pointerdown', outside, true); menu.focus();
  void bridge.loginAvailability(orgId, user.id).then((availability) => {
    if (closed) return; menu.replaceChildren();
    for (const [target, label] of targets) {
      const b = button(doc, label, target === 'incognito' ? 'shield' : 'key', async () => {
        if (busy) return; busy = true;
        menu.querySelectorAll('button').forEach((node) => { node.disabled = true; });
        const res = await bridge.loginAs(orgId, user.id, target);
        if (closed) return;
        onMessage?.(res?.ok ? (res.authenticationMayBeRequired ? copy.incognitoAuth : copy.loginOpened) : (copy.errors[res?.reason] || copy.errors.API_ERROR), res?.ok ? 'info' : 'error');
        close();
      });
      b.setAttribute('role', 'menuitem');
      const reason = !user.isActive ? 'USER_INACTIVE' : !availability?.ok ? availability?.reason || 'API_ERROR' : target === 'incognito' && !availability.incognito ? 'INCOGNITO_NOT_ENABLED' : '';
      b.disabled = !!reason;
      b.title = reason ? copy.errors[reason] || copy.errors.API_ERROR : target === 'incognito' ? copy.incognitoAuth : label;
      menu.append(b);
    }
    menu.querySelector('button:not(:disabled)')?.focus();
  });
  return { close };
}
