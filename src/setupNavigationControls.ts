import {
  KeyboardEventModifier,
  Cartographic,
  Cartesian3,
  Clock,
  Camera,
  Globe,
  Cartesian2,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  Math as CesiumMath,
} from '@vcmap-cesium/engine';
import { CesiumMap, Projection } from '@vcmap/core';
import { VcsUiApp } from '@vcmap/ui';
import { Ref } from 'vue';

export type PointerInput = {
  startPosition: Cartesian2;
  position: Cartesian2;
  leftDown: boolean;
};

export const maxPitch = 85 / CesiumMath.DEGREES_PER_RADIAN;
export const minPitch = -maxPitch;

function calcFpsCorrection(timeLastTick: number, currentTime: number): number {
  let timeDifference = timeLastTick ? currentTime - timeLastTick : 1 / 60;
  if (timeDifference <= 0 || timeDifference > 1) {
    timeDifference = 1 / 60;
  }
  return timeDifference / (1 / 60);
}

function updateHeight(
  camera: Camera,
  mapRelativeHeight: number,
  settingsRelativeHeight: number,
): void {
  const difference = Number(
    (settingsRelativeHeight - mapRelativeHeight).toFixed(2),
  );
  if (difference !== 0) {
    camera.moveUp(difference);
  }
}

export function calcRelativeHeight(globe: Globe, camera: Camera): number {
  const cameraHeight = globe.ellipsoid.cartesianToCartographic(
    camera.position,
  ).height;
  const groundLevel =
    globe.getHeight(globe.ellipsoid.cartesianToCartographic(camera.position)) ||
    0;
  return cameraHeight - groundLevel;
}

function clockTickHandler(
  cesiumMap: CesiumMap,
  keysPressed: Set<string>,
  pointerInput: PointerInput,
  timeLastTick: number,
  currentTime: number,
  relativeHeight: number,
): void {
  const cesiumWidget = cesiumMap.getCesiumWidget();
  const scene = cesiumMap.getScene();
  if (!cesiumWidget || !scene) {
    return;
  }
  const { canvas, camera } = cesiumWidget;
  const shareToAngleFactor = 0.05;
  const heightToMoveAmountFactor = 1 / 30;
  const accelerateFactor = 5;

  const fpsCorrection = calcFpsCorrection(timeLastTick, currentTime);

  if (pointerInput.leftDown) {
    const { clientWidth, clientHeight } = canvas;
    const { position, startPosition } = pointerInput;

    /** Distance of current pointer position to the initial/start position on leftDown as share of clientWidth */
    const xShare = (position.x - startPosition.x) / clientWidth;
    /** Distance of current pointer position to the initial/start position on leftDown as share of clientHeight */
    const yShare = -(position.y - startPosition.y) / clientHeight;

    camera.look(camera.position, xShare * shareToAngleFactor * fpsCorrection);
    const yAmount = yShare * shareToAngleFactor * fpsCorrection;
    if (
      camera.pitch + yAmount > minPitch &&
      camera.pitch + yAmount < maxPitch
    ) {
      camera.lookUp(yAmount);
    }
  }

  if (!keysPressed.size) {
    return;
  }

  const currentRelativeHeight = calcRelativeHeight(scene.globe, camera);
  let moveAmount =
    currentRelativeHeight * heightToMoveAmountFactor * fpsCorrection;
  if (keysPressed.has('ShiftLeft')) {
    moveAmount *= accelerateFactor;
  }

  if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) {
    camera.moveForward(moveAmount);
  }
  if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) {
    camera.moveBackward(moveAmount);
  }
  if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) {
    camera.moveLeft(moveAmount);
  }
  if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) {
    camera.moveRight(moveAmount);
  }

  updateHeight(camera, currentRelativeHeight, relativeHeight);
}

