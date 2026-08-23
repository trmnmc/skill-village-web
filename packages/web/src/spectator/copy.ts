import type { EggView, NoticeEvent, RareViewFull, ResidentView } from './protocol.js';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatAuctionCountdown(nowMs: number, opensAtIso: string): string {
  const t = Date.parse(opensAtIso);
  if (Number.isNaN(t)) return '';
  const ms = t - nowMs;
  if (ms <= 0) return 'open';
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86_400);
  if (days >= 1) return `${days}d ${Math.floor((totalSecs % 86_400) / 3600)}h`;
  return `${pad(Math.floor(totalSecs / 3600))}:${pad(Math.floor((totalSecs % 3600) / 60))}:${pad(totalSecs % 60)}`;
}

export function ago(nowMs: number, iso: string | null): string | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const secs = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (secs < 90) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86_400)}d ago`;
}

export function noticeLines(events: NoticeEvent[]): string[] {
  const lines: string[] = [];
  for (const e of events) {
    if (e.type === 'hatched') lines.push(`hatched: ${e.name}.`);
    else if (e.type === 'hatched-away') lines.push(`hatched while the lights were out: ${e.name}.`);
    else if (e.type === 'egg-laid') lines.push(`a new arrival at the nursery: ${e.name}.`);
    else if (e.type === 'orphaned') lines.push(`${e.name} wandered out of the feed.`);
    else if (e.type === 'rare-confirmed') lines.push(`the keeper confirmed a rare: ${e.name}.`);
    // Unknown types (a newer server) say nothing rather than something wrong.
  }
  return lines;
}

export interface PanelLink {
  label: string;
  href: string;
}

export interface PanelModel {
  header: string;
  chip: string | null;
  chipAccent: boolean;
  title: string;
  desc: string;
  meta: string;
  trivia: string | null;
  links: PanelLink[];
  boxes: string[];
  footnote: string | null;
}

export type PanelTarget =
  | { kind: 'egg'; egg: EggView }
  | { kind: 'common'; resident: ResidentView }
  | { kind: 'rare'; rare: RareViewFull };

const NO_DESC = 'no description yet — the swarm writes its story as it builds.';

function links(repoUrl: string | null, liveUrl: string | null): PanelLink[] {
  const out: PanelLink[] = [];
  if (repoUrl) out.push({ label: 'repo', href: repoUrl });
  if (liveUrl) out.push({ label: 'live app', href: liveUrl });
  return out;
}

export function panelModel(target: PanelTarget, options: { trivia: Record<string, string>; now: number }): PanelModel {
  if (target.kind === 'egg') {
    const e = target.egg;
    const laid = ago(options.now, e.lastBuiltAt);
    return {
      header: 'the nursery',
      chip: 'EGG · incubating',
      chipAccent: false,
      title: e.name !== '' ? e.name : '?????',
      desc: e.description ?? NO_DESC,
      meta: [laid ? `last stirred ${laid}` : null, `run ${e.runs} under way`].filter(Boolean).join(' · '),
      trivia: null,
      links: [],
      boxes: ['hatches when the judge calls the build done. no repo yet — still growing.'],
      footnote: null,
    };
  }
  if (target.kind === 'common') {
    const r = target.resident;
    const hatched = ago(options.now, r.builtAt);
    return {
      header: 'villager',
      chip: null,
      chipAccent: false,
      title: r.name,
      desc: r.description ?? NO_DESC,
      meta: [hatched ? `hatched ${hatched}` : 'hatched', `${r.runs} runs`].join(' · '),
      trivia: options.trivia[r.slug] ?? null,
      links: links(r.repoUrl, r.liveUrl),
      boxes: ['lives here. commons are never for sale.'],
      footnote: null,
    };
  }
  const r = target.rare;
  const hatched = ago(options.now, r.builtAt);
  const countdown = formatAuctionCountdown(options.now, r.auctionOpensAt);
  return {
    header: 'rare drop',
    chip: `✻ RARE DROP №${r.number}`,
    chipAccent: true,
    title: r.name,
    desc: r.description ?? NO_DESC,
    meta: [hatched ? `hatched ${hatched}` : 'hatched', `${r.runs} runs`, 'judge-picked · keeper-confirmed'].join(' · '),
    trivia: options.trivia[r.slug] ?? null,
    links: links(r.repoUrl, r.liveUrl),
    boxes: [
      countdown === 'open' ? 'the auction is open' : countdown === '' ? 'auction date to be announced' : `auction opens in ${countdown}`,
      '1 of 1. one buyer takes the repo, the live app, and the creature itself — it leaves this village and moves into yours.',
    ],
    footnote: null,
  };
}
