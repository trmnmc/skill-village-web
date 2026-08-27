/**
 * "Put everyone back": one button that releases every hand-placed villager to
 * automatic placement. It is the whole undo story for pinning, which is why it
 * stands in the HUD rather than hiding in a menu.
 */
export interface LayoutButton {
  /** Re-read whether any pins exist, and enable or disable accordingly. */
  refresh(): void;
}

export function mountLayoutButton(
  container: HTMLElement,
  scene: { resetLayout(): void; hasPins(): boolean },
): LayoutButton {
  const root = document.createElement('div');
  root.id = 'layout-reset';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'layout-reset-button';
  button.textContent = '↺';
  button.title = 'Put every villager back where the village would seat them';

  // Never offer to undo nothing.
  const refresh = () => {
    button.disabled = !scene.hasPins();
  };

  button.addEventListener('click', () => {
    scene.resetLayout();
    refresh();
  });

  root.appendChild(button);
  container.appendChild(root);
  refresh();
  return { refresh };
}
