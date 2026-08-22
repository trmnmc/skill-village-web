import { homedir } from 'node:os';
import { join } from 'node:path';

/** "TAMA" on a phone keypad. */
export const DEFAULT_PORT = 8262;

export interface VillagePaths {
  /** The home directory these paths were resolved against. */
  home: string;
  /** Everything the game owns lives under here. Never inside ~/.claude. */
  dataDir: string;
  statePath: string;
  stateBackupPath: string;
  eventLogPath: string;
  /** Mirrors of every imported file, so a deleted file still has a last-known copy. */
  shadowDir: string;
  /** Where released creatures' files go. Content preserved verbatim. */
  archiveDir: string;
  pidPath: string;
  userSkillsDir: string;
  userAgentsDir: string;
  /** Null when the game was not launched inside a project. */
  projectSkillsDir: string | null;
  projectAgentsDir: string | null;
}

export interface ResolveOptions {
  /** Defaults to os.homedir(). Tests pass a sandbox directory. */
  home?: string;
  /** Defaults to <home>/.skill-village. */
  dataDir?: string;
  /** The project the game was launched inside, if any. */
  projectDir?: string | null;
}

export function resolvePaths(options: ResolveOptions = {}): VillagePaths {
  const home = options.home ?? homedir();
  const dataDir = options.dataDir ?? join(home, '.skill-village');
  const claudeDir = join(home, '.claude');
  const projectDir = options.projectDir ?? null;

  return {
    home,
    dataDir,
    statePath: join(dataDir, 'state.json'),
    stateBackupPath: join(dataDir, 'state.backup.json'),
    eventLogPath: join(dataDir, 'events.jsonl'),
    shadowDir: join(dataDir, 'shadow'),
    archiveDir: join(dataDir, 'archive'),
    pidPath: join(dataDir, 'server.pid'),
    userSkillsDir: join(claudeDir, 'skills'),
    userAgentsDir: join(claudeDir, 'agents'),
    projectSkillsDir: projectDir ? join(projectDir, '.claude', 'skills') : null,
    projectAgentsDir: projectDir ? join(projectDir, '.claude', 'agents') : null,
  };
}
