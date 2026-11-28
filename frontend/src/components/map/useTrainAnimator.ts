import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { TrainKinematicState } from '../../types/corridor';
import { wsClient } from '../../services/wsClient';
import { useRailStore } from '../../stores/useRailStore';
import { snapPointToTrack } from '../../services/corridorData';

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
  currentStation?: string | null;
  nextStation?: string | null;
  status?: string | null;
}

export function useTrainAnimator(mapRef: React.RefObject<MapLibreMap | null>) {
  const trainStateMap = useRef<Map<string, AnimatedTrainState>>(new Map());
  const animFrameId = useRef<number | null>(null);
  const needsRenderRef = useRef<boolean>(true);
  const activeCorridorId = useRailStore((state) => state.activeCorridorId);
  const lastCorridorIdRef = useRef<string>(activeCorridorId);

  // Clear animated trains cache when corridor switches to prevent cross-corridor ghost markers
  useEffect(() => {
    if (lastCorridorIdRef.current !== activeCorridorId) {
      trainStateMap.current.clear();
      needsRenderRef.current = true;
      lastCorridorIdRef.current = activeCorridorId;
    }
  }, [activeCorridorId]);

  const snapshotTrains = useRailStore((state) => state.activeSnapshot?.trains);

  // 1. Pre-populate and synchronize strictly from activeSnapshot (initial load + HTTP fallback + resets)
  useEffect(() => {
    const now = performance.now();
    const allTrains = snapshotTrains || [];

    const validTrainNos = new Set(allTrains.map((t) => t.train_no));
    for (const key of trainStateMap.current.keys()) {
      if (!validTrainNos.has(key)) {
        trainStateMap.current.delete(key);
        needsRenderRef.current = true;
      }
    }

    for (const t of allTrains) {
      if (t.lat == null || t.lon == null) continue;
      const [snappedLon, snappedLat] = snapPointToTrack(t.lon, t.lat);
      const existing = trainStateMap.current.get(t.train_no);

      if (!existing) {
        trainStateMap.current.set(t.train_no, {
          fromLat: snappedLat,
          fromLon: snappedLon,
          toLat: snappedLat,
          toLon: snappedLon,
          startEpoch: now,
          durationMs: 1500,
          currentLat: snappedLat,
          currentLon: snappedLon,
          speedKmph: t.speed_kmph ?? 0,
          trainNo: t.train_no,
          trainName: t.train_name,
          delayMins: t.current_delay_mins ?? 0,
          currentStation: t.current_station,
          nextStation: t.next_station,
          status: t.status,
        });
        needsRenderRef.current = true;
      } else if (!wsClient.isLiveConnected()) {
        // Sync store/HTTP updates when WebSocket is disconnected
        const moved = Math.hypot(existing.toLat - snappedLat, existing.toLon - snappedLon);
        if (moved > 1e-6) {
          if (moved > 0.15) {
            existing.currentLat = snappedLat;
            existing.currentLon = snappedLon;
            existing.fromLat = snappedLat;
            existing.fromLon = snappedLon;
          } else {
            existing.fromLat = existing.currentLat;
            existing.fromLon = existing.currentLon;
          }
          existing.toLat = snappedLat;
          existing.toLon = snappedLon;
          existing.startEpoch = now;
          existing.durationMs = 1500;
        }
        existing.speedKmph = t.speed_kmph ?? 0;
        existing.delayMins = t.current_delay_mins ?? 0;
        existing.currentStation = t.current_station;
        existing.nextStation = t.next_station;
        existing.status = t.status;
        needsRenderRef.current = true;
      }
    }
  }, [snapshotTrains, activeCorridorId]);

  // 2. Subscribe to authoritative live WebSocket train coordinates
  useEffect(() => {
    const unsubscribe = wsClient.subscribeCoords((trains: TrainKinematicState[]) => {
      const now = performance.now();

      const activeNos = new Set(trains.map((t) => t.train_no));
      for (const key of trainStateMap.current.keys()) {
        if (!activeNos.has(key)) {
          trainStateMap.current.delete(key);
        }
      }

      for (const t of trains) {
        if (t.lat == null || t.lon == null) continue;
        const [snappedLon, snappedLat] = snapPointToTrack(t.lon, t.lat);

        const existing = trainStateMap.current.get(t.train_no);
        if (existing) {
          const deltaJump = Math.hypot(
            existing.currentLat - snappedLat,
            existing.currentLon - snappedLon
          );
          // If delta exceeds ~17 km (e.g. corridor switch, reset, or teleport), snap immediately without gliding
          if (deltaJump > 0.15) {
            existing.currentLat = snappedLat;
            existing.currentLon = snappedLon;
            existing.fromLat = snappedLat;
            existing.fromLon = snappedLon;
          } else {
            existing.fromLat = existing.currentLat;
            existing.fromLon = existing.currentLon;
          }
          existing.toLat = snappedLat;
          existing.toLon = snappedLon;
          existing.startEpoch = now;
          existing.durationMs = 1500; // 1.5s broadcast window
          existing.speedKmph = t.speed_kmph;
          existing.delayMins = t.current_delay_mins;
          existing.currentStation = t.current_station;
          existing.nextStation = t.next_station;
          existing.status = t.status;
        } else {
          trainStateMap.current.set(t.train_no, {
            fromLat: snappedLat,
            fromLon: snappedLon,
            toLat: snappedLat,
            toLon: snappedLon,
            startEpoch: now,
            durationMs: 1500,
            currentLat: snappedLat,
            currentLon: snappedLon,
            speedKmph: t.speed_kmph,
            trainNo: t.train_no,
            trainName: t.train_name,
            delayMins: t.current_delay_mins,
            currentStation: t.current_station,
            nextStation: t.next_station,
            status: t.status,
          });
        }
      }
      needsRenderRef.current = true;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 3. 60 FPS requestAnimationFrame interpolation strictly driven by received coordinates
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let lastRenderedSelectedTrain: string | null = null;
    let isSettled = false;

    const loop = (now: number) => {
      const map = mapRef.current;
      // Query trains-source directly so background OSM tile fetches never stall train updates
      const source = map?.getSource('trains-source') as any;

      if (source && typeof source.setData === 'function') {
        const selectedTrain = useRailStore.getState().selectedTrain;
        const selectedTrainChanged = selectedTrain !== lastRenderedSelectedTrain;

        let hasActiveMotion = false;
        for (const [_, state] of trainStateMap.current) {
          const elapsed = now - state.startEpoch;
          if (
            elapsed < state.durationMs &&
            (state.fromLat !== state.toLat || state.fromLon !== state.toLon)
          ) {
            hasActiveMotion = true;
            break;
          }
        }

        if (hasActiveMotion || selectedTrainChanged || !isSettled || needsRenderRef.current) {
          const features = [];

          for (const [_, state] of trainStateMap.current) {
            if (prefersReducedMotion) {
              state.currentLat = state.toLat;
              state.currentLon = state.toLon;
            } else {
              const elapsed = now - state.startEpoch;
              const progress = Math.min(1, Math.max(0, elapsed / state.durationMs));
              const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);

              state.currentLat = state.fromLat + (state.toLat - state.fromLat) * ease;
              state.currentLon = state.fromLon + (state.toLon - state.fromLon) * ease;
            }

            const [renderLon, renderLat] = snapPointToTrack(state.currentLon, state.currentLat);

            features.push({
              type: 'Feature' as const,
              properties: {
                train_no: state.trainNo,
                train_name: state.trainName,
                speed_kmph: Math.round(state.speedKmph),
                delay_mins: Math.round(state.delayMins),
                is_target: state.trainNo === selectedTrain,
                current_station: state.currentStation,
                next_station: state.nextStation,
                status: state.status,
              },
              geometry: {
                type: 'Point' as const,
                coordinates: [renderLon, renderLat],
              },
            });
          }

          source.setData({
            type: 'FeatureCollection',
            features,
          });

          lastRenderedSelectedTrain = selectedTrain;
          isSettled = !hasActiveMotion;
          needsRenderRef.current = false;
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
