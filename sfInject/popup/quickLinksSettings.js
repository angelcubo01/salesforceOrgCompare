import { listAllNavTools } from '../../code/ui/appModeNav.js';
import { QUICK_LINK_ICONS, TOOL_ICONS, createIcon } from '../../code/workbench/iconRegistry.js';
import { openSfocModal } from '../../code/ui/sfocModal.js';
import { bootstrapFeatureControls } from '../../shared/posthogFeatureControlsFlag.js';
import {
  SF_INJECT_GLOBAL_QUICK_LINKS_KEY,
  loadSfInjectSettings,
  saveSfInjectSettings
} from '../lib/settings.js';

function makeId() {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `quick-link-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function orgLabel(org) {
  return String(org?.label || org?.displayName || org?.instanceUrl || org?.id || '');
}

function button(label, className = 'settings-secondary') {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = className;
  item.textContent = label;
  return item;
}

function compactButton(label, title) {
  const item = button(label, 'settings-quick-links-icon-btn');
  item.setAttribute('aria-label', title);
  item.title = title;
  return item;
}

function field(label, control) {
  const wrap = document.createElement('label');
  wrap.className = 'settings-quick-links-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  wrap.append(caption, control);
  return wrap;
}

const QUICK_LINK_COLORS = [
  '#0b5cab', '#2e844a', '#a96404', '#ba0517', '#5a3ea6', '#0f766e', '#7f8da1'
];

function openQuickLinkAppearancePopover(anchor, link, translate, onApply) {
  document.querySelector('.settings-quick-links-appearance-popover')?.remove();
  const popover = document.createElement('section');
  popover.className = 'settings-quick-links-appearance-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', translate('settings.sfInjectQuickLinksAppearanceTitle'));
  const iconTitle = document.createElement('p');
  iconTitle.className = 'settings-quick-links-appearance-label';
  iconTitle.textContent = translate('settings.sfInjectQuickLinksIcon');
  const iconTable = document.createElement('table');
  iconTable.className = 'settings-quick-links-appearance-table';
  const iconBody = document.createElement('tbody');
  for (let index = 0; index < QUICK_LINK_ICONS.length; index += 4) {
    const row = document.createElement('tr');
    for (const iconName of QUICK_LINK_ICONS.slice(index, index + 4)) {
      const cell = document.createElement('td');
      const choice = compactButton('', iconName);
      choice.classList.add('settings-quick-links-appearance-choice');
      choice.setAttribute('aria-pressed', String(iconName === link.icon));
      choice.appendChild(createIcon(iconName, { size: 18 }));
      choice.addEventListener('click', () => {
        link.icon = iconName;
        iconTable.querySelectorAll('button').forEach((buttonEl) => {
          buttonEl.setAttribute('aria-pressed', String(buttonEl === choice));
        });
        onApply();
      });
      cell.appendChild(choice);
      row.appendChild(cell);
    }
    iconBody.appendChild(row);
  }
  iconTable.appendChild(iconBody);
  const colorTitle = document.createElement('p');
  colorTitle.className = 'settings-quick-links-appearance-label';
  colorTitle.textContent = translate('settings.sfInjectQuickLinksColor');
  const colorTable = document.createElement('table');
  colorTable.className = 'settings-quick-links-appearance-table';
  const colorBody = document.createElement('tbody');
  for (let index = 0; index < QUICK_LINK_COLORS.length; index += 4) {
    const row = document.createElement('tr');
    for (const color of QUICK_LINK_COLORS.slice(index, index + 4)) {
      const cell = document.createElement('td');
      const choice = compactButton('', color);
      choice.classList.add('settings-quick-links-appearance-choice', 'settings-quick-links-color-choice');
      choice.style.setProperty('--quick-link-color', color);
      choice.setAttribute('aria-pressed', String(color === link.color));
      choice.addEventListener('click', () => {
        link.color = color;
        colorTable.querySelectorAll('button').forEach((buttonEl) => {
          buttonEl.setAttribute('aria-pressed', String(buttonEl === choice));
        });
        onApply();
      });
      cell.appendChild(choice);
      row.appendChild(cell);
    }
    colorBody.appendChild(row);
  }
  colorTable.appendChild(colorBody);
  popover.append(iconTitle, iconTable, colorTitle, colorTable);
  const rect = anchor.getBoundingClientRect();
  popover.style.top = `${Math.max(12, rect.top - 8)}px`;
  popover.style.left = `${Math.max(12, rect.left - 320)}px`;
  document.body.appendChild(popover);
  let closeTimer = null;
  const close = () => {
    if (!popover.isConnected) return;
    popover.remove();
  };
  const scheduleClose = () => {
    closeTimer = setTimeout(close, 130);
  };
  anchor.addEventListener('pointerleave', scheduleClose, { once: true });
  popover.addEventListener('pointerenter', () => {
    if (closeTimer) clearTimeout(closeTimer);
  });
  popover.addEventListener('pointerleave', close, { once: true });
}

function createToolPicker(tools, selectedToolId, usedToolIds, onPick, translate) {
  // La herramienta del enlace que se está editando se mantiene disponible; las
  // demás ya usadas en este entorno no pueden seleccionarse de nuevo.
  const availableTools = tools.filter((item) => (
    item.tool === selectedToolId || !usedToolIds.has(item.tool)
  ));
  const selected = availableTools.find((item) => item.tool === selectedToolId) || availableTools[0];
  const picker = document.createElement('div');
  picker.className = 'settings-quick-links-tool-picker';
  const trigger = button('', 'settings-quick-links-tool-trigger');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  if (selected) {
    trigger.append(createIcon(TOOL_ICONS[selected.tool] || 'link', { size: 16 }));
    const label = document.createElement('span');
    label.textContent = selected.label;
    trigger.appendChild(label);
  } else {
    trigger.textContent = translate('settings.sfInjectQuickLinksNoTools');
    trigger.disabled = true;
  }
  const menu = document.createElement('div');
  menu.className = 'settings-quick-links-tool-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  let removeOutsideListener = null;
  const closeMenu = () => {
    if (menu.parentElement === document.body) picker.appendChild(menu);
    menu.hidden = true;
    menu.classList.remove('is-portaled');
    trigger.setAttribute('aria-expanded', 'false');
    removeOutsideListener?.();
    removeOutsideListener = null;
  };
  const openMenu = () => {
    document.querySelectorAll('.settings-quick-links-tool-menu.is-portaled').forEach((node) => node.remove());
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${Math.min(window.innerHeight - 272, rect.bottom + 4)}px`;
    menu.style.width = `${Math.max(rect.width, 300)}px`;
    document.body.appendChild(menu);
    menu.hidden = false;
    menu.classList.add('is-portaled');
    trigger.setAttribute('aria-expanded', 'true');
    const onPointerDown = (event) => {
      if (!menu.contains(event.target) && event.target !== trigger) closeMenu();
    };
    setTimeout(() => document.addEventListener('pointerdown', onPointerDown, true), 0);
    removeOutsideListener = () => document.removeEventListener('pointerdown', onPointerDown, true);
  };
  const appendGroup = (title, items) => {
    if (!items.length) return;
    const heading = document.createElement('p');
    heading.className = 'settings-quick-links-tool-group-title';
    heading.textContent = title;
    menu.appendChild(heading);
    for (const item of items) {
      const option = button('', 'settings-quick-links-tool-option');
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(item.tool === selected?.tool));
      option.append(createIcon(TOOL_ICONS[item.tool] || 'link', { size: 16 }));
      const label = document.createElement('span');
      label.textContent = item.label;
      option.appendChild(label);
      option.addEventListener('click', () => {
        closeMenu();
        onPick(item);
      });
      menu.appendChild(option);
    }
  };
  const modeLabels = {
    comparator: 'code.appModeComparator',
    development: 'code.appModeDevelopment',
    analysis: 'code.appModeAnalysis',
    monitoring: 'code.appModeMonitoring',
    manifests: 'code.appModeManifests'
  };
  for (const [mode, labelKey] of Object.entries(modeLabels)) {
    appendGroup(translate(labelKey), availableTools.filter((item) => item.mode === mode));
  }
  trigger.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  picker.append(trigger, menu);
  return picker;
}

