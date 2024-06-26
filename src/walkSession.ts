import { CesiumMap, VcsEvent, Viewpoint } from '@vcmap/core';
import { Ref, ref } from 'vue';
import { VcsUiApp } from '@vcmap/ui';
import { PerspectiveFrustum } from '@vcmap-cesium/engine';
import { setupNavigationControls } from './setupNavigationControls.js';

export type SessionState = 'inactive' | 'active' | 'notPositioned';

export type WalkSession = {
  stop: () => void;
  stopped: VcsEvent<void>;
  relativeHeight: Ref<number>;
};

async function jumpToFirstPersonView(
  app: VcsUiApp,
  groundPosition: number[],
  offset: number,
): Promise<void> {
  const { activeMap } = app.maps;

  const currentHeading = activeMap?.getViewpointSync()?.heading;
  if (currentHeading) {
    const viewpoint = new Viewpoint({
      groundPosition: [
        groundPosition[0],
        groundPosition[1],
        groundPosition[2] + offset,
      ],
      heading: currentHeading,
      distance: 0,
      pitch: 0,
      roll: 0,
      animate: true,
    });
    await app.maps.activeMap?.gotoViewpoint(viewpoint);
  }
}

function resetFov(app: VcsUiApp, fov: number): void {
  let cesiumMap: CesiumMap;
  if (app.maps.activeMap instanceof CesiumMap) {
    cesiumMap = app.maps.activeMap;
  } else {
    cesiumMap = app.maps.getByType('CesiumMap')[0] as CesiumMap;
  }

  (cesiumMap.getCesiumWidget()?.camera.frustum as PerspectiveFrustum).fov = fov;
}

export default async function createWalkSession(
  app: VcsUiApp,
  coordsWgs84: number[],
): Promise<WalkSession> {
  const stopped = new VcsEvent<void>();
  const relativeHeight = ref(1.6);
  const originalFov = (
    (app.maps.activeMap as CesiumMap).getCesiumWidget()?.camera
      .frustum as PerspectiveFrustum
  ).fov;

  await jumpToFirstPersonView(app, coordsWgs84, relativeHeight.value);

  let stop = (): void => {};

  const releaseMapControls = app.maps.requestExclusiveMapControls(
    { apiCalls: true, keyEvents: true, pointerEvents: true },
    () => {
      stop();
    },
  );
  const destroyNavigationControls = setupNavigationControls(
    app,
    relativeHeight,
  );

  const removeMapListener = app.maps.mapActivated.addEventListener(() => {
    stop();
  });

  stop = (): void => {
    removeMapListener();
    destroyNavigationControls();
    releaseMapControls();
    resetFov(app, originalFov);
    stopped.raiseEvent();
    stopped.destroy();
    stop = (): void => {};
  };

  return {
    stop,
    stopped,
    relativeHeight,
  };
}
