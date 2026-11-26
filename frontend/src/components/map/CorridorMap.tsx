import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import maplibregl, { type Map as MapLibreMap, type Popup as MapLibrePopup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTrainAnimator } from './useTrainAnimator';
import { MapLegend } from './MapLegend';
import { fetchCorridorConfig } from '../../services/api';
import { useRailStore } from '../../stores/useRailStore';
import { SMOOTH_TRACK_COORDS, snapPointToTrack } from '../../services/corridorData';
import {
  getDelayCauses,
  getStationRelevance,
  getArrivalPrediction,
  evaluateLogicalConnection,
  formatTime12Hour,
} from '../dashboard/passengerUtils';
import {
  STATIONS,
  CAMERA_PRESETS,
  createBaseMapStyle,
  type MapCameraView,
} from './mapConstants';
import {
  getGoodsTrainPopupHtml,
  getTrainPopupHtml,
  getStationPopupHtml,
  getDelayDetailPopupHtml,
} from './mapPopupTemplates';
import { initCorridorMapLayers, updateRouteLineGeometry } from './mapLayers';
import {
  Train,
  AlertTriangle,
  Car,
  Maximize2,
  LocateFixed,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface CorridorMapProps {
  isModal?: boolean;
}

export const CorridorMap: React.FC<CorridorMapProps> = ({ isModal = false }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activePopupRef = useRef<MapLibrePopup | null>(null);
  const popupTimeoutRef = useRef<number | null>(null);

  const clearPopupTimeout = useCallback(() => {
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
      popupTimeoutRef.current = null;
    }
  }, []);

  // Trigger map resize on mount and after render frame for modal transitions
  useEffect(() => {
    const t1 = setTimeout(() => {
      mapRef.current?.resize();
    }, 60);
    const t2 = setTimeout(() => {
      mapRef.current?.resize();
    }, 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const {
    selectedTrain,
    setSelectedTrain,
    activeSnapshot,
    forecast,
    rescue,
    passengerStatus,
    activeMapView,
    setActiveMapView,
    selectedDelayId,
    setSelectedDelayId,
    connectionTarget,
  } = useRailStore();

  // Synchronize 60 FPS GPU vector animator
  useTrainAnimator(mapRef);

  // Authoritative current train from store
  const currentTrain = useMemo(() => {
    return (
      activeSnapshot.trains.find((t) => t.train_no === selectedTrain) ||
      activeSnapshot.trains[0]
    );
  }, [activeSnapshot.trains, selectedTrain]);

  const trainKm = currentTrain?.chainage_km ?? 115.0;

  // Connection evaluation for journey status synchronization
  const prediction = getArrivalPrediction(selectedTrain, forecast);
  const connectionDeadlineFormatted = formatTime12Hour(connectionTarget?.deadline_time);

  const connectionEval = evaluateLogicalConnection(
    prediction.expectedTime,
    prediction.worstCaseTime,
    connectionDeadlineFormatted,
    connectionTarget?.transfer_buffer_mins || 15
  );

  const isRescueAvailable =
    connectionEval.status === 'at_risk' &&
    passengerStatus === 'ON_BOARD' &&
    (rescue?.bailout_recommended || (rescue?.survival_probability_pct ?? 34) < 40);

  // Split route coordinates: Completed (muted) vs Remaining (prominent navy)
  const { completedCoords, remainingCoords } = useMemo(() => {
    const totalKm = 206.0;
    const safeKm = Number.isFinite(trainKm) ? trainKm : 115.0;
    const progressRatio = Math.min(1, Math.max(0, safeKm / totalKm));
    const maxIdx = Math.max(0, SMOOTH_TRACK_COORDS.length - 1);
    const splitIndex = Math.min(maxIdx, Math.max(0, Math.floor(progressRatio * maxIdx)));

    if (currentTrain?.direction === 'UP') {
      return {
        completedCoords: SMOOTH_TRACK_COORDS.slice(splitIndex),
        remainingCoords: SMOOTH_TRACK_COORDS.slice(0, splitIndex + 1),
      };
    }

    return {
      completedCoords: SMOOTH_TRACK_COORDS.slice(0, splitIndex + 1),
      remainingCoords: SMOOTH_TRACK_COORDS.slice(splitIndex),
    };
  }, [trainKm, currentTrain?.direction]);

  // Clean close any active popup
  const closeActivePopup = useCallback(() => {
    clearPopupTimeout();
    if (activePopupRef.current) {
      activePopupRef.current.remove();
      activePopupRef.current = null;
    }
  }, [clearPopupTimeout]);

  // Anchors popup to the left (west) of the track so the train marker is never blocked
  const openGoodsTrainPopup = useCallback(
    (map: MapLibreMap) => {
      closeActivePopup();
      const popup = new maplibregl.Popup({
        anchor: 'right',
        offset: [-16, 0],
        closeButton: true,
        maxWidth: '320px',
      })
        .setLngLat([85.856, 20.431])
        .setHTML(getGoodsTrainPopupHtml())
        .addTo(map);

      activePopupRef.current = popup;
    },
    [closeActivePopup]
  );

  // Direct camera view handler triggered on button click or track click
  const handleCameraView = useCallback(
    (view: MapCameraView) => {
      setActiveMapView(view);
      const map = mapRef.current;
      if (!map) return;

      closeActivePopup();
      const preset = CAMERA_PRESETS[view];

      if (view === 'delays_ahead') {
        setSelectedDelayId('cause-2');
        map.fitBounds(preset.bounds, { padding: preset.padding, duration: preset.duration });
        clearPopupTimeout();
        popupTimeoutRef.current = window.setTimeout(() => {
          if (!mapRef.current) return;
          openGoodsTrainPopup(mapRef.current);
        }, 200);
      } else if (view === 'alternative_route') {
        ['nh16-highway-casing', 'nh16-highway-line', 'nh16-highway-badge'].forEach((layerId) => {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', 'visible');
          }
        });
        map.fitBounds(preset.bounds, { padding: preset.padding, duration: preset.duration });
      } else {
        setSelectedDelayId(null);
        map.fitBounds(preset.bounds, { padding: preset.padding, duration: preset.duration });
      }
    },
    [closeActivePopup, openGoodsTrainPopup, setActiveMapView, setSelectedDelayId]
  );

  // Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    fetchCorridorConfig()
      .then((cfg) => {
        if (isCancelled || !mapContainerRef.current || mapRef.current) return;

        const baseStyle = createBaseMapStyle(cfg.mapbox_access_token);
        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: baseStyle,
          center: [85.8829, 20.4625],
          zoom: 9.8,
          attributionControl: false,
        });

        mapRef.current = map;

        // Auto-resize observer
        resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        if (mapContainerRef.current) {
          resizeObserver.observe(mapContainerRef.current);
        }

        map.on('load', () => {
          // Default initial view: Nergundi Jn -> Cuttack Jn -> Barang Jn -> Bhubaneswar
          const defaultPreset = CAMERA_PRESETS.my_train;
          map.fitBounds(defaultPreset.bounds, {
            padding: defaultPreset.padding,
            duration: defaultPreset.duration,
          });

          // Prepare Station GeoJSON
          const isUp = currentTrain?.direction === 'UP' || selectedTrain === '18410';
          const safeTrainKm = Number.isFinite(trainKm) ? trainKm : 115.0;

          const stationFeatures = STATIONS.map((stn) => {
            const isPassed = isUp ? stn.km > safeTrainKm + 4 : safeTrainKm > stn.km + 4;
            const isCurrent = Math.abs(stn.km - safeTrainKm) <= 6;
            const relevance = getStationRelevance(
              stn.code,
              selectedTrain,
              isRescueAvailable,
              isPassed,
              isCurrent
            );

            return {
              type: 'Feature' as const,
              properties: {
                code: stn.code,
                name: stn.name,
                km: stn.km,
                is_destination: stn.code === 'BBS',
                is_rescue_transfer: stn.code === 'CTC',
                is_current: isCurrent,
                is_passed: isPassed,
                role_badge: relevance.roleBadge,
                explanation: relevance.relevanceExplanation,
              },
              geometry: {
                type: 'Point' as const,
                coordinates: stn.coords,
              },
            };
          });

          // Prepare Initial Trains GeoJSON
          const initialTrainFeatures = activeSnapshot.trains.map((t) => {
            const rawLon = t.lon ?? 85.8829;
            const rawLat = t.lat ?? 20.4625;
            const [snappedLon, snappedLat] = snapPointToTrack(rawLon, rawLat);
            return {
              type: 'Feature' as const,
              properties: {
                train_no: t.train_no,
                train_name: t.train_name,
                speed_kmph: t.speed_kmph ?? 0,
                delay_mins: t.current_delay_mins ?? 0,
                is_target: t.train_no === selectedTrain,
                current_station: t.current_station,
                next_station: t.next_station,
              },
              geometry: {
                type: 'Point' as const,
                coordinates: [snappedLon, snappedLat],
              },
            };
          });

          // Initialize modular map layers
          initCorridorMapLayers(
            map,
            completedCoords,
            remainingCoords,
            isRescueAvailable,
            stationFeatures,
            initialTrainFeatures
          );

          // Train click handler
          map.on('click', 'trains-point', (e) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties as any;
            const coords = (e.features[0].geometry as any).coordinates.slice();

            closeActivePopup();

            const popupHtml = getTrainPopupHtml({
              train_no: props.train_no,
              train_name: props.train_name,
              delay_mins: props.delay_mins,
              speed_kmph: props.speed_kmph,
              current_station: props.current_station,
              next_station: props.next_station,
              is_target: props.is_target,
            });

            const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
              .setLngLat(coords)
              .setHTML(popupHtml)
              .addTo(map);

            activePopupRef.current = popup;

            // Wire up "Track this train" button inside popup
            const safeTrainId = String(props.train_no).replace(/[^a-zA-Z0-9_-]/g, '');
            setTimeout(() => {
              const btn = document.getElementById(`btn-track-${safeTrainId}`);
              if (btn) {
                btn.onclick = () => {
                  setSelectedTrain(props.train_no);
                  popup.remove();
                };
              }
            }, 50);
          });

          // Station click handler
          map.on('click', 'station-circles', (e) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties as any;
            const coords = (e.features[0].geometry as any).coordinates.slice();

            closeActivePopup();

            const popupHtml = getStationPopupHtml(
              {
                name: props.name,
                code: props.code,
                km: props.km,
                role_badge: props.role_badge,
                explanation: props.explanation,
              },
              prediction
            );

            const popup = new maplibregl.Popup({ offset: 10, closeButton: true })
              .setLngLat(coords)
              .setHTML(popupHtml)
              .addTo(map);

            activePopupRef.current = popup;
          });

          // Change cursor to pointer over interactive layers
          [
            'trains-point',
            'station-circles',
            'freight-hazard-core',
            'freight-hazard-casing',
            'freight-badge-layer',
          ].forEach((layerId) => {
            map.on('mouseenter', layerId, () => {
              map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', layerId, () => {
              map.getCanvas().style.cursor = '';
            });
          });

          // Direct click on delay hazard on map triggers Delays Ahead view
          [
            'freight-hazard-core',
            'freight-hazard-casing',
            'freight-badge-layer',
          ].forEach((layerId) => {
            map.on('click', layerId, () => {
              handleCameraView('delays_ahead');
            });
          });
        });
      })
      .catch((err) => {
        console.warn('Map initialization error:', err);
      });

    return () => {
      isCancelled = true;
      clearPopupTimeout();
      resizeObserver?.disconnect();
      closeActivePopup();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Run on mount

  // Update track completed vs remaining geometry when train advances
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateRouteLineGeometry(map, completedCoords, remainingCoords);
  }, [completedCoords, remainingCoords]);

  // Synchronize NH-16 Rescue route visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const shouldShowRescue = isRescueAvailable || activeMapView === 'alternative_route';
    const visibility = shouldShowRescue ? 'visible' : 'none';

    ['nh16-highway-casing', 'nh16-highway-line', 'nh16-highway-badge'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }, [isRescueAvailable, activeMapView]);

  // Synchronize phantom freight slow-zone visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasActiveFreight =
      (activeSnapshot.phantom_freights?.length ?? 0) > 0 || activeMapView === 'delays_ahead';
    const visibility = hasActiveFreight ? 'visible' : 'none';

    ['freight-hazard-casing', 'freight-hazard-core', 'freight-badge-layer'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }, [activeSnapshot.phantom_freights, activeMapView]);

  // Keep latest train coordinates in a ref so WebSocket ticks never hijack manual zoom/pan
  const currentTrainRef = useRef(currentTrain);
  currentTrainRef.current = currentTrain;

  // Synchronize Map Camera with activeMapView ONLY when view mode or selected train changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const trainSnapshot = currentTrainRef.current;
    if (activeMapView === 'my_train') {
      closeActivePopup();
      if (trainSnapshot && trainSnapshot.lon && trainSnapshot.lat && selectedTrain !== '12821') {
        map.flyTo({
          center: [trainSnapshot.lon, trainSnapshot.lat],
          zoom: 12.2,
          speed: 1.2,
          duration: 600,
        });
      } else {
        const defaultPreset = CAMERA_PRESETS.my_train;
        map.fitBounds(defaultPreset.bounds, {
          padding: defaultPreset.padding,
          duration: defaultPreset.duration,
        });
      }
    } else {
      const preset = CAMERA_PRESETS[activeMapView];
      if (preset) {
        closeActivePopup();
        map.fitBounds(preset.bounds, { padding: preset.padding, duration: preset.duration });
      }
    }
  }, [activeMapView, selectedTrain, closeActivePopup]);

  // Synchronize Delay Inspection between Left Dashboard and Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDelayId) return;

    closeActivePopup();

    if (selectedDelayId === 'cause-2') {
      map.flyTo({
        center: [85.856, 20.431],
        zoom: 12.2,
        speed: 1.2,
        duration: 800,
      });

      clearPopupTimeout();
      popupTimeoutRef.current = window.setTimeout(() => {
        if (!mapRef.current) return;
        openGoodsTrainPopup(mapRef.current);
      }, 250);
    } else {
      const causes = getDelayCauses(selectedTrain, forecast, currentTrain?.current_station);
      const activeCause = causes.find((c) => c.id === selectedDelayId);

      const targetCoords = activeCause?.coordinates || [85.856, 20.431];
      const displayTag = activeCause?.tag || 'Active Factor';
      const displayTitle = activeCause?.title || 'Delay Ahead';
      const displayLocation = activeCause?.locationName || 'En Route Section';
      const displayMessage =
        activeCause?.explanation || 'Active operational factor causing travel drag ahead.';

      map.flyTo({
        center: targetCoords,
        zoom: 12.0,
        speed: 1.2,
        duration: 800,
      });

      const popupHtml = getDelayDetailPopupHtml(
        displayTag,
        displayTitle,
        displayLocation,
        displayMessage
      );

      clearPopupTimeout();
      popupTimeoutRef.current = window.setTimeout(() => {
        if (!mapRef.current) return;
        const popup = new maplibregl.Popup({
          anchor: 'right',
          offset: [-16, 0],
          closeButton: true,
          maxWidth: '320px',
        })
          .setLngLat(targetCoords)
          .setHTML(popupHtml)
          .addTo(mapRef.current);

        activePopupRef.current = popup;
      }, 150);
    }
  }, [
    selectedDelayId,
    selectedTrain,
    forecast,
    currentTrain?.current_station,
    closeActivePopup,
    openGoodsTrainPopup,
  ]);

  return (
    <div
      className={`relative w-full h-full bg-[#FAF9F6] overflow-hidden ${
        isModal
          ? 'rounded-none border-0'
          : 'min-h-[500px] rounded-2xl border border-[#E5E7EB] shadow-xs'
      }`}
    >
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Top-Right: Passenger Map Controls */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 pointer-events-auto items-end">
        {/* Mode Switcher */}
        <div className="backdrop-blur-md bg-white/95 p-1 rounded-xl border border-[#E2E8F0] shadow-md flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleCameraView('my_train')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMapView === 'my_train'
                ? 'bg-[#0F294A] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Focus on your selected passenger train"
          >
            <Train className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">My Train</span>
          </button>

          <button
            type="button"
            onClick={() => handleCameraView('delays_ahead')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMapView === 'delays_ahead'
                ? 'bg-[#0F294A] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Inspect congestion and delays ahead"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delays Ahead</span>
          </button>

          <button
            type="button"
            onClick={() => handleCameraView('alternative_route')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMapView === 'alternative_route'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'text-emerald-800 hover:bg-emerald-50'
            }`}
            title="Compare NH-16 highway alternative route"
          >
            <Car className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cab Bypass</span>
          </button>

          <button
            type="button"
            onClick={() => handleCameraView('full_journey')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMapView === 'full_journey'
                ? 'bg-[#0F294A] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Fit full corridor (Bhadrak to Puri)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Full Journey</span>
          </button>
        </div>

        {/* Camera Navigation Buttons */}
        <div className="backdrop-blur-md bg-white/95 p-1 rounded-xl border border-[#E2E8F0] shadow-md flex flex-col gap-1">
          <button
            type="button"
            onClick={() => handleCameraView('my_train')}
            title="Center on My Train"
            className="p-1.5 text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <LocateFixed className="w-4 h-4 text-orange-600" />
          </button>
          <div className="h-px bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            title="Zoom In"
            className="p-1.5 text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            title="Zoom Out"
            className="p-1.5 text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contextual Clean Map Legend */}
      <MapLegend />
    </div>
  );
};