export function setupNavigationControls(
  app: VcsUiApp,
  relativeHeight: Ref<number>,
): () => void {
  let timeLastTick: number;
  const keysPressed = new Set<string>();
  const pointerInput: PointerInput = {
    startPosition: new Cartesian2(),
    position: new Cartesian2(),
    leftDown: false,
  };

  const cesiumMap = app.maps.activeMap as CesiumMap;
  const { canvas } = cesiumMap.getCesiumWidget()!;

  function setupMouseControls(): () => void {
    const pointerEventHandler = new ScreenSpaceEventHandler(canvas);

    const leftDownHandler = (event: { position: Cartesian2 }): void => {
      pointerInput.leftDown = true;
      pointerInput.startPosition = Cartesian2.clone(event.position);
      pointerInput.position = pointerInput.startPosition;
    };
    const leftUpHandler = (): void => {
      pointerInput.leftDown = false;
    };
    const mouseMoveHandler = (event: { endPosition: Cartesian2 }): void => {
      pointerInput.position = event.endPosition;
    };

    function setupMouseEventForAllKeyModifiers(
      eventType: ScreenSpaceEventType,
      handler:
        | ScreenSpaceEventHandler.MotionEventCallback
        | ScreenSpaceEventHandler.PositionedEventCallback,
    ): () => void {
      const removeCallbacks: Array<() => void> = [];
      [
        undefined,
        KeyboardEventModifier.SHIFT,
        KeyboardEventModifier.CTRL,
        KeyboardEventModifier.ALT,
      ].forEach(
        (keyModifier) => {
          pointerEventHandler.setInputAction(handler, eventType, keyModifier);
        },
        removeCallbacks.push(() => {
          pointerEventHandler.removeInputAction(eventType);
        }),
      );
      return () => {
        removeCallbacks.forEach((cb) => cb());
      };
    }

    const removeLeftDown = setupMouseEventForAllKeyModifiers(
      ScreenSpaceEventType.LEFT_DOWN,
      leftDownHandler,
    );
    const removeLeftUp = setupMouseEventForAllKeyModifiers(
      ScreenSpaceEventType.LEFT_UP,
      leftUpHandler,
    );
    const removeMouseMove = setupMouseEventForAllKeyModifiers(
      ScreenSpaceEventType.MOUSE_MOVE,
      mouseMoveHandler,
    );

    return () => {
      removeLeftDown();
      removeLeftUp();
      removeMouseMove();
      pointerEventHandler.destroy();
    };
  }

  function setupKeyControls(): () => void {
    const keydownHandler = (event: KeyboardEvent): void => {
      keysPressed.add(event.code);
    };
    const keyupHandler = (event: KeyboardEvent): void => {
      keysPressed.delete(event.code);
    };

    canvas.setAttribute('tabindex', '0'); // needed to put focus on the canvas
    canvas.onclick = (): void => {
      canvas.focus();
    };
    canvas.onblur = (): void => keysPressed.clear();
    canvas.focus();
    canvas.addEventListener('keydown', keydownHandler, false);
    canvas.addEventListener('keyup', keyupHandler, false);

    return () => {
      canvas.removeEventListener('keydown', keydownHandler);
      canvas.removeEventListener('keyup', keyupHandler);
      canvas.onclick = null;
      canvas.onblur = null;
    };
  }

  function setupOverviewListener(): () => void {
    return app.overviewMap.mapClicked.addEventListener((event) => {
      const camera = cesiumMap.getCesiumWidget()?.camera;
      const { position } = event;
      const globe = cesiumMap.getScene()?.globe;
      if (camera && position && globe) {
        const coordsWgs84 = Projection.mercatorToWgs84(position);
        const groundLevel =
          globe.getHeight(
            Cartographic.fromDegrees(coordsWgs84[0], coordsWgs84[1]),
          ) || 0;
        const destination = Cartesian3.fromDegrees(
          coordsWgs84[0],
          coordsWgs84[1],
          groundLevel + relativeHeight.value,
        );
        camera.setView({
          destination,
          orientation: {
            heading: camera.heading,
            pitch: camera.pitch,
            roll: 0,
          },
        });
      }
    });
  }

  const destroyMouseControls = setupMouseControls();
  const destroyKeyControls = setupKeyControls();
  const destoryOnClickListener = cesiumMap
    .getCesiumWidget()
    ?.clock.onTick.addEventListener((clock: Clock) => {
      const time = clock.currentTime.secondsOfDay;
      clockTickHandler(
        cesiumMap,
        keysPressed,
        pointerInput,
        timeLastTick,
        time,
        relativeHeight.value,
      );
      timeLastTick = time;
    });
  const removeOverviewListener = setupOverviewListener();

  return () => {
    destroyMouseControls();
    destroyKeyControls();
    destoryOnClickListener?.();
    removeOverviewListener?.();
  };
}