function createQuickLinkAddMenu(translate, { onTool, onCustom, canAddTool = true }) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-quick-links-add-menu';
  const trigger = button(`${translate('settings.sfInjectQuickLinksAdd')} ▾`, 'settings-primary-action');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'settings-quick-links-add-menu-popover';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  const show = () => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  };
  const hide = () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const addOption = (label, action, disabled = false) => {
    const option = button(label, 'settings-quick-links-add-menu-option');
    option.setAttribute('role', 'menuitem');
    option.disabled = disabled;
    if (disabled) option.title = translate('settings.sfInjectQuickLinksNoTools');
    option.addEventListener('click', () => {
      if (disabled) return;
      hide();
      action();
    });
    menu.appendChild(option);
  };
  addOption(translate('settings.sfInjectQuickLinksAddTool'), onTool, !canAddTool);
  addOption(translate('settings.sfInjectQuickLinksAddCustom'), onCustom);
  wrap.addEventListener('pointerenter', show);
  wrap.addEventListener('pointerleave', hide);
  trigger.addEventListener('focus', show);
  wrap.addEventListener('focusout', (event) => {
    if (!wrap.contains(event.relatedTarget)) hide();
  });
  wrap.append(trigger, menu);
  return wrap;
}

async function loadSavedOrgs() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'listSavedOrgs' });
    return res?.ok && Array.isArray(res.orgs) ? res.orgs : [];
  } catch {
    return [];
  }
}

