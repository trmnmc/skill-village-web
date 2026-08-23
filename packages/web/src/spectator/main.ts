// packages/web/src/spectator/main.ts — the whole wiring, nothing clever
import { connectShowroom } from './client.js';
import { createSpectatorPanel } from './panel.js';
import { startSpectatorVillage } from './scene.js';
import { noticeLines, panelModel } from './copy.js';
import type { ShowroomView } from './protocol.js';

let latest: ShowroomView | null = null;

const hint = document.getElementById('hud-hint')!;
hint.innerHTML = '<span class="chip">click an egg, a villager, or the rosette</span>';

const panel = createSpectatorPanel({ onToggle: (open) => { hint.hidden = open; } });

const scene = await startSpectatorVillage({
  onTarget: (target) => {
    if (!latest) return;
    panel.open(panelModel(target, { trivia: latest.trivia, now: Date.now() }));
  },
});

function renderHud(view: ShowroomView): void {
  const sign = document.getElementById('hud-sign')!;
  const rareClause = view.counts.rares > 0 ? ` · ${view.counts.rares} rare on the block` : '';
  const stale = view.feedStale ? ' — the swarm is napping' : '';
  sign.innerHTML =
    `<div class="board"><div style="font-family:'Pixelify Sans',sans-serif;font-size:27px;line-height:1.1;">SWARM VILLAGE</div>` +
    `<div style="font-size:11px;opacity:0.75;">every villager here was built by the swarm</div></div><br>` +
    `<span class="chip" style="margin-top:8px;"><span style="color:#D97757;">●</span> ` +
    `${view.counts.villagers} villagers · ${view.counts.eggs} eggs${rareClause}${stale}</span>`;

  const notice = document.getElementById('hud-notice')!;
  const lines = noticeLines(view.events).slice(0, 4);
  notice.innerHTML = lines.length === 0 ? '' :
    `<div class="board" style="font-size:12px;"><div style="font-family:'Pixelify Sans',sans-serif;font-size:14px;">NOTICE BOARD</div>` +
    lines.map((l) => `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('') + `</div>`;
}

connectShowroom({
  onView: (view) => {
    latest = view;
    scene.setView(view);
    renderHud(view);
    if (view.counts.villagers === 0 && view.counts.eggs === 0) {
      scene.setStatus("the swarm hasn't sent anyone home yet.");
    }
  },
  onHatch: (slug) => scene.playHatch(slug),
  onStatus: (status) =>
    scene.setStatus(status === 'live' ? '' : status === 'connecting' ? 'connecting…' : 'server offline — retrying'),
});
