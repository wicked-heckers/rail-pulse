import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import maplibregl, { type Map as MapLibreMap, type Popup as MapLibrePopup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTrainAnimator } from './useTrainAnimator';
import { MapLegend } from './MapLegend';
import { fetchCorridorConfig } from '../../services/api';
import { useRailStore } from '../../stores/useRailStore';
import {
  SMOOTH_TRACK_COORDS,
  SMOOTH_NH16_COORDS,
  snapPointToTrack,
} from '../../services/corridorData';
import {
  getStationRelevance,
  getArrivalPrediction,
  evaluateLogicalConnection,
  formatTime12Hour,
} from '../dashboard/passengerUtils';
import {
  STATIONS,
  SER_STATIONS,
  CAMERA_PRESETS,
  SER_CAMERA_PRESETS,
  SMOOTH_HWH_KGP_TRACK_COORDS,
  SMOOTH_KONA_EXPRESSWAY_COORDS,
  createBaseMapStyle,
  type MapCameraView,
} from './mapConstants';
import {
  getGoodsTrainPopupHtml,
  getTrainPopupHtml,
  getStationPopupHtml,
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
    activeCorridorId,
  } = useRailStore();

  const isKolkata = activeCorridorId === 'SER_HWH_KGP';
  const activeTrackCoords = isKolkata ? SMOOTH_HWH_KGP_TRACK_COORDS : SMOOTH_TRACK_COORDS;
  const totalKm = isKolkata ? 115.0 : 206.0;

  // Synchronize 60 FPS GPU vector animator
  useTrainAnimator(mapRef);

  // Authoritative current train from store
  const currentTrain = useMemo(() => {
    return (
      activeSnapshot.trains.find((t) => t.train_no === selectedTrain) ||
      activeSnapshot.trains[0]
    );
  }, [activeSnapshot.trains, selectedTrain]);

  const trainKm = currentTrain?.chainage_km ?? (isKolkata ? 58.0 : 115.0);

  // Connection evaluation for journey status synchronization
  const prediction = getArrivalPrediction(selectedTrain, forecast);
  const predictionRef = useRef(prediction);
  predictionRef.current = prediction;
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
    const safeKm = Number.isFinite(trainKm) ? trainKm : (isKolkata ? 58.0 : 115.0);
    const progressRatio = Math.min(1, Math.max(0, safeKm / totalKm));
    const maxIdx = Math.max(0, activeTrackCoords.length - 1);
    const splitIndex = Math.min(maxIdx, Math.max(0, Math.floor(progressRatio * maxIdx)));

    if (currentTrain?.direction === 'UP') {
      return {
        completedCoords: activeTrackCoords.slice(splitIndex),
        remainingCoords: activeTrackCoords.slice(0, splitIndex + 1),
      };
    }

    return {
      completedCoords: activeTrackCoords.slice(0, splitIndex + 1),
      remainingCoords: activeTrackCoords.slice(splitIndex),
    };
  }, [trainKm, currentTrain?.direction, activeTrackCoords, totalKm, isKolkata]);

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
      const popupCoords: [number, number] = isKolkata ? [87.970, 22.460] : [85.856, 20.431];
      const popup = new maplibregl.Popup({
        anchor: 'right',
        offset: [-16, 0],
        closeButton: true,
        maxWidth: '320px',
      })
        .setLngLat(popupCoords)
        .setHTML(getGoodsTrainPopupHtml())
        .addTo(map);

      activePopupRef.current = popup;
    },
    [closeActivePopup, isKolkata]
  );

  // Direct camera view handler triggered on button click or track click
  const handleCameraView = useCallback(
    (view: MapCameraView) => {
      setActiveMapView(view);
      const map = mapRef.current;
      if (!map) return;

      closeActivePopup();
      const presets = isKolkata ? SER_CAMERA_PRESETS : CAMERA_PRESETS;
      const preset = presets[view];

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
        const isKhurda = rescue?.bailout_plan?.deboard_station_code === 'KUR';
        const bounds = isKolkata
          ? preset.bounds
          : isKhurda
          ? ([[85.70, 20.15], [85.86, 20.30]] as [[number, number], [number, number]])
          : preset.bounds;
        map.fitBounds(bounds, { padding: preset.padding, duration: preset.duration });
      } else {
        setSelectedDelayId(null);
        map.fitBounds(preset.bounds, { padding: preset.padding, duration: preset.duration });
      }
    },
    [closeActivePopup, openGoodsTrainPopup, setActiveMapView, setSelectedDelayId, isKolkata, rescue]
  );

  // Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    fetchCorridorConfig()
      .then((cfg) => cfg.mapbox_access_token)
      .catch((err) => {
        console.warn('Failed to fetch corridor config, falling back to OSM:', err);
        return null;
      })
      .then((mapboxToken) => {
        if (isCancelled || !mapContainerRef.current || mapRef.current) return;

        const baseStyle = createBaseMapStyle(mapboxToken);
        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: baseStyle,
          center: isKolkata ? [87.9700, 22.4600] : [85.8829, 20.4625],
          zoom: isKolkata ? 9.5 : 9.8,
          attributionControl: false,
        });

        mapRef.current = map;

        map.on('error', (e) => {
          console.warn('MapLibre internal error:', e.error?.message || e);
        });

        // Auto-resize observer
        resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        if (mapContainerRef.current) {
          resizeObserver.observe(mapContainerRef.current);
        }

        map.on('load', () => {
          const presets = isKolkata ? SER_CAMERA_PRESETS : CAMERA_PRESETS;
          const defaultPreset = presets.my_train;
          map.fitBounds(defaultPreset.bounds, {
            padding: defaultPreset.padding,
            duration: defaultPreset.duration,
          });

          // Prepare Station GeoJSON
          const isUp = currentTrain?.direction === 'UP' || selectedTrain === '18410' || selectedTrain === '12822';
          const safeTrainKm = Number.isFinite(trainKm) ? trainKm : (isKolkata ? 58.0 : 115.0);
          const stationsList = isKolkata ? SER_STATIONS : STATIONS;

          const stationFeatures = stationsList.map((stn) => {
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
                is_destination: isKolkata ? stn.code === 'KGP' || stn.code === 'HWH' : stn.code === 'BBS',
                is_rescue_transfer: isKolkata ? stn.code === 'SRC' || stn.code === 'MCA' : stn.code === 'CTC',
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
            const defaultCoord = isKolkata ? [87.9700, 22.4600] : [85.8829, 20.4625];
            const rawLon = t.lon ?? defaultCoord[0];
            const rawLat = t.lat ?? defaultCoord[1];
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

          const isKhurda = rescue?.bailout_plan?.deboard_station_code === 'KUR';
          const highwayBadgeText = isKolkata
            ? 'Cab from Santragachi • 25 mins faster'
            : isKhurda
            ? 'Cab from Khurda Road • 28 mins faster'
            : 'Cab from Cuttack • 21 mins faster';
          const highwayBadgePosition: [number, number] = isKolkata
            ? [88.315, 22.565]
            : isKhurda
            ? [85.760, 20.210]
            : [85.875, 20.370];

          // Initialize modular map layers
          initCorridorMapLayers(
            map,
            completedCoords,
            remainingCoords,
            isRescueAvailable,
            stationFeatures,
            initialTrainFeatures,
            activeTrackCoords,
            isKolkata ? SMOOTH_KONA_EXPRESSWAY_COORDS : SMOOTH_NH16_COORDS,
            highwayBadgeText,
            highwayBadgePosition
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
            clearPopupTimeout();
            popupTimeoutRef.current = window.setTimeout(() => {
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
              predictionRef.current
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
  }, [isKolkata]); // Re-initialize or re-fit on corridor switch

  // Update track completed vs remaining geometry when train advances
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateRouteLineGeometry(map, completedCoords, remainingCoords);
  }, [completedCoords, remainingCoords]);

  // Synchronize Highway Rescue route visibility
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

    const shouldShowFreight = selectedDelayId === 'cause-2' || activeMapView === 'delays_ahead';
    const visibility = shouldShowFreight ? 'visible' : 'none';

    ['freight-hazard-casing', 'freight-hazard-core', 'freight-badge-layer'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }, [selectedDelayId, activeMapView]);

  // Smooth camera view pan/zoom updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const presets = isKolkata ? SER_CAMERA_PRESETS : CAMERA_PRESETS;
    const preset = presets[activeMapView];
    if (preset) {
      if (activeMapView === 'alternative_route') {
        const isKhurda = rescue?.bailout_plan?.deboard_station_code === 'KUR';
        const bounds = isKolkata
          ? preset.bounds
          : isKhurda
          ? ([[85.70, 20.15], [85.86, 20.30]] as [[number, number], [number, number]])
          : preset.bounds;
        map.fitBounds(bounds, { padding: preset.padding, duration: preset.duration });
      } else {
        map.fitBounds(preset.bounds, { padding: preset.padding, duration: preset.duration });
      }
    }
  }, [activeMapView, isKolkata, rescue]);

  return (
    <div className={`relative w-full ${isModal ? 'h-full' : 'h-full min-h-[460px]'} bg-[#FAF9F6] overflow-hidden`}>
      {/* MapLibre WebGL Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Camera Preset Bar (Top Right) */}
      <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 p-1.5 rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-md">
        <button
          type="button"
          onClick={() => handleCameraView('my_train')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeMapView === 'my_train'
              ? 'bg-[#0F294A] text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Focus on monitored train"
        >
          <Train className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">My Train</span>
        </button>

        <button
          type="button"
          onClick={() => handleCameraView('delays_ahead')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeMapView === 'delays_ahead'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Inspect delays ahead"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Delays Ahead</span>
        </button>

        {isRescueAvailable && (
          <button
            type="button"
            onClick={() => handleCameraView('alternative_route')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMapView === 'alternative_route'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={isKolkata ? "Kona Expressway Road Transfer" : "NH-16 Road Transfer Bypass"}
          >
            <Car className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cab Bypass</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => handleCameraView('full_journey')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeMapView === 'full_journey'
              ? 'bg-[#0F294A] text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title={`Fit full corridor (${isKolkata ? 'Howrah to Kharagpur' : 'Bhadrak to Puri'})`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Full Journey</span>
        </button>
      </div>

      {/* Compact Zoom & Recenter Stack (Top Right, below preset bar) */}
      <div className="absolute top-16 right-3 z-10 flex flex-col w-9 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-md divide-y divide-slate-200/70 overflow-hidden">
        <button
          type="button"
          onClick={() => handleCameraView('my_train')}
          title="Center on My Train"
          className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <LocateFixed className="w-4 h-4 text-orange-600" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          title="Zoom In"
          className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          title="Zoom Out"
          className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Contextual Clean Map Legend */}
      <MapLegend />
    </div>
  );
};