/**
 * @param {(key: string, vars?: Record<string, unknown>) => string} translate
 * @param {{ orgId?: string }} [opts]
 */
export async function openQuickLinksSettingsModal(translate, opts = {}) {
  const [cfg, orgs] = await Promise.all([
    loadSfInjectSettings(),
    loadSavedOrgs(),
    bootstrapFeatureControls()
  ]);
  const toolCatalog = listAllNavTools().filter((item) => TOOL_ICONS[item.tool]);
  const draft = structuredClone(cfg.quickLinks || {});
  let selectedOrgId = orgs.some((org) => org.id === opts.orgId)
    ? opts.orgId
    : SF_INJECT_GLOBAL_QUICK_LINKS_KEY;
  let expandedLinkId = '';
  let applyAllNotice = '';
  let draggedLinkId = '';
  const body = document.createElement('div');
  body.className = 'settings-quick-links-modal';

  const labelForTool = (toolId) => toolCatalog.find((item) => item.tool === toolId)?.label || toolId;
  const linksForSelectedScope = () => {
    if (!selectedOrgId) return [];
    if (!Array.isArray(draft[selectedOrgId])) draft[selectedOrgId] = [];
    return draft[selectedOrgId];
  };

  const applyGlobalLinksToAll = () => {
    const globalLinks = Array.isArray(draft[SF_INJECT_GLOBAL_QUICK_LINKS_KEY])
      ? draft[SF_INJECT_GLOBAL_QUICK_LINKS_KEY]
      : [];
    let added = 0;
    for (const org of orgs) {
      if (!Array.isArray(draft[org.id])) draft[org.id] = [];
      const target = draft[org.id];
      const ids = new Set(target.map((link) => link.id));
      const sfocToolIds = new Set(target
        .filter((link) => link.type === 'sfoc' && link.toolId)
        .map((link) => link.toolId));
      for (const link of globalLinks) {
        if (ids.has(link.id) || (link.type === 'sfoc' && sfocToolIds.has(link.toolId))) continue;
        target.push(structuredClone(link));
        ids.add(link.id);
        if (link.type === 'sfoc' && link.toolId) sfocToolIds.add(link.toolId);
        added += 1;
      }
    }
    applyAllNotice = added
      ? translate('settings.sfInjectQuickLinksAppliedToAll')
      : translate('settings.sfInjectQuickLinksAlreadyApplied');
  };

  const renderLinkConfig = (link, updatePreview) => {
    const config = document.createElement('div');
    config.className = 'settings-quick-links-card-config';

    if (link.type === 'custom') {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = link.label || '';
      nameInput.maxLength = 100;
      nameInput.addEventListener('input', () => {
        link.label = nameInput.value;
        updatePreview();
      });
      const nameField = field(translate('settings.sfInjectQuickLinksName'), nameInput);
      nameField.classList.add('settings-quick-links-name-field');
      const appearance = compactButton('', translate('settings.sfInjectQuickLinksAppearanceTitle'));
      appearance.classList.add('settings-quick-links-appearance-trigger');
      const updateAppearance = () => {
        appearance.style.color = link.color || '#0b5cab';
        appearance.replaceChildren(createIcon(link.icon || 'link', { size: 18 }));
      };
      updateAppearance();
      const openAppearance = () => {
        if (document.querySelector('.settings-quick-links-appearance-popover')) return;
        openQuickLinkAppearancePopover(appearance, link, translate, () => {
          updateAppearance();
          updatePreview();
        });
      };
      appearance.addEventListener('click', openAppearance);
      appearance.addEventListener('pointerenter', openAppearance);
      const nameRow = document.createElement('div');
      nameRow.className = 'settings-quick-links-name-row';
      nameRow.append(appearance, nameField);
      config.appendChild(nameRow);
    }

    if (link.type === 'sfoc') {
      const usedToolIds = new Set(linksForSelectedScope()
        .filter((item) => item.id !== link.id && item.type === 'sfoc' && item.toolId)
        .map((item) => item.toolId));
      const toolPicker = createToolPicker(toolCatalog, link.toolId, usedToolIds, (tool) => {
        link.toolId = tool.tool;
        link.icon = TOOL_ICONS[link.toolId] || 'link';
        link.label = tool.label;
        updatePreview();
        render();
      }, translate);
      const toolField = field(translate('settings.sfInjectQuickLinksTool'), toolPicker);
      toolField.classList.add('settings-quick-links-tool-field');
      config.appendChild(toolField);
    } else {
      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.inputMode = 'url';
      urlInput.value = link.url || '';
      urlInput.maxLength = 2048;
      urlInput.placeholder = '/lightning/o/Account/list';
      urlInput.title = translate('settings.sfInjectQuickLinksRelativeUrlHint');
      urlInput.addEventListener('input', () => { link.url = urlInput.value.trim(); });
      const urlField = field(translate('settings.sfInjectQuickLinksUrl'), urlInput);
      urlField.classList.add('settings-quick-links-url-field');
      config.appendChild(urlField);

    }
    return config;
  };

  const render = () => {
    body.replaceChildren();
    const orgField = document.createElement('div');
    orgField.className = 'settings-quick-links-org-field';
    const orgSelect = document.createElement('select');
    orgSelect.appendChild(
      new Option(translate('settings.sfInjectQuickLinksGlobal'), SF_INJECT_GLOBAL_QUICK_LINKS_KEY)
    );
    for (const org of orgs) orgSelect.appendChild(new Option(orgLabel(org), org.id));
    orgSelect.value = selectedOrgId;
    orgSelect.addEventListener('change', () => {
      selectedOrgId = orgSelect.value;
      expandedLinkId = '';
      render();
    });
    orgField.appendChild(orgSelect);

    const scopeLinks = linksForSelectedScope();
    const usedSfocToolIds = new Set(scopeLinks
      .filter((link) => link.type === 'sfoc' && link.toolId)
      .map((link) => link.toolId));
    const addMenu = createQuickLinkAddMenu(translate, {
      onTool: () => {
        const tool = toolCatalog.find((item) => !usedSfocToolIds.has(item.tool));
        if (!tool) return;
        const toolId = tool.tool;
        const id = makeId();
        linksForSelectedScope().push({
        id, type: 'sfoc', label: tool.label, toolId,
        url: '', icon: TOOL_ICONS[toolId] || 'link', color: '#0b5cab'
      });
        expandedLinkId = id;
      render();
      },
      onCustom: () => {
        const id = makeId();
        linksForSelectedScope().push({
        id, type: 'custom', label: translate('settings.sfInjectQuickLinksNewCustom'), toolId: '',
        url: '', icon: 'link', color: '#0b5cab'
      });
        expandedLinkId = id;
      render();
      },
      canAddTool: toolCatalog.some((tool) => !usedSfocToolIds.has(tool.tool))
    });
    const orgBar = document.createElement('div');
    orgBar.className = 'settings-quick-links-org-bar';
    if (selectedOrgId === SF_INJECT_GLOBAL_QUICK_LINKS_KEY) {
      const applyAll = button(
        translate('settings.sfInjectQuickLinksApplyAll'),
        'settings-primary-action settings-quick-links-apply-all'
      );
      applyAll.disabled = linksForSelectedScope().length === 0 || orgs.length === 0;
      applyAll.title = translate('settings.sfInjectQuickLinksApplyAllHint');
      applyAll.addEventListener('click', () => {
        applyGlobalLinksToAll();
        render();
      });
      orgBar.append(orgField, applyAll, addMenu);
    } else {
      orgBar.append(orgField, addMenu);
    }
    body.appendChild(orgBar);

    if (selectedOrgId === SF_INJECT_GLOBAL_QUICK_LINKS_KEY && applyAllNotice) {
      const notice = document.createElement('p');
      notice.className = 'settings-hint settings-hint--nomargin';
      notice.textContent = applyAllNotice;
      body.appendChild(notice);
    }

    const list = document.createElement('div');
    list.className = 'settings-quick-links-list';
    const links = linksForSelectedScope();
    if (!links.length) {
      const empty = document.createElement('p');
      empty.className = 'settings-hint settings-hint--nomargin';
      empty.textContent = selectedOrgId === SF_INJECT_GLOBAL_QUICK_LINKS_KEY
        ? translate('settings.sfInjectQuickLinksGlobalEmpty')
        : translate('settings.sfInjectQuickLinksEmpty');
      list.appendChild(empty);
    }
    links.forEach((link, index) => {
      const card = document.createElement('article');
      card.className = 'settings-quick-links-card';
      card.addEventListener('dragover', (event) => {
        if (!draggedLinkId || draggedLinkId === link.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        card.classList.add('is-drag-over');
      });
      card.addEventListener('dragleave', (event) => {
        if (!card.contains(/** @type {Node} */ (event.relatedTarget))) {
          card.classList.remove('is-drag-over');
        }
      });
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        card.classList.remove('is-drag-over');
        const fromIndex = links.findIndex((item) => item.id === draggedLinkId);
        if (fromIndex < 0 || fromIndex === index) return;
        const [moved] = links.splice(fromIndex, 1);
        const targetIndex = links.findIndex((item) => item.id === link.id);
        links.splice(targetIndex, 0, moved);
        draggedLinkId = '';
        render();
      });
      const header = document.createElement('div');
      header.className = 'settings-quick-links-card-header';
      const dragHandle = document.createElement('span');
      dragHandle.className = 'settings-quick-links-drag-handle';
      dragHandle.textContent = '⋮⋮';
      dragHandle.draggable = true;
      dragHandle.setAttribute('role', 'img');
      dragHandle.setAttribute('aria-label', translate('settings.sfInjectQuickLinksDrag'));
      dragHandle.title = translate('settings.sfInjectQuickLinksDrag');
      dragHandle.addEventListener('dragstart', (event) => {
        draggedLinkId = link.id;
        card.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', link.id);
      });
      dragHandle.addEventListener('dragend', () => {
        draggedLinkId = '';
        card.classList.remove('is-dragging');
        list.querySelectorAll('.is-drag-over').forEach((item) => item.classList.remove('is-drag-over'));
      });
      const icon = document.createElement('span');
      icon.className = 'settings-quick-links-card-icon';
      const title = document.createElement('strong');
      const updatePreview = () => {
        icon.style.color = link.color || '#0b5cab';
        icon.replaceChildren(createIcon(link.type === 'sfoc' ? (TOOL_ICONS[link.toolId] || 'link') : link.icon, { size: 16 }));
        title.textContent = link.type === 'sfoc'
          ? labelForTool(link.toolId)
          : (link.label || translate('settings.sfInjectQuickLinksNewCustom'));
      };
      updatePreview();
      const kind = document.createElement('span');
      kind.className = 'settings-quick-links-card-kind';
      kind.textContent = link.type === 'sfoc'
        ? translate('settings.sfInjectQuickLinksTypeSfoc')
        : translate('settings.sfInjectQuickLinksTypeCustom');
      const actions = document.createElement('div');
      actions.className = 'settings-quick-links-card-actions';
      const up = compactButton('↑', translate('settings.sfInjectQuickLinksMoveUp'));
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        [links[index - 1], links[index]] = [links[index], links[index - 1]];
        render();
      });
      const down = compactButton('↓', translate('settings.sfInjectQuickLinksMoveDown'));
      down.disabled = index === links.length - 1;
      down.addEventListener('click', () => {
        [links[index], links[index + 1]] = [links[index + 1], links[index]];
        render();
      });
      const configure = compactButton('⚙', translate('settings.sfInjectQuickLinksConfigureItem'));
      configure.addEventListener('click', () => {
        expandedLinkId = expandedLinkId === link.id ? '' : link.id;
        render();
      });
      const remove = compactButton('×', translate('settings.sfInjectQuickLinksRemove'));
      remove.classList.add('settings-quick-links-icon-btn--danger');
      remove.addEventListener('click', () => {
        links.splice(index, 1);
        if (expandedLinkId === link.id) expandedLinkId = '';
        render();
      });
      actions.append(up, down, configure, remove);
      header.append(dragHandle, icon, title, kind, actions);
      card.appendChild(header);
      if (expandedLinkId === link.id) card.appendChild(renderLinkConfig(link, updatePreview));
      list.appendChild(card);
    });
    body.appendChild(list);
  };

  render();
  openSfocModal({
    id: 'settingsSfInjectQuickLinksModal',
    title: translate('settings.sfInjectQuickLinksConfigureTitle'),
    body,
    confirmLabel: translate('settings.sfInjectQuickLinksSave'),
    cancelLabel: translate('common.cancel'),
    variant: 'form',
    onConfirm: async () => {
      // Configurar enlaces deja la integración lista para usarse. Si el entorno
      // seleccionado no tiene enlaces, el content script no inyecta ningún botón.
      await saveSfInjectSettings({
        enabled: true,
        integrations: { quickLinks: true },
        quickLinks: draft
      });
    }
  });
}
