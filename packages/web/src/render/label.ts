import type { Creature } from '@village/core/visual';

/** The name over a creature's head: its given name, or its filename until it has one. */
export function displayName(creature: Creature): string {
  return creature.nickname.trim() || creature.name;
}

/**
 * The filename beneath, in mono. Skills and projects are folders and end in
 * `/`; agents are files and end in `.md` — a glance still tells the species
 * apart (spec §4).
 */
export function fileLabel(creature: Creature): string {
  if (creature.kind === 'skill' || creature.kind === 'project') return `${creature.name}/`;
  return creature.name.endsWith('.md') ? creature.name : `${creature.name}.md`;
}
