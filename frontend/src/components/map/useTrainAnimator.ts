import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { TrainKinematicState } from '../../types/corridor';
import { wsClient } from '../../services/wsClient';
import { useRailStore } from '../../stores/useRailStore';

interface AnimatedTrainState {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  startEpoch: number;
  durationMs: number;
  currentLat: number;
  currentLon: number;
  speedKmph: number;
  trainNo: string;
  trainName: string;
  delayMins: number;
}

export function useTrainAnimator(mapRef: React.RefObject<MapLibreMap | null>) {
  const trainStateMap = useRef<Map<string, AnimatedTrainState>>(new Map());
  const animFrameId = useRef<number | null>(null);

  // Subscribe to live WebSocket train coordinates
  useEffect(() => {
    const unsubscribe = wsClient.subscribeCoords((trains: TrainKinematicState[]) => {
      const now = performance.now();

      for (const t of trains) {
        if (t.lat == null || t.lon == null) continue;

        const existing = trainStateMap.current.get(t.train_no);
        if (existing) {
          existing.fromLat = existing.currentLat;
          existing.fromLon = existing.currentLon;
          existing.toLat = t.lat;
          existing.toLon = t.lon;
          existing.startEpoch = now;
          existing.durationMs = 1500; // 1.5s WS broadcast interval
          existing.speedKmph = t.speed_kmph;
          existing.delayMins = t.current_delay_mins;
        } else {
          trainStateMap.current.set(t.train_no, {
            fromLat: t.lat,
            fromLon: t.lon,
            toLat: t.lat,
            toLon: t.lon,
            startEpoch: now,
            durationMs: 1500,
            currentLat: t.lat,
            currentLon: t.lon,
            speedKmph: t.speed_kmph,
            trainNo: t.train_no,
            trainName: t.train_name,
            delayMins: t.current_delay_mins,
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 60 FPS requestAnimationFrame render loop
  useEffect(() => {
    const loop = (now: number) => {
      const map = mapRef.current;
      if (map && map.isStyleLoaded()) {
        const source = map.getSource('trains-source') as any;
        if (source && typeof source.setData === 'function') {
          const features = [];

          for (const [_, state] of trainStateMap.current) {
            const elapsed = now - state.startEpoch;
            const progress = Math.min(1, Math.max(0, elapsed / state.durationMs));

            // Smooth cosine easing
            const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);

            state.currentLat = state.fromLat + (state.toLat - state.fromLat) * ease;
            state.currentLon = state.fromLon + (state.toLon - state.fromLon) * ease;

            features.push({
              type: 'Feature' as const,
              properties: {
                train_no: state.trainNo,
                train_name: state.trainName,
                speed_kmph: Math.round(state.speedKmph),
                delay_mins: Math.round(state.delayMins),
                is_target: state.trainNo === useRailStore.getState().selectedTrain,
              },
              geometry: {
                type: 'Point' as const,
                coordinates: [state.currentLon, state.currentLat],
              },
            });
          }

          source.setData({
            type: 'FeatureCollection',
            features,
          });
        }
      }

      animFrameId.current = requestAnimationFrame(loop);
    };

    animFrameId.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
      }
    };
  }, [mapRef]);
}
