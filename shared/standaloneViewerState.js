/** Renderiza un estado técnico compacto sin depender del DOM de la aplicación principal. */
export function renderStandaloneViewerState(host, {
  kind = 'error',
  title = '',
  description = ''
} = {}) {
  if (!host) return null;
  host.replaceChildren();
  const state = document.createElement('section');
  state.className = `sfoc-standalone-state sfoc-standalone-state--${kind}`;
  state.setAttribute('role', kind === 'error' ? 'alert' : 'status');

  const icon = document.createElement('span');
  icon.className = 'sfoc-standalone-state-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = kind === 'error' ? '!' : 'i';

  const heading = document.createElement('h2');
  heading.textContent = String(title || '');
  const copy = document.createElement('p');
  copy.textContent = String(description || '');
  state.append(icon, heading, copy);
  host.appendChild(state);
  return state;
}
