import type { Creature } from '@village/core/visual';

/** The name over a creature's head: its given name, or its filename until it has one. */
export function displayName(creature: Creature): string {
  return creature.nickname.trim() || creature.name;
}

/**
 * The filename beneath, in mono. Skills end in `/` because they are folders and
 * agents end in `.md` because they are files — which is how a glance tells the
 * two species apart (spec §4).
 */
export function fileLabel(creature: Creature): string {
  if (creature.kind === 'skill') return `${creature.name}/`;
  return creature.name.endsWith('.md') ? creature.name : `${creature.name}.md`;
}
