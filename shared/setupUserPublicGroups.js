import { restQuery, restSoqlQueryPage } from './salesforceApi.js';
import { requireSetupId } from './setupPaletteUsersApi.js';

const key = (id) => String(id || '').slice(0, 15);
const MAX_NODES = 5000;
const MAX_DEPTH = 20;

/** Enumerate simple paths, not just visited nodes: two membership causes survive. */
export function explainPublicGroupPaths(userId, seeds, edges, groups) {
  const parents = new Map();
  for (const edge of edges) {
    const from = key(edge.UserOrGroupId);
    if (!parents.has(from)) parents.set(from, new Set());
    parents.get(from).add(key(edge.GroupId));
  }
  const groupMap = new Map(groups.map((g) => [key(g.Id), g]));
  const result = new Map();
  const queue = [{ ids: [key(userId)], kind: 'direct' }, ...seeds.map((seed) => ({ ids: [key(seed.Id)], kind: 'role' }))];
  let partial = false; let steps = 0;
  while (queue.length && steps++ < 20000) {
    const path = queue.shift();
    if (path.ids.length > MAX_DEPTH) { partial = true; continue; }
    for (const parent of parents.get(path.ids.at(-1)) || []) {
      if (path.ids.includes(parent)) continue;
      const next = [...path.ids, parent]; const group = groupMap.get(parent);
      if (group?.Type === 'Regular') {
        if (!result.has(parent)) result.set(parent, { id: group.Id, label: group.Name, developerName: group.DeveloperName || '', reasons: [] });
        const item = result.get(parent);
        if (!item.reasons.some((r) => r.path.map((p) => key(p.id)).join('/') === next.join('/'))) {
          if (item.reasons.length >= 20) partial = true;
          else item.reasons.push({ kind: path.kind === 'role' ? 'role' : next.length === 2 ? 'direct' : 'nested', path: next.map((id) => ({ id, label: groupMap.get(id)?.Name || '', type: groupMap.get(id)?.Type || 'User' })) });
        }
      }
      queue.push({ ids: next, kind: path.kind });
    }
  }
  if (queue.length) partial = true;
  return { groups: [...result.values()].sort((a, b) => a.label.localeCompare(b.label)), partial };
}

async function boundedQuery(instance, sid, version, soql) {
  const records = []; let next = soql;
  while (next && records.length < MAX_NODES) {
    const page = await restSoqlQueryPage(instance, sid, version, next);
    records.push(...page.records);
    next = page.nextPath;
  }
  return { records: records.slice(0, MAX_NODES), partial: !!next || records.length > MAX_NODES };
}

/** Membership explanation, not a claim about all effective record access. */
export async function getSetupUserPublicGroups(instance, sid, version, userId) {
  requireSetupId(userId, '005');
  const users = await restQuery(instance, sid, version, "SELECT UserRoleId, UserType FROM User WHERE Id = '" + userId + "'");
  if (!users[0]) throw new Error('USER_NOT_FOUND');
  const groupMap = new Map(); let seeds = []; let partial = false;
  if (users[0].UserRoleId) {
    try {
      const roles = await boundedQuery(instance, sid, version, 'SELECT Id, Name, ParentRoleId FROM UserRole');
      partial ||= roles.partial;
      const roleMap = new Map(roles.records.map((r) => [key(r.Id), r]));
      const ancestors = []; const visited = new Set(); let role = users[0].UserRoleId;
      while (role && !visited.has(key(role))) {
        visited.add(key(role)); ancestors.push(requireSetupId(role, '00E'));
        role = roleMap.get(key(role))?.ParentRoleId;
      }
      const rows = await boundedQuery(instance, sid, version, "SELECT Id, Name, DeveloperName, Type, RelatedId FROM Group WHERE RelatedId IN (" + ancestors.map((id) => "'" + id + "'").join(',') + ") AND Type IN ('Role', 'RoleAndSubordinates', 'RoleAndSubordinatesInternal')");
      partial ||= rows.partial;
      const internal = ['Standard', 'StandardAul', 'CsnOnly'].includes(users[0].UserType);
      seeds = rows.records.filter((g) => (g.Type !== 'Role' || key(g.RelatedId) === key(users[0].UserRoleId)) && (g.Type !== 'RoleAndSubordinatesInternal' || internal));
      seeds.forEach((g) => groupMap.set(key(g.Id), g));
    } catch { partial = true; }
  }
  let frontier = [userId, ...seeds.map((g) => g.Id)]; const visited = new Set(); const edges = [];
  for (let depth = 0; frontier.length && depth < MAX_DEPTH; depth++) {
    const batchFrontier = frontier.filter((id) => !visited.has(key(id)));
    frontier = [];
    for (let i = 0; i < batchFrontier.length; i += 100) {
      const ids = batchFrontier.slice(i, i + 100);
      ids.forEach((id) => visited.add(key(id)));
      try {
        const rows = await boundedQuery(instance, sid, version, "SELECT GroupId, UserOrGroupId, Group.Id, Group.Name, Group.DeveloperName, Group.Type FROM GroupMember WHERE UserOrGroupId IN (" + ids.map((id) => "'" + requireSetupId(id) + "'").join(',') + ") AND Group.Type = 'Regular'");
        partial ||= rows.partial;
        for (const row of rows.records) {
          edges.push(row); groupMap.set(key(row.GroupId), row.Group);
          if (!visited.has(key(row.GroupId))) frontier.push(row.GroupId);
        }
      } catch (error) { if (!edges.length && !seeds.length) throw error; partial = true; }
      if (visited.size + groupMap.size > MAX_NODES || edges.length >= 20000) { partial = true; frontier = []; break; }
    }
  }
  partial ||= frontier.length > 0;
  const explanation = explainPublicGroupPaths(userId, seeds, edges, [...groupMap.values()]);
  return { ...explanation, partial: partial || explanation.partial, scope: 'direct-nested-role' };
}
