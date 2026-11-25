import { element as el, icon, link, message } from './userManagementUi.js';
export function createUserPublicGroupsPanel(doc, data, copy) {
  const root = el(doc, 'section', 'sfoc-um-public-groups');
  root.append(el(doc, 'h3', 'sfoc-um-section-title', copy.groupsIntro));
  const toolbar = el(doc, 'div', 'sfoc-um-toolbar');
  const filter = el(doc, 'input', 'sfoc-um-input'); filter.type = 'search'; filter.placeholder = copy.search; filter.setAttribute('aria-label', copy.publicGroups + ': ' + copy.search);
  const count = el(doc, 'span', 'sfoc-um-count'); const list = el(doc, 'div', 'sfoc-um-public-list');
  toolbar.append(filter, count); root.append(toolbar);
  if (data.partial) root.append(message(doc, copy.partialData, 'warning'));
  root.append(list, el(doc, 'p', 'sfoc-um-hint', copy.groupsScope));
  const render = () => {
    const groups = data.groups.filter((g) => (g.label + ' ' + g.developerName).toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()));
    count.textContent = groups.length + ' / ' + data.groups.length; list.replaceChildren();
    for (const group of groups) {
      const details = el(doc, 'details', 'sfoc-um-public-row');
      const summary = el(doc, 'summary'); const title = el(doc, 'span', 'sfoc-um-permission-text');
      title.append(el(doc, 'strong', '', group.label), el(doc, 'small', 'sfoc-um-muted', group.developerName));
      summary.append(icon(doc, 'group'), title, el(doc, 'span', 'sfoc-um-count', String(group.reasons.length)), icon(doc, 'chevron'));
      const paths = el(doc, 'div', 'sfoc-um-paths');
      for (const reason of group.reasons) {
        const line = el(doc, 'div', 'sfoc-um-membership');
        line.append(el(doc, 'strong', '', reason.kind === 'direct' ? copy.directMember : reason.kind === 'role' ? copy.roleMember : copy.nestedMember),
          el(doc, 'p', '', reason.path.map((p) => p.type === 'User' ? copy.user : p.label || p.id).join(' → ')));
        paths.append(line);
      }
      const a = link(doc, copy.open + ': ' + group.label, '/lightning/setup/PublicGroups/page?address=' + encodeURIComponent('/' + group.id));
      a.append(doc.createTextNode(copy.open)); paths.append(a); details.append(summary, paths); list.append(details);
    }
    if (!groups.length) list.append(el(doc, 'p', 'sfoc-um-empty', copy.emptyGroups));
  };
  filter.addEventListener('input', render); render();
  return { element: root };
}
