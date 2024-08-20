<template>
  <v-sheet>
    <VcsHelp>
      <ul>
        <li>{{ $t('walk.navigation.move') }}</li>
        <li>{{ $t('walk.navigation.boost') }}</li>
        <li>{{ $t('walk.navigation.look') }}</li>
      </ul>
    </VcsHelp>
    <v-divider />
    <v-container class="px-1 pt-0 pb-2">
      <v-row no-gutters>
        <v-col>
          <VcsLabel html-for="walk-viewing-height">{{
            $t('walk.viewingHeight')
          }}</VcsLabel>
        </v-col>
        <v-col cols="4">
          <VcsTextField
            id="walk-viewing-height"
            type="number"
            unit="m"
            placeholder="0"
            min="0.1"
            max="10000"
            step="0.1"
            v-model.number="viewHeight"
          />
        </v-col>
      </v-row>
      <v-row no-gutters class="pr-1">
        <v-col>
          <VcsLabel html-for="walk-viewing-angle">{{
            $t('walk.viewingAngle')
          }}</VcsLabel>
        </v-col>
        <v-col class="d-flex justify-end align-center">
          <span>{{ `${Math.round(fov)} °` }}</span>
        </v-col>
      </v-row>
      <v-row no-gutters>
        <v-col>
          <VcsSlider v-model="fov" min="35" max="85" step="1" />
        </v-col>
      </v-row>
      <v-row no-gutters class="pr-1">
        <v-col>
          <VcsLabel html-for="walk-heading">{{
            $t('components.viewpoint.heading')
          }}</VcsLabel>
        </v-col>
        <v-col class="d-flex justify-end align-center">
          <span>{{ `${heading} °` }}</span>
        </v-col>
      </v-row>
      <v-row no-gutters>
        <v-col>
          <VcsSlider v-model="heading" min="1" max="360" />
        </v-col>
      </v-row>
      <v-row no-gutters class="pr-1">
        <v-col>
          <VcsLabel html-for="walk-pitch">{{
            $t('components.viewpoint.pitch')
          }}</VcsLabel>
        </v-col>
        <v-col class="d-flex justify-end align-center">
          <span>{{ `${pitch} °` }}</span>
        </v-col>
      </v-row>
      <v-row no-gutters>
        <v-col>
          <VcsSlider v-model="pitch" :min="minPitch" :max="maxPitch" />
        </v-col>
      </v-row>
    </v-container>
    <v-divider />
    <v-container class="px-2 pt-2 pb-1">
      <v-row no-gutters>
        <v-col class="d-flex justify-end">
          <VcsFormButton variant="filled" @click="stop" tooltip="walk.stopMode">
            {{ $t('walk.stop') }}
          </VcsFormButton>
        </v-col>
      </v-row>
    </v-container>
  </v-sheet>
</template>

<script lang="ts">
  import {
    VcsLabel,
    VcsTextField,
    VcsUiApp,
    VcsFormButton,
    VcsSlider,
    VcsHelp,
  } from '@vcmap/ui';
  import {
    computed,
    defineComponent,
    inject,
    onUnmounted,
    ref,
    watch,
  } from 'vue';
  import { VCol, VContainer, VRow, VSheet, VDivider } from 'vuetify/components';
  import { CesiumMap } from '@vcmap/core';
  import type { VcsMap } from '@vcmap/core';
  import { PerspectiveFrustum, Math as CesiumMath } from '@vcmap-cesium/engine';
  import type { WalkPlugin } from './index.js';
  import { name } from '../package.json';
  import {
    calcRelativeHeight,
    maxPitch as maxRadPitch,
    minPitch as minRadPitch,
  } from './setupNavigationControls.js';

  function updateHeight(app: VcsUiApp, newHeight: number): void {
    const cesiumMap = app.maps.activeMap as CesiumMap;
    const camera = cesiumMap.getCesiumWidget()?.camera;
    const globe = cesiumMap.getScene()?.globe;
    if (!camera || !globe) {
      return;
    }
    const currentRelativeHeight = calcRelativeHeight(globe, camera);
    camera.moveUp(newHeight - currentRelativeHeight);
  }

  export default defineComponent({
    name: 'WalkWindow',
    components: {
      VcsLabel,
      VcsTextField,
      VcsFormButton,
      VcsSlider,
      VcsHelp,
      VCol,
      VContainer,
      VRow,
      VSheet,
      VDivider,
    },
    setup() {
      const app = inject('vcsApp') as VcsUiApp;
      const plugin = app.plugins.getByKey(name) as WalkPlugin;

      const frustum = (app.maps.activeMap as CesiumMap).getCesiumWidget()
        ?.camera.frustum as PerspectiveFrustum;
      const fov = ref(frustum.fov * CesiumMath.DEGREES_PER_RADIAN);

      watch(fov, () => {
        frustum.fov = fov.value / CesiumMath.DEGREES_PER_RADIAN;
      });

      const headingRef = ref(0);
      const pitchRef = ref(0);

      function handleRenderEvent({ map }: { map: VcsMap }): void {
        const camera = (map as CesiumMap).getCesiumWidget()?.camera;
        if (camera) {
          headingRef.value = camera.heading * CesiumMath.DEGREES_PER_RADIAN;
          pitchRef.value = camera.pitch * CesiumMath.DEGREES_PER_RADIAN;
        }
      }
      if (app.maps.activeMap) {
        handleRenderEvent({ map: app.maps.activeMap });
      }
      const removePostRenderListener =
        app.maps.postRender.addEventListener(handleRenderEvent);

      onUnmounted(() => {
        removePostRenderListener();
      });

      return {
        viewHeight: computed({
          get(): number | undefined {
            return plugin.walkSession?.relativeHeight.value;
          },
          set(value: number | undefined) {
            const relativeHeight = plugin.walkSession?.relativeHeight;
            if (value && relativeHeight) {
              relativeHeight.value = value;
              updateHeight(app, value);
            }
          },
        }),
        fov,
        heading: computed({
          get(): number {
            return Math.round(headingRef.value);
          },
          set(value: number) {
            const camera = (app.maps.activeMap as CesiumMap).getCesiumWidget()
              ?.camera;
            if (camera) {
              camera.setView({
                orientation: {
                  heading: value / CesiumMath.DEGREES_PER_RADIAN,
                  pitch: camera.pitch,
                  roll: 0,
                },
              });
            }
          },
        }),
        pitch: computed({
          get(): number {
            return Math.round(pitchRef.value);
          },
          set(value: number) {
            const camera = (app.maps.activeMap as CesiumMap).getCesiumWidget()
              ?.camera;
            if (camera) {
              camera.setView({
                orientation: {
                  heading: camera.heading,
                  pitch: value / CesiumMath.DEGREES_PER_RADIAN,
                  roll: 0,
                },
              });
            }
          },
        }),
        async stop(): Promise<void> {
          await plugin.stopWalkSession();
        },
        maxPitch: maxRadPitch * CesiumMath.DEGREES_PER_RADIAN,
        minPitch: minRadPitch * CesiumMath.DEGREES_PER_RADIAN,
      };
    },
  });
</script>
