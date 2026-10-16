/** Home is a projection of the existing project catalog, not another project store/router.
 * Feed only the current authenticated catalog. Recency never resurrects deleted/inaccessible
 * projects. This function does not fetch originals, navigate, grant permission or import.
 */
export function recentHomeProjects(projects, visits, {limit = 24} = {}) {
  if (!Array.isArray(projects) || projects.length > 100000 || !Array.isArray(visits) || visits.length > 100000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw Error('HOME_RECENTS_INPUT_INVALID');
  const catalog = new Map(), times = new Map(), seen = new Set();
  for (const project of projects) {
    if (!project || typeof project.id !== 'string' || !project.id || seen.has(project.id)) throw Error('HOME_PROJECT_INVALID');
    seen.add(project.id);
    if (project.deletedAt !== undefined && project.deletedAt !== null) continue;
    catalog.set(project.id, project);
  }
  for (const visit of visits) {
    if (!visit || typeof visit.projectId !== 'string' || !Number.isSafeInteger(visit.openedAt) || visit.openedAt < 0)
      throw Error('HOME_VISIT_INVALID');
    if (catalog.has(visit.projectId)) times.set(visit.projectId, Math.max(times.get(visit.projectId) ?? 0, visit.openedAt));
  }
  return [...times].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
    .map(([id, openedAt]) => ({project: structuredClone(catalog.get(id)), openedAt}));
}
