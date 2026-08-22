import { startVillage } from './scene/village.js';
import { connect } from './net/client.js';

const scene = await startVillage();

connect({
  onView: (view) => scene.setView(view),
  onStatus: (status) =>
    scene.setStatus(
      status === 'live' ? 'live' : status === 'connecting' ? 'connecting…' : 'server offline — retrying',
    ),
});
