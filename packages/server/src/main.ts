/**
 * Boots the village: one process serving the game and ticking the simulation.
 *
 * Run: npm run dev:server
 */
import { createApp } from './api/app.js';
import { DEFAULT_PORT, resolvePaths } from './config/paths.js';
import { createWatcher } from './bridge/watcher.js';
import { clearInstance, isVillageServing, readInstance, writeInstance } from './instance.js';
import { createLlmService } from './llm/service.js';
import { createVillage } from './village.js';

/** Faster while someone is watching, slower when the village is on its own. */
const TICK_MS_WITH_CLIENT = 2_000;
const TICK_MS_HEADLESS = 60_000;

async function main(): Promise<void> {
  const port = Number(process.env.VILLAGE_PORT ?? DEFAULT_PORT);
  const paths = resolvePaths({ projectDir: process.cwd() });

  const running = await readInstance(paths);
  if (running && (await isVillageServing(running.port))) {
    console.log(`Skill Village is already running (pid ${running.pid}).`);
    console.log(`Open http://localhost:${running.port} instead.`);
    process.exit(0);
  }
  // A pid file with nobody serving behind it is debris from a crash. Clear it
  // and carry on rather than making the player hunt down a file to delete.
  if (running) await clearInstance(paths);

  const village = await createVillage({
    paths,
    llmFactory: (hooks) =>
      createLlmService({
        now: hooks.now,
        getLlm: hooks.getLlm,
        setLlm: hooks.setLlm,
      }),
  });
  if (village.startupNote) console.log(village.startupNote);

  const app = await createApp(village);
  await app.listen({ port, host: '127.0.0.1' });
  await writeInstance(paths, { pid: process.pid, port });

  void village.probeLlm().then((mode) => {
    console.log(
      mode === 'full'
        ? 'The village found its voice (claude CLI reachable).'
        : 'Silent-movie mode: no reachable claude CLI. (A server started from inside a Claude Code session always lands here — run it from a plain terminal to chat.)',
    );
  }).catch((error) => console.error('LLM probe failed:', error));

  const watcher = createWatcher({
    paths,
    onChange: () => {
      void village.refresh().catch((error) => console.error('Refresh failed:', error));
    },
  });

  let timer: NodeJS.Timeout = setInterval(tick, TICK_MS_HEADLESS);
  let headless = true;

  function tick() {
    void village.tick().catch((error) => console.error('Tick failed:', error));
  }

  // Speed the heartbeat up while a client is attached, and slow it down after.
  app.server.on('upgrade', () => {
    if (!headless) return;
    headless = false;
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS_WITH_CLIENT);
  });

  const count = Object.keys(village.getState().creatures).length;
  console.log(`Skill Village is awake at http://localhost:${port} with ${count} villagers.`);

  const shutdown = async () => {
    clearInterval(timer);
    await watcher.close();
    await app.close();
    await village.close();
    await clearInstance(paths);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('Skill Village failed to start:', error);
  process.exit(1);
});
