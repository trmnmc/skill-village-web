import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolvePaths, DEFAULT_PORT } from './paths.js';

describe('resolvePaths', () => {
  it('puts game data under .skill-village in the home directory', () => {
    const p = resolvePaths({ home: '/home/u' });
    expect(p.dataDir).toBe(join('/home/u', '.skill-village'));
  });

  it('keeps every game file inside the data directory', () => {
    const p = resolvePaths({ home: '/home/u' });
    for (const path of [p.statePath, p.stateBackupPath, p.eventLogPath, p.archiveDir, p.shadowDir, p.pidPath]) {
      expect(path.startsWith(p.dataDir)).toBe(true);
    }
  });

  it('never places a game file inside the user .claude directory', () => {
    const p = resolvePaths({ home: '/home/u' });
    const claudeDir = join('/home/u', '.claude');
    for (const path of [p.statePath, p.stateBackupPath, p.eventLogPath, p.archiveDir, p.shadowDir, p.pidPath]) {
      expect(path.startsWith(claudeDir)).toBe(false);
    }
  });

  it('points at the user skills and agents directories', () => {
    const p = resolvePaths({ home: '/home/u' });
    expect(p.userSkillsDir).toBe(join('/home/u', '.claude', 'skills'));
    expect(p.userAgentsDir).toBe(join('/home/u', '.claude', 'agents'));
  });

  it('has no project directories when launched outside a project', () => {
    const p = resolvePaths({ home: '/home/u', projectDir: null });
    expect(p.projectSkillsDir).toBeNull();
    expect(p.projectAgentsDir).toBeNull();
  });

  it('points at the project .claude directories when given one', () => {
    const p = resolvePaths({ home: '/home/u', projectDir: '/work/app' });
    expect(p.projectSkillsDir).toBe(join('/work/app', '.claude', 'skills'));
    expect(p.projectAgentsDir).toBe(join('/work/app', '.claude', 'agents'));
  });

  it('allows the data directory to be overridden without moving .claude', () => {
    const p = resolvePaths({ home: '/home/u', dataDir: '/tmp/sandbox' });
    expect(p.dataDir).toBe('/tmp/sandbox');
    expect(p.userSkillsDir).toBe(join('/home/u', '.claude', 'skills'));
  });

  it('defaults the port to 8262', () => {
    expect(DEFAULT_PORT).toBe(8262);
  });

  it('knows Claude Code session logs (read-only) and the scan cache', () => {
    const paths = resolvePaths({ home: '/h' });
    expect(paths.claudeProjectsDir).toBe(join('/h', '.claude', 'projects'));
    expect(paths.scanCachePath).toBe(join('/h', '.skill-village', 'scan-cache.json'));
  });
});
