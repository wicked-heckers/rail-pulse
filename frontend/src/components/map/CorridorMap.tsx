import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
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
  getTrackSliceForBlock,
} from '../../services/corridorData';
import {
  getStationRelevance,
  getArrivalPrediction,
  evaluateLogicalConnection,
  formatTime12Hour,
  getDelayCauses,
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
  X,
} from 'lucide-react';

interface CorridorMapProps {
  isModal?: boolean;
}

type MobileMapSelection =
  | { kind: 'delay' }
  | {
      kind: 'station';
      name: string;
      code: string;
      km: number;
      roleBadge?: string;
      explanation?: string;
      showExpectedArrival: boolean;
    }
  | {
      kind: 'train';
      trainNo: string;
      trainName: string;
      delayMins: number;
      speedKmph: number;
      currentStation?: string | null;
      nextStation?: string | null;
      isTarget: boolean;
    };

export const CorridorMap: React.FC<CorridorMapProps> = ({ isModal = false }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activePopupRef = useRef<MapLibrePopup | null>(null);
  const popupTimeoutRef = useRef<number | null>(null);
  const skipNextCameraEffectRef = useRef(false);
  const [mobileSelection, setMobileSelection] = useState<MobileMapSelection | null>(null);

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
  const forecastRef = useRef(forecast);
  forecastRef.current = forecast;
  const currentTrainRef = useRef(currentTrain);
  currentTrainRef.current = currentTrain;
  const selectedTrainRef = useRef(selectedTrain);
  selectedTrainRef.current = selectedTrain;
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

  const primaryDelayCause = useMemo(() => {
    const causes = getDelayCauses(
      selectedTrain,
      forecast,
      currentTrain?.current_station,
      currentTrain?.current_delay_mins,
      activeSnapshot
    );
    return causes.find((c) => c.tagType !== 'clear') || causes[0] || null;
  }, [selectedTrain, forecast, currentTrain?.current_station, currentTrain?.current_delay_mins, activeSnapshot]);

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

  const activeFreightShadow = useMemo(() => {
    const freights = activeSnapshot.phantom_freights ?? [];
    if (freights.length === 0) return null;
    const sameDir = freights.find((f) => f.direction === currentTrain?.direction);
    return sameDir ?? freights[0];
  }, [activeSnapshot.phantom_freights, currentTrain?.direction]);

  const activeFreightGeom = useMemo(() => {
    return getTrackSliceForBlock(
      activeFreightShadow?.block_id,
      isKolkata ? 'SER_HWH_KGP' : 'ECoR_BHC_PURI'
    );
  }, [activeFreightShadow?.block_id, isKolkata]);

  // Clean close any active popup
  const closeActivePopup = useCallback(() => {
    clearPopupTimeout();
    setMobileSelection(null);
    if (activePopupRef.current) {
      activePopupRef.current.remove();
      activePopupRef.current = null;
    }
  }, [clearPopupTimeout]);

  // Passenger-friendly Goods Train Ahead popup HTML
  const getGoodsTrainPopupHtml = useCallback(() => {
    const shadow = activeFreightShadow;
    const accPct = shadow ? Math.round((shadow.freight_probability ?? 0.88) * 100) : 88;
    const delayMins = Math.round(
      shadow?.added_delay_mins ?? shadow?.clearance_eta_mins ?? 14
    );
    const strVal = shadow?.str_value ? shadow.str_value.toFixed(2) : '1.85';
    const clrStn = shadow?.clearance_station || activeFreightGeom.toCode;
    return `
    <div class="w-[305px] p-3.5 text-sm space-y-2 font-sans">
      <!-- Row 1: Orange status dot + AI confidence + delay badge -->
      <div class="flex items-center justify-between pr-6 gap-1.5">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
          <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
            +${delayMins} min delay
          </span>
          <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
            ${accPct}% AI Acc
          </span>
        </div>
      </div>

      <!-- Row 2: Full-width Title -->
      <h4 class="font-bold text-[15px] leading-snug text-slate-900 pt-0.5">
        Goods Train Ahead
      </h4>

      <!-- Row 3: Location + Plain Description -->
      <div class="pt-1.5 border-t border-slate-100">
        <div class="text-xs font-semibold text-slate-500 mb-1">Between ${activeFreightGeom.fromName} & ${activeFreightGeom.toName} • STR ${strVal}</div>
        <p class="text-slate-700 leading-relaxed text-[13px] sm:text-sm">
          AI detected a slow goods rake ahead (${accPct}% accuracy). Adding +${delayMins} mins until it clears into ${clrStn} Loop.
        </p>
      </div>
    </div>
  `;
  }, [activeFreightShadow, activeFreightGeom]);

  // Anchors popup to the left (west) of the track on desktop; uses docked bottom card on mobile (< md)
  const openGoodsTrainPopup = useCallback(
    (map: MapLibreMap) => {
      closeActivePopup();
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setMobileSelection({ kind: 'delay' });
        return;
      }
      const causes = getDelayCauses(
        selectedTrainRef.current,
        forecastRef.current,
        currentTrainRef.current?.current_station,
        currentTrainRef.current?.current_delay_mins
      );
      const primaryCause = causes.find((c) => c.tagType !== 'clear') || causes[0];
      const popupCoords: [number, number] =
        primaryCause?.coordinates || activeFreightGeom.midpoint;
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
    [closeActivePopup, activeFreightGeom.midpoint, getGoodsTrainPopupHtml]
  );

  // Direct camera view handler triggered on button click or track click
  const handleCameraView = useCallback(
    (view: MapCameraView) => {
      skipNextCameraEffectRef.current = true;
      setActiveMapView(view);
      const map = mapRef.current;
      if (!map) return;

      closeActivePopup();
      const presets = isKolkata ? SER_CAMERA_PRESETS : CAMERA_PRESETS;
      const preset = presets[view];

      if (view === 'delays_ahead') {
        setSelectedDelayId('cause-2');
        // Smoothly zoom in on the dynamic delay zone ahead of the train
        map.flyTo({
          center: activeFreightGeom.midpoint,
          zoom: 12.0,
          speed: 1.2,
          duration: 800,
        });

        // Show non-blocking delay explanation popup anchored to the left of the track
        popupTimeoutRef.current = window.setTimeout(() => {
          popupTimeoutRef.current = null;
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
    [
      closeActivePopup,
      openGoodsTrainPopup,
      setActiveMapView,
      setSelectedDelayId,
      activeFreightGeom.midpoint,
      isKolkata,
      rescue?.bailout_plan?.deboard_station_code,
    ]
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
          // Hide duplicate base-map city/settlement labels behind custom station markers
          const styleLayers = map.getStyle()?.layers || [];
          for (const layer of styleLayers) {
            if (layer.type === 'symbol') {
              const idLower = layer.id.toLowerCase();
              if (['place', 'settlement', 'city', 'town', 'village'].some((k) => idLower.includes(k))) {
                try {
                  map.setLayoutProperty(layer.id, 'visibility', 'none');
                } catch {
                  /* ignore immutable basemap layer */
                }
              }
            }
          }

          setActiveMapView('my_train');
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

            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              setMobileSelection({
                kind: 'train',
                trainNo: String(props.train_no || ''),
                trainName: String(props.train_name || ''),
                delayMins: Math.round(Number(props.delay_mins) || 0),
                speedKmph: Math.round(Number(props.speed_kmph) || 0),
                currentStation: props.current_station ?? null,
                nextStation: props.next_station ?? null,
                isTarget: Boolean(props.is_target),
              });
              map.easeTo({ center: coords, padding: { bottom: 160 }, duration: 350 });
              return;
            }

            const popupHtml = getTrainPopupHtml({
              train_no: props.train_no,
              train_name: props.train_name,
              delay_mins: props.delay_mins,
              speed_kmph: props.speed_kmph,
              current_station: props.current_station,
              next_station: props.next_station,
              is_target: props.is_target,
            });

            const popup = new maplibregl.Popup({ offset: 12, closeButton: true, maxWidth: '300px' })
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

            const stnCode = String(props.code || '');
            const pred = predictionRef.current;
            const showExpectedArrival =
              stnCode === pred.destinationCode ||
              stnCode === 'BBS' ||
              stnCode === 'KGP' ||
              stnCode === 'PURI' ||
              stnCode === 'HWH';

            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              setMobileSelection({
                kind: 'station',
                name: String(props.name || ''),
                code: stnCode,
                km: Number(props.km || 0),
                roleBadge: props.role_badge ? String(props.role_badge) : undefined,
                explanation: props.explanation ? String(props.explanation) : undefined,
                showExpectedArrival,
              });
              map.easeTo({ center: coords, padding: { bottom: 160 }, duration: 350 });
              return;
            }

            const popupHtml = getStationPopupHtml(
              {
                name: props.name,
                code: stnCode,
                km: Number(props.km || 0),
                role_badge: props.role_badge,
                explanation: props.explanation,
              },
              pred
            );

            const popup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '300px' })
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

  // Synchronize phantom freight slow-zone visibility & dynamic geometry/accuracy badge
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const isFreightSelected = Boolean(
      selectedDelayId === 'cause-2' ||
      selectedDelayId?.includes('FREIGHT') ||
      selectedDelayId?.includes('DRAG') ||
      selectedDelayId?.includes('BLOCK')
    );
    const hasPhantomFreights = (activeSnapshot.phantom_freights?.length ?? 0) > 0;
    const shouldShowFreight =
      isFreightSelected ||
      activeMapView === 'delays_ahead' ||
      (hasPhantomFreights && activeMapView !== 'my_train');
    const visibility = shouldShowFreight ? 'visible' : 'none';

    ['freight-hazard-casing', 'freight-hazard-core', 'freight-badge-layer'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });

    const hazardSource = map.getSource('freight-hazard-source') as any;
    if (hazardSource && typeof hazardSource.setData === 'function') {
      hazardSource.setData({
        type: 'Feature',
        properties: { name: 'Delay Section Ahead' },
        geometry: { type: 'LineString', coordinates: activeFreightGeom.coords },
      });
    }

    const badgeSource = map.getSource('freight-badge-source') as any;
    if (badgeSource && typeof badgeSource.setData === 'function') {
      const shadow = activeFreightShadow;
      const accPct = shadow ? Math.round((shadow.freight_probability ?? 0.88) * 100) : 88;
      const delayMins = Math.round(
        shadow?.added_delay_mins ?? shadow?.clearance_eta_mins ?? 14
      );
      const label = shadow
        ? `⚠ Goods Train (${accPct}% acc • +${delayMins}m delay)`
        : '⚠ Clear / No Active Freight Ahead';
      badgeSource.setData({
        type: 'Feature',
        properties: { label },
        geometry: {
          type: 'Point',
          coordinates: activeFreightGeom.midpoint,
        },
      });
    }
  }, [
    selectedDelayId,
    activeSnapshot.phantom_freights,
    activeMapView,
    activeFreightShadow,
    activeFreightGeom,
  ]);

  const rescueDeboardCode = rescue?.bailout_plan?.deboard_station_code;

  // Smooth camera view pan/zoom updates (only when preset view, corridor, or active bailout hub changes)
  useEffect(() => {
    if (skipNextCameraEffectRef.current) {
      skipNextCameraEffectRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const presets = isKolkata ? SER_CAMERA_PRESETS : CAMERA_PRESETS;
    const preset = presets[activeMapView];
    if (preset) {
      if (activeMapView === 'alternative_route') {
        const isKhurda = rescueDeboardCode === 'KUR';
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
  }, [activeMapView, isKolkata, rescueDeboardCode]);

  return (
    <div className={`relative w-full ${isModal ? 'h-full' : 'h-full min-h-[460px]'} bg-[#FAF9F6] overflow-hidden`}>
      {/* MapLibre WebGL Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Camera Preset Bar (4-col grid on mobile, docked top-right on desktop) */}
      <div
        className={`absolute top-3 left-3 right-3 md:left-auto md:right-3 z-10 grid ${
          isRescueAvailable ? 'grid-cols-4' : 'grid-cols-3'
        } md:inline-flex items-center gap-1 p-1 md:p-1.5 rounded-xl md:rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-md`}
      >
        <button
          type="button"
          onClick={() => handleCameraView('my_train')}
          className={`flex items-center justify-center gap-1 md:gap-1.5 py-1.5 px-1.5 md:px-2.5 rounded-lg text-[11px] md:text-xs font-semibold md:font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeMapView === 'my_train'
              ? 'bg-[#0F294A] text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Focus on monitored train"
        >
          <Train className="w-3.5 h-3.5 shrink-0" />
          <span>My Train</span>
        </button>

        <button
          type="button"
          onClick={() => handleCameraView('delays_ahead')}
          className={`flex items-center justify-center gap-1 md:gap-1.5 py-1.5 px-1.5 md:px-2.5 rounded-lg text-[11px] md:text-xs font-semibold md:font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeMapView === 'delays_ahead'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Inspect delays ahead"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="md:hidden">Delays</span>
          <span className="hidden md:inline">Delays Ahead</span>
        </button>

        {isRescueAvailable && (
          <button
            type="button"
            onClick={() => handleCameraView('alternative_route')}
            className={`flex items-center justify-center gap-1 md:gap-1.5 py-1.5 px-1.5 md:px-2.5 rounded-lg text-[11px] md:text-xs font-semibold md:font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeMapView === 'alternative_route'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={isKolkata ? "Kona Expressway Road Transfer" : "NH-16 Road Transfer Bypass"}
          >
            <Car className="w-3.5 h-3.5 shrink-0" />
            <span className="md:hidden">Cab Route</span>
            <span className="hidden md:inline">Cab Bypass</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => handleCameraView('full_journey')}
          className={`flex items-center justify-center gap-1 md:gap-1.5 py-1.5 px-1.5 md:px-2.5 rounded-lg text-[11px] md:text-xs font-semibold md:font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeMapView === 'full_journey'
              ? 'bg-[#0F294A] text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title={`Fit full corridor (${isKolkata ? 'Howrah to Kharagpur' : 'Bhadrak to Puri'})`}
        >
          <Maximize2 className="w-3.5 h-3.5 shrink-0" />
          <span className="md:hidden">Full</span>
          <span className="hidden md:inline">Full Journey</span>
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

      {/* Mobile Docked Detail Card (Station / Train / Delay) */}
      {mobileSelection && (mobileSelection.kind !== 'delay' || primaryDelayCause) && (
        <div className="md:hidden fixed bottom-16 left-3 right-3 z-20 p-3.5 rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200/90 shadow-lg">
          {mobileSelection.kind === 'delay' && primaryDelayCause && (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      primaryDelayCause.tagType === 'clear' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${
                      primaryDelayCause.tagType === 'clear'
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                        : 'bg-amber-100 text-amber-900 border-amber-200'
                    }`}
                  >
                    {primaryDelayCause.tag || '~14 min delay'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSelection(null)}
                  className="p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close delay details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h4 className="font-bold text-[15px] leading-snug text-slate-900 mt-2">
                {primaryDelayCause.popupTitle || primaryDelayCause.title || 'Goods Train Ahead'}
              </h4>
              <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-500 mb-0.5">
                  {primaryDelayCause.locationName || 'Between Cuttack & Barang'}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {primaryDelayCause.popupMessage ||
                    primaryDelayCause.explanation ||
                    'A slow goods train is ahead of you toward Bhubaneswar, adding about 14 mins to your journey.'}
                </p>
              </div>
            </>
          )}

          {mobileSelection.kind === 'station' && (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h4 className="font-bold text-[15px] leading-snug text-[#0F294A]">
                    {mobileSelection.name} ({mobileSelection.code})
                  </h4>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-700 whitespace-nowrap">
                    km {mobileSelection.km.toFixed(1)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSelection(null)}
                  className="p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                  aria-label="Close station details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                {mobileSelection.roleBadge && (
                  <div className="text-xs font-bold text-[#0F294A]">{mobileSelection.roleBadge}</div>
                )}
                {mobileSelection.explanation && (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {mobileSelection.explanation}
                  </p>
                )}
                {mobileSelection.showExpectedArrival && (
                  <div className="bg-slate-50 px-2.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 font-medium leading-snug">
                    Expected Arrival:{' '}
                    <strong className="text-[#0F294A] font-bold">{prediction.expectedTime}</strong>{' '}
                    (Window: {prediction.likelyWindow})
                  </div>
                )}
              </div>
            </>
          )}

          {mobileSelection.kind === 'train' && (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      mobileSelection.isTarget ? 'bg-orange-500 ring-2 ring-orange-200' : 'bg-blue-600'
                    }`}
                  />
                  <h4 className="font-bold text-[15px] leading-snug text-[#0F294A]">
                    {mobileSelection.trainNo} • {mobileSelection.trainName}
                  </h4>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${
                      mobileSelection.isTarget
                        ? 'bg-orange-50 text-orange-800 border border-orange-200/70'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {mobileSelection.isTarget ? 'Your Train' : 'Corridor Train'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSelection(null)}
                  className="p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                  aria-label="Close train details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600 font-medium">
                <div className="flex items-center justify-between gap-2">
                  <span>Running Status:</span>
                  <strong
                    className={`font-bold ${
                      mobileSelection.delayMins > 5 ? 'text-amber-800' : 'text-emerald-700'
                    }`}
                  >
                    {mobileSelection.delayMins > 0
                      ? `+${mobileSelection.delayMins}m late`
                      : 'On Time'}{' '}
                    • {mobileSelection.speedKmph > 0 ? `${mobileSelection.speedKmph} km/h` : 'At Station'}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Position:</span>
                  <span className="text-slate-800 font-bold">
                    {mobileSelection.currentStation
                      ? `Platform ${mobileSelection.currentStation}`
                      : `En route to ${mobileSelection.nextStation || (isKolkata ? 'KGP' : 'BBS')}`}
                  </span>
                </div>
                {!mobileSelection.isTarget && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTrain(mobileSelection.trainNo);
                      setMobileSelection(null);
                    }}
                    className="w-full mt-1 py-2 px-3 bg-[#0F294A] hover:bg-slate-800 text-white font-bold rounded-xl text-center transition-colors cursor-pointer text-xs"
                  >
                    Track this train
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
