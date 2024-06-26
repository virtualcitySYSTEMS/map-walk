import type { VcsAction, VcsUiApp } from '@vcmap/ui';
import {
  CesiumMap,
  CesiumTilesetLayer,
  InteractionEvent,
  Projection,
  vcsLayerName,
} from '@vcmap/core';
import { WalkPlugin } from './index.js';
import { openWindow, windowId } from './windowHelper.js';
import { name } from '../package.json';

export default function addMapDependentContextMenu(
  app: VcsUiApp,
  plugin: WalkPlugin,
): () => void {
  function contextMenuHandler(event: InteractionEvent): VcsAction[] {
    const contextEntries: VcsAction[] = [];

    if (!(event.map instanceof CesiumMap)) {
      return [];
    }

    if (
      !plugin.walkSession &&
      event.position &&
      (!event.feature ||
        !(
          app.layers.getByKey(event.feature[vcsLayerName]) instanceof
          CesiumTilesetLayer
        ))
    ) {
      contextEntries.push({
        name: 'walk.start',
        icon: '$vcsWalking',
        async callback(): Promise<void> {
          if (event.position) {
            await plugin.startWalkSession(
              Projection.mercatorToWgs84(event.position),
            );
            openWindow(app);
          }
        },
      });
    } else if (plugin.walkSession) {
      if (!app.windowManager.has(windowId)) {
        contextEntries.push({
          name: 'walk.openSettings',
          icon: '$vcsWalking',
          callback(): void {
            openWindow(app);
          },
        });
      }
      contextEntries.push({
        name: 'walk.stopMode',
        icon: '$vcsWalking',
        async callback(): Promise<void> {
          await plugin.stopWalkSession();
        },
      });
    }
    return contextEntries;
  }

  app.contextMenuManager.addEventHandler(contextMenuHandler, name);
  return (): void => {
    app.contextMenuManager.removeHandler(contextMenuHandler);
  };
}
