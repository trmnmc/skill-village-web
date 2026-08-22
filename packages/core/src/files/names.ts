/**
 * Claude Code's rule for agent names, which we apply to skill directory names too:
 * lowercase letters, digits and hyphens; no leading hyphen; no colon.
 * Files that break it are silently skipped by Claude Code, so we must catch
 * problems before writing anything.
 */
export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isValidName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

/** A human-readable reason a name is invalid, or null if it is fine. */
export function describeNameProblem(name: string): string | null {
  if (name.length === 0) return 'Name is empty.';
  if (name.startsWith('-')) return 'Name cannot start with a hyphen.';
  if (name.includes(':')) return 'Name cannot contain a colon.';
  if (/[A-Z]/.test(name)) return 'Name must be lowercase.';
  if (!isValidName(name)) return 'Name may only contain lowercase letters, digits and hyphens.';
  return null;
}

/** Best-effort conversion of free text into a valid name. May return ''. */
export function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}
