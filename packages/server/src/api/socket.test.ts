import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import { makeSandbox, skillFixture, type Sandbox } from '../testing/sandbox.js';
import { createVillage, type Village } from '../village.js';
import { createApp } from './app.js';

let sandbox: Sandbox | null = null;
let village: Village | null = null;
let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

/** Boot on an ephemeral port so tests never collide with a running game. */
async function listen(): Promise<string> {
  sandbox = await makeSandbox();
  await sandbox.writeSkill('watcher-bait', skillFixture('watcher-bait'));
  village = await createVillage({ paths: sandbox.paths, now: () => 1_000 });
  app = await createApp(village);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no port assigned');
  return `ws://127.0.0.1:${address.port}/ws`;
}

function nextMessage(socket: WebSocket, timeoutMs = 4000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), timeoutMs);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)) as Record<string, unknown>);
    });
  });
}

describe('the websocket', () => {
  it('sends the whole village state on connect', async () => {
    const url = await listen();
    const socket = new WebSocket(url);
    // Registered before the 'open' await resolves: on loopback the server's
    // synchronous send can arrive in the same read as the handshake, so a
    // listener attached only after 'open' can miss it.
    const initial = nextMessage(socket);
    await new Promise((resolve) => socket.once('open', resolve));

    const message = await initial;
    expect(message.type).toBe('state');
    expect(Object.keys((message.state as { creatures: object }).creatures))
      .toEqual(['skill:watcher-bait']);
    socket.close();
  });

  it('pushes a new state after a care action', async () => {
    const url = await listen();
    const socket = new WebSocket(url);
    const initial = nextMessage(socket);
    await new Promise((resolve) => socket.once('open', resolve));
    await initial; // the initial snapshot

    const pushed = nextMessage(socket);
    await village!.care('skill:watcher-bait', 'pet');
    const message = await pushed;

    expect(message.type).toBe('state');
    const state = message.state as { creatures: Record<string, { stats: { bond: number } }> };
    expect(state.creatures['skill:watcher-bait']!.stats.bond).toBeGreaterThan(10);
    socket.close();
  });

  it('stops pushing to a client that disconnected', async () => {
    const url = await listen();
    const socket = new WebSocket(url);
    const initial = nextMessage(socket);
    await new Promise((resolve) => socket.once('open', resolve));
    await initial;

    socket.close();
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Must not throw when broadcasting with no live sockets left.
    await expect(village!.care('skill:watcher-bait', 'play')).resolves.toBeUndefined();
  });
});
