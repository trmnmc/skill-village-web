/**
 * Boots the public showroom: polls the swarm feed, serves spectators.
 *
 * Run: npm run dev:showroom
 */
import { loadShowroomConfig } from './config.js';
import { resolveShowroomPaths } from './persist.js';
import { createShowroom } from './runtime.js';
import { createShowroomApp } from './app.js';

async function main(): Promise<void> {
  const port = Number(process.env.SHOWROOM_PORT ?? 8263);
  const host = process.env.SHOWROOM_HOST ?? '127.0.0.1';
  const paths = resolveShowroomPaths(
    process.env.SHOWROOM_DATA_DIR ? { dataDir: process.env.SHOWROOM_DATA_DIR } : {},
  );
  const configPath = process.env.SHOWROOM_CONFIG ?? paths.configPath;

  const { config, warnings } = await loadShowroomConfig(configPath);
  for (const w of warnings) console.error(`showroom config: ${w}`);

  const runtime = await createShowroom({ paths, config });
  await runtime.poll(); // first frame before the first visitor
  runtime.start();

  const app = await createShowroomApp(runtime);
  await app.listen({ port, host });
  const { villagers, eggs } = runtime.getPayload().counts;
  console.log(`Swarm Showroom is open at http://${host}:${port} — ${villagers} villagers, ${eggs} eggs.`);

  // The keeper edits the config over ssh; SIGHUP reloads it without dropping
  // spectators (spec §7 "read on boot and on change"). Windows dev has no kill
  // -HUP, but attaching the listener is harmless there — restart instead.
  process.on('SIGHUP', () => {
    void loadShowroomConfig(configPath)
      .then(({ config: next, warnings: w }) => {
        for (const line of w) console.error(`showroom config: ${line}`);
        runtime.setConfig(next);
        console.log('showroom: config reloaded.');
      })
      .catch((error) => console.error('showroom: config reload failed, keeping the old one:', error));
  });

  const shutdown = async () => {
    runtime.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('Swarm Showroom failed to start:', error);
  process.exit(1);
});
