import { describe, it, expect, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { makeSandbox, type Sandbox } from './testing/sandbox.js';
import { readInstance, writeInstance, clearInstance, isAlive, isVillageServing } from './instance.js';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createVillage } from './village.js';
import { createApp } from './api/app.js';

let sandbox: Sandbox | null = null;
afterEach(async () => { await sandbox?.cleanup(); sandbox = null; });

describe('instance file', () => {
  it('reports nothing when no server has run', async () => {
    sandbox = await makeSandbox();
    expect(await readInstance(sandbox.paths)).toBeNull();
  });

  it('round trips pid and port', async () => {
    sandbox = await makeSandbox();
    await writeInstance(sandbox.paths, { pid: process.pid, port: 8262 });
    expect(await readInstance(sandbox.paths)).toEqual({ pid: process.pid, port: 8262 });
  });

  it('ignores a stale file whose process is gone', async () => {
    sandbox = await makeSandbox();
    // PID 1 exists on POSIX but is not us; use an implausible one instead.
    await writeInstance(sandbox.paths, { pid: 2_147_483_646, port: 9999 });
    expect(await readInstance(sandbox.paths)).toBeNull();
  });

  it('ignores a corrupt file rather than crashing the boot', async () => {
    sandbox = await makeSandbox();
    await writeFile(sandbox.paths.pidPath, 'not json', 'utf8');
    expect(await readInstance(sandbox.paths)).toBeNull();
  });

  it('clears cleanly, and clearing twice is not an error', async () => {
    sandbox = await makeSandbox();
    await writeInstance(sandbox.paths, { pid: process.pid, port: 1 });
    await clearInstance(sandbox.paths);
    expect(await readInstance(sandbox.paths)).toBeNull();
    await expect(clearInstance(sandbox.paths)).resolves.toBeUndefined();
  });
});

describe('isAlive', () => {
  it('is true for this very process', () => {
    expect(isAlive(process.pid)).toBe(true);
  });

  it('is false for an implausible pid', () => {
    expect(isAlive(2_147_483_646)).toBe(false);
  });
});

describe('isVillageServing', () => {
  it('is true when a real village answers on that port', async () => {
    sandbox = await makeSandbox();
    const village = await createVillage({ paths: sandbox.paths });
    const app = await createApp(village);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    try {
      expect(await isVillageServing(port)).toBe(true);
    } finally {
      await app.close();
      await village.close();
    }
  });

  it('is false when nothing is listening', async () => {
    // Bind and immediately release to get a port nobody is using.
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((r) => probe.close(() => r()));
    expect(await isVillageServing(port)).toBe(false);
  });

  it('is false when something else holds the port', async () => {
    const impostor = createServer((_req, res) => {
      res.writeHead(404).end('not a village');
    });
    await new Promise<void>((r) => impostor.listen(0, '127.0.0.1', r));
    const { port } = impostor.address() as AddressInfo;
    try {
      expect(await isVillageServing(port)).toBe(false);
    } finally {
      await new Promise<void>((r) => impostor.close(() => r()));
    }
  });

  it('gives up rather than hanging on a port that never answers', async () => {
    // Accepts the connection but never responds.
    const silent = createServer(() => {});
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    const { port } = silent.address() as AddressInfo;
    try {
      const started = Date.now();
      expect(await isVillageServing(port, 150)).toBe(false);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      await new Promise<void>((r) => silent.close(() => r()));
    }
  });
});
