import { VcsUiApp, WindowSlot } from '@vcmap/ui';
import WalkWindow from './walkWindow.vue';
import { name } from '../package.json';

export const windowId = 'walk-plugin-window';

export function openWindow(app: VcsUiApp): void {
  app.windowManager.add(
    {
      id: windowId,
      component: WalkWindow,
      slot: WindowSlot.DYNAMIC_RIGHT,
      state: {
        headerTitle: 'walk.headerTitle',
        headerIcon: '$vcsWalking',
        styles: { width: '280px', height: 'auto' },
        infoUrlCallback: app.getHelpUrlCallback(
          'components/mapspace.html#id_3DView_walkmode',
        ),
      },
    },
    name,
  );
}
