// Heuristic matcher for "folder not trusted" / initial-trust errors from the
// claude CLI. The exact stderr string claude emits on first use in a directory
// is not formally documented; this matcher errs on the side of false positives
// (suggest `initWorkspace` unnecessarily) rather than false negatives (leave
// the user staring at an opaque error).
const TRUST_PATTERNS: readonly RegExp[] = [
  /trust(ed)?\s+(this\s+)?(folder|director|workspace|project)/i,
  /approve\s+(this\s+)?(folder|director|workspace|project)/i,
  /grant\s+access/i,
  /not\s+a\s+trusted/i,
  /permission\s+to\s+(access|read|work)/i,
];

export function looksLikeTrustError(stderr: string | undefined | null): boolean {
  if (!stderr) {
    return false;
  }
  return TRUST_PATTERNS.some((p) => p.test(stderr));
}
