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
import { createVillage, type Village } from './village.js';
import { createDeviceClient } from './robot/device.js';
import { createWhisperTranscriber } from './robot/asr.js';
import { createOpenAiSpeaker, createPiperSpeaker, withFallback, type Speaker } from './robot/tts.js';
import { startRobotLoop, type RobotLoopHandle } from './robot/loop.js';

/**
 * The robot voice loop, when the env asks for one. Pull-model: this process
 * calls the robot; the robot never calls us, so the server can stay
 * loopback-bound. No token, no loop — an unauthenticated robot is a bug.
 */
function maybeStartRobotLoop(village: Village): RobotLoopHandle | null {
  const host = process.env.VILLAGE_ROBOT_HOST;
  if (!host) return null;
  const token = process.env.VILLAGE_ROBOT_TOKEN;
  if (!token) {
    console.error('VILLAGE_ROBOT_HOST is set but VILLAGE_ROBOT_TOKEN is not; refusing to talk to the robot unauthenticated.');
    return null;
  }

  let speaker: Speaker | null = null;
  const openai = process.env.OPENAI_API_KEY
    ? createOpenAiSpeaker({ apiKey: process.env.OPENAI_API_KEY })
    : null;
  const piper = process.env.VILLAGE_PIPER_EXE && process.env.VILLAGE_PIPER_MODEL
    ? createPiperSpeaker({ exePath: process.env.VILLAGE_PIPER_EXE, modelPath: process.env.VILLAGE_PIPER_MODEL })
    : null;
  if (openai && piper) {
    speaker = withFallback(openai, piper, (err) => console.error('OpenAI TTS failed; Piper took over:', err));
  } else {
    speaker = openai ?? piper;
  }
  if (!speaker) {
    console.error('Robot loop needs a voice: set OPENAI_API_KEY and/or VILLAGE_PIPER_EXE + VILLAGE_PIPER_MODEL.');
    return null;
  }

  const loop = startRobotLoop({
    device: createDeviceClient({ baseUrl: `http://${host}`, token }),
    asr: createWhisperTranscriber({ serverUrl: process.env.VILLAGE_WHISPER_URL ?? 'http://127.0.0.1:8178' }),
    tts: speaker,
    village,
    log: (line) => console.error(line),
  });
  console.log(`Robot voice loop is up, talking to http://${host} (${openai ? 'OpenAI TTS' : 'Piper'}${openai && piper ? ' + Piper fallback' : ''}).`);
  return loop;
}

/** Faster while someone is watching, slower when the village is on its own. */
const TICK_MS_WITH_CLIENT = 2_000;
const TICK_MS_HEADLESS = 60_000;

async function main(): Promise<void> {
  const port = Number(process.env.VILLAGE_PORT ?? DEFAULT_PORT);
  // VILLAGE_DATA_DIR gives this process its own save, away from the shared
  // ~/.skill-village. Two servers on one machine — a second checkout, a
  // worktree mid-migration — otherwise write the same state.json, and a
  // save stamped with a newer STATE_VERSION is rejected wholesale by the
  // older one, which then starts a fresh village over the top of it. The
  // data dir is the whole village: state, backup, events, shadows, archive.
  const paths = resolvePaths({
    projectDir: process.cwd(),
    dataDir: process.env.VILLAGE_DATA_DIR || undefined,
  });

  const running = await readInstance(paths);
  if (running && (await isVillageServing(running.port))) {
    console.log(`Skill Village is already running (pid ${running.pid}).`);
    console.log(`Open http://localhost:${running.port} instead.`);
    process.exit(0);
  }
  // A pid file with nobody serving behind it is debris from a crash. Clear it
  // and carry on rather than making the player hunt down a file to delete.
  if (running) await clearInstance(paths);

  // The deployed village is a served copy of the owner's state on a disk
  // with none of the creatures' files; snapshot mode keeps reconcile away.
  const snapshot = process.env.VILLAGE_SNAPSHOT === '1';

  const village = await createVillage({
    paths,
    snapshot,
    llmFactory: (hooks) =>
      createLlmService({
        now: hooks.now,
        getLlm: hooks.getLlm,
        setLlm: hooks.setLlm,
        // Chat quips are short and persona cards fit comfortably; a wedged
        // CLI frees the concurrency-2 queue in 30s instead of riding the
        // service's 90s default, which two stuck calls could otherwise
        // saturate and freeze the panel on.
        timeoutMs: 30_000,
        // Failures land on the server console: one line with reason, detail
        // and duration, so a canned fallback is never a mystery again.
        log: (line) => console.error(line),
      }),
  });
  if (village.startupNote) console.log(village.startupNote);

  const robotLoop = maybeStartRobotLoop(village);

  // The LLM guard stays off (0) for local play; the droplet's systemd unit
  // arms it, because deployed /v1 spends real API budget for anyone.
  const app = await createApp(village, {
    llmRatePerMinute: Number(process.env.VILLAGE_LLM_RPM ?? 0),
    llmBurst: Number(process.env.VILLAGE_LLM_BURST ?? 3),
    ...(robotLoop ? { robotLoopSnapshot: () => robotLoop.snapshot() } : {}),
  });
  // 127.0.0.1 unless the player opts the server onto the LAN. The robot
  // loop is pull-model (this process calls the robot), so it needs no
  // non-loopback bind; VILLAGE_HOST remains for other setups.
  const host = process.env.VILLAGE_HOST || '127.0.0.1';
  await app.listen({ port, host });
  await writeInstance(paths, { pid: process.pid, port });

  void village.probeLlm().then((mode) => {
    console.log(
      mode === 'full'
        ? 'The village found its voice (claude CLI reachable).'
        : 'Silent-movie mode: no reachable claude CLI. (Is `claude` installed and logged in? The line above says what the probe hit.)',
    );
  }).catch((error) => console.error('LLM probe failed:', error));

  // No watcher on a snapshot: there are no files to watch, and its refresh
  // would only ever throw.
  const watcher = snapshot
    ? null
    : createWatcher({
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

  // The work signal: boot + every 5 minutes (remap spec §3). Its own timer,
  // not a tick multiple — the tick interval changes when a client attaches.
  const PROJECT_SCAN_MS = 300_000;
  const scanTimer = setInterval(() => {
    void village.scanProjects().catch((error) => console.error('Project scan failed:', error));
  }, PROJECT_SCAN_MS);

  const count = Object.keys(village.getState().creatures).length;
  console.log(`Skill Village is awake at http://localhost:${port} with ${count} villagers.`);

  const shutdown = async () => {
    robotLoop?.stop();
    clearInterval(timer);
    clearInterval(scanTimer);
    await watcher?.close();
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
