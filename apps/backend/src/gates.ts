// Adapted from METIS server/metis/gates.ts (2026-10-01 FUN CALL local source).
// Registry is SUITE-specific. UNKNOWN/expired evidence remains BLOCK; no Web-complete check.
export const GATE_REGISTRY_VERSION = 'suite-mobile-v0.2';
export const MOBILE_RELEASE_CHECKS = [
  'iphone-device', 'ipad-device', 'import', 'raw-jpeg', 'editing', 'ai-processing', 'batch', 'before-after',
  'save', 'export', 'background-resume', 'offline', 'permissions', 'memory-pressure', 'thermal',
  'battery', 'error-recovery', 'human-factors', 'accessibility', 'performance', 'rendered-reality',
  'recipe-preserved', 'history', 'original-protected', 'main-routes', 'production-backend',
  'commercial-v1', 'app-store-requirements', 'requirements-audit',
  'mac-build-tests', 'real-raw-load-100', 'real-raw-load-500', 'real-raw-load-1000', 'full-lifecycle-sync-recovery',
] as const;
export interface Check {state: 'PASS' | 'FAIL' | 'UNKNOWN'; evidence_ref: string; valid_until: string}
export interface GateInput {subject_id: string; subject_version: number; checks: Record<string, Check | undefined>; high_impact_uncertain: boolean}
export function evaluateMobileRelease(input: GateInput, now: string) {
  if (!input.subject_id || !Number.isSafeInteger(input.subject_version) || input.subject_version < 0 || !Number.isFinite(Date.parse(now))) throw new Error('INVALID_GATE_CONTEXT');
  const failures: string[] = [], unknowns: string[] = [];
  for (const name of MOBILE_RELEASE_CHECKS) {
    const check = input.checks[name];
    if (check?.state === 'FAIL') failures.push(name);
    else if (check?.state !== 'PASS' || !check.evidence_ref || !Number.isFinite(Date.parse(check.valid_until)) || Date.parse(check.valid_until) <= Date.parse(now)) unknowns.push(name);
  }
  const assurance_required = input.high_impact_uncertain !== false || unknowns.length > 0;
  return {decision: failures.length || unknowns.length || assurance_required ? 'BLOCK' as const : 'PASS' as const,
    failures, unknowns, assurance_required, registry_version: GATE_REGISTRY_VERSION};
}
