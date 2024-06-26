import { VcsPlugin, VcsUiApp } from '@vcmap/ui';
import { CesiumMap } from '@vcmap/core';
import { name, version, mapVersion } from '../package.json';
import createWalkSession, { WalkSession } from './walkSession.js';
import addMapDependentContextMenu from './contextMenuHelper.js';
import { windowId } from './windowHelper.js';

type PluginConfig = Record<never, never>;
type PluginState = Record<never, never>;

export type WalkPlugin = VcsPlugin<PluginConfig, PluginState> & {
  startWalkSession(this: WalkPlugin, coordsWgs84: number[]): Promise<void>;
  stopWalkSession(): Promise<void>;
  readonly walkSession: WalkSession | undefined;
};

async function jumpToDefaultView(app: VcsUiApp): Promise<void> {
  const { activeMap } = app.maps;

  const viewpoint = activeMap?.getViewpointSync();

  if (viewpoint && activeMap instanceof CesiumMap) {
    viewpoint.distance = 500;
    viewpoint.pitch = -45;
    viewpoint.groundPosition = viewpoint.cameraPosition;
    viewpoint.cameraPosition = null;
    viewpoint.animate = true;
    await app.maps.activeMap?.gotoViewpoint(viewpoint);
  }
}

export default function plugin(): WalkPlugin {
  let app: VcsUiApp | undefined;
  let walkSession: WalkSession | undefined;
  let stoppedListener = (): void => {};
  let destroy = (): void => {};

  return {
    get name(): string {
      return name;
    },
    get version(): string {
      return version;
    },
    get mapVersion(): string {
      return mapVersion;
    },
    get walkSession(): WalkSession | undefined {
      return walkSession;
    },
    async startWalkSession(coordsWgs84: number[]): Promise<void> {
      await this.stopWalkSession();
      if (app) {
        walkSession = await createWalkSession(app, coordsWgs84);
        stoppedListener = walkSession.stopped.addEventListener(() => {
          app?.windowManager.remove(windowId);
          walkSession = undefined;
          stoppedListener();
        });
      }
    },
    async stopWalkSession(): Promise<void> {
      if (app && walkSession) {
        walkSession.stop();
        await jumpToDefaultView(app);
      }
    },
    initialize(vcsUiApp: VcsUiApp): Promise<void> {
      app = vcsUiApp;

      const removeContextMenuHandling = addMapDependentContextMenu(
        vcsUiApp,
        this,
      );

      destroy = (): void => {
        walkSession?.stop();
        stoppedListener();
        removeContextMenuHandling();
      };
      return Promise.resolve();
    },
    destroy,
    i18n: {
      en: {
        walk: {
          headerTitle: 'Pedestrian mode',
          viewingHeight: 'Viewing height',
          viewingAngle: 'Viewing angle',
          stop: 'Quit',
          stopMode: 'Quit pedestrian mode',
          start: 'Start pedestrian mode',
          openSettings: 'Pedestrian mode settings',
          navigation: {
            move: 'Use the arrow keys (or alternatively "W"/"A"/"S"/"D") on the keyboard to move around.',
            boost: 'Press and hold left shift key to increase walking speed.',
            look: 'Drag with left mouse key to rotate the view.',
          },
        },
      },
      de: {
        walk: {
          headerTitle: 'Fußgängermodus',
          viewingHeight: 'Sichthöhe',
          viewingAngle: 'Blickwinkel',
          stop: 'Beenden',
          stopMode: 'Fußgängermodus beenden',
          start: 'Fußgängermodus starten',
          openSettings: 'Fußgängermodus Einstellungen',
          navigation: {
            move: 'Verwende die Pfeiltasten oder "W"/"A"/"S"/"D" um dich fortzubewegen.',
            boost:
              'Halte die linke Shift-Taste gedrückt um dich schneller fortzubewegen.',
            look: 'Ziehe mit der linken Maustaste über die Karte um herumzuschauen.',
          },
        },
      },
    },
  };
}
