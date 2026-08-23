/**
 * The swarm feed bridge: fetch + validate `GET <feedUrl>` (swarm.fenley.ai's
 * /api/projects shape). Read-only network GET — the village's safety posture.
 * Shared seam with M5's nursery: keep showroom-specific logic OUT of here.
 */
export interface SwarmProject {
  slug: string;
  name: string;
  runs: number;
  description: string | null;
  builtAt: string | null;
  lastBuiltAt: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function parseEntry(raw: unknown): SwarmProject | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const slug = str(e.slug);
  if (!slug) return null; // no identity, no resident — skipped, never poisons the list
  const links = (typeof e.links === 'object' && e.links !== null ? e.links : {}) as Record<string, unknown>;
  return {
    slug,
    name: typeof e.name === 'string' ? e.name : '',
    runs: typeof e.runs === 'number' && Number.isFinite(e.runs) && e.runs >= 0 ? Math.floor(e.runs) : 0,
    description: str(e.description),
    builtAt: str(e.built_at),
    lastBuiltAt: str(e.last_built_at),
    repoUrl: str(links.repo),
    liveUrl: str(links.live),
  };
}

export function parseSwarmFeed(json: unknown): SwarmProject[] {
  const list = Array.isArray(json)
    ? json
    : typeof json === 'object' && json !== null && Array.isArray((json as { projects?: unknown }).projects)
      ? (json as { projects: unknown[] }).projects
      : null;
  if (!list) throw new Error('not a swarm feed: expected an array or { projects: [...] }');
  return list.map(parseEntry).filter((p): p is SwarmProject => p !== null);
}

export async function fetchSwarmFeed(url: string, fetchImpl: typeof fetch = fetch): Promise<SwarmProject[]> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`swarm feed responded ${res.status}`);
  return parseSwarmFeed(await res.json());
}
