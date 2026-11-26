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
  SMOOTH_CONGESTION_AHEAD_COORDS,
  snapPointToTrack,
} from '../../services/corridorData';
import {
  getDelayCauses,
  getStationRelevance,
  getArrivalPrediction,
  evaluateLogicalConnection,
  formatTime12Hour,
} from '../dashboard/passengerUtils';
import {
  Train,
  AlertTriangle,
  Car,
  Maximize2,
  LocateFixed,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

// Verified ECoR Stations on the Corridor
const STATIONS = [
  { code: 'BHC', name: 'Bhadrak', km: 0.0, coords: [86.4950, 21.0583] as [number, number] },
  { code: 'JJKR', name: 'Jajpur K. Rd', km: 44.0, coords: [86.1333, 20.9500] as [number, number] },
  { code: 'JKPR', name: 'Jakhapura Jn', km: 51.0, coords: [86.0600, 20.9400] as [number, number] },
  { code: 'NRG', name: 'Nergundi Jn', km: 106.0, coords: [85.9200, 20.5500] as [number, number] },
  { code: 'CTC', name: 'Cuttack Jn', km: 115.0, coords: [85.8829, 20.4625] as [number, number] },
  { code: 'BRAG', name: 'Barang Jn', km: 128.0, coords: [85.8300, 20.4000] as [number, number] },
  { code: 'BBS', name: 'Bhubaneswar', km: 143.0, coords: [85.8333, 20.2667] as [number, number] },
  { code: 'KUR', name: 'Khurda Rd Jn', km: 162.0, coords: [85.7333, 20.1833] as [number, number] },
  { code: 'PURI', name: 'Puri', km: 206.0, coords: [85.8314, 19.8133] as [number, number] },
];

// Curated regional places and landmarks in subtle monochrome typography
interface RegionalPlace {
  name: string;
  type: 'town' | 'landmark' | 'water';
  coords: [number, number];
}

const REGIONAL_PLACES: RegionalPlace[] = [
  { name: 'CHOUDWAR', type: 'town', coords: [85.9100, 20.5350] },
  { name: 'KENDRAPARA', type: 'town', coords: [86.4200, 20.5000] },
  { name: 'JAGATSINGHPUR', type: 'town', coords: [86.1700, 20.2650] },
  { name: 'ATHAGARH', type: 'town', coords: [85.7200, 20.5300] },
  { name: 'BANKI', type: 'town', coords: [85.5300, 20.3800] },
  { name: 'DHENKANAL', type: 'town', coords: [85.6000, 20.6700] },
  { name: 'PHULNAKHARA', type: 'town', coords: [85.8900, 20.3700] },
  { name: 'PIPLI', type: 'town', coords: [85.8300, 20.1100] },
  { name: 'NIMAPADA', type: 'town', coords: [86.0200, 20.0700] },
  { name: 'KONARK', type: 'town', coords: [86.1200, 19.8900] },
  { name: 'KHURDA TOWN', type: 'town', coords: [85.6200, 20.1800] },
  { name: 'CHANDAKA RESERVE', type: 'landmark', coords: [85.7100, 20.3500] },
  { name: 'BIJU PATNAIK AIRPORT', type: 'landmark', coords: [85.8150, 20.2450] },
  { name: 'MAHANADI RIVER', type: 'water', coords: [85.8150, 20.4650] },
  { name: 'KATHAJODI RIVER', type: 'water', coords: [85.8550, 20.4450] },
];

function createBaseMapStyle(mapboxToken?: string | null): string {
  if (mapboxToken) {
    return `https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=${mapboxToken}`;
  }
  return 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
}

function escapeHtml(str?: string | number | null): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface CorridorMapProps {
  isModal?: boolean;
}

export const CorridorMap: React.FC<CorridorMapProps> = ({ isModal = false }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activePopupRef = useRef<MapLibrePopup | null>(null);

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

  // Connection evaluation for journey status synchronization (Section 7)
  const prediction = getArrivalPrediction(selectedTrain, forecast);
  const connectionDeadlineFormatted = formatTime12Hour(connectionTarget?.deadline_time);

  const connectionEval = evaluateLogicalConnection(
    prediction.expectedTime,
    prediction.worstCaseTime,
    connectionDeadlineFormatted,
    connectionTarget?.transfer_buffer_mins ?? 15,
    rescue?.survival_probability_pct
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
    if (activePopupRef.current) {
      activePopupRef.current.remove();
      activePopupRef.current = null;
    }
  }, []);

  // Passenger-friendly Goods Train Ahead popup HTML
  const getGoodsTrainPopupHtml = () => `
    <div class="w-[300px] p-3.5 text-sm space-y-2 font-sans">
      <!-- Row 1: Orange status dot + soft amber badge (clean space on right for × close button) -->
      <div class="flex items-center justify-between pr-6">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
            ~14 min delay
          </span>
        </div>
      </div>

      <!-- Row 2: Full-width Title -->
      <h4 class="font-bold text-[15px] leading-snug text-slate-900 pt-0.5">
        Goods Train Ahead
      </h4>

      <!-- Row 3: Location + Plain Description -->
      <div class="pt-1.5 border-t border-slate-100">
        <div class="text-xs font-semibold text-slate-500 mb-1">Between Cuttack & Barang</div>
        <p class="text-slate-700 leading-relaxed text-[13px] sm:text-sm">
          A slow goods train is ahead of you toward Bhubaneswar, adding about 14 mins to your journey.
        </p>
      </div>
    </div>
  `;

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
    (view: 'my_train' | 'delays_ahead' | 'alternative_route' | 'full_journey') => {
      setActiveMapView(view);
      const map = mapRef.current;
      if (!map) return;

      closeActivePopup();

      if (view === 'my_train') {
        setSelectedDelayId(null);
        map.fitBounds(
          [
            [85.76, 20.23],
            [85.96, 20.52],
          ],
          { padding: { top: 75, bottom: 85, left: 60, right: 60 }, duration: 600 }
        );
      } else if (view === 'delays_ahead') {
        setSelectedDelayId('cause-2');
        map.fitBounds(
          [
            [85.80, 20.36],
            [85.92, 20.49],
          ],
          { padding: 85, duration: 600 }
        );

        // Show non-blocking delay explanation popup anchored to the left of the track
        setTimeout(() => {
          if (!mapRef.current) return;
          openGoodsTrainPopup(mapRef.current);
        }, 200);
      } else if (view === 'alternative_route') {
        if (map.getLayer('nh16-highway-casing')) {
          map.setLayoutProperty('nh16-highway-casing', 'visibility', 'visible');
        }
        if (map.getLayer('nh16-highway-line')) {
          map.setLayoutProperty('nh16-highway-line', 'visibility', 'visible');
        }
        if (map.getLayer('nh16-highway-badge')) {
          map.setLayoutProperty('nh16-highway-badge', 'visibility', 'visible');
        }
        map.fitBounds(
          [
            [85.79, 20.24],
            [85.95, 20.48],
          ],
          { padding: 80, duration: 600 }
        );
      } else if (view === 'full_journey') {
        setSelectedDelayId(null);
        map.fitBounds(
          [
            [85.75, 19.78],
            [86.55, 21.08],
          ],
          { padding: { top: 70, bottom: 85, left: 50, right: 50 }, duration: 600 }
        );
      }
    },
    [closeActivePopup, openGoodsTrainPopup, setActiveMapView, setSelectedDelayId]
  );

  // Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isCancelled = false;

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
        const resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        if (mapContainerRef.current) {
          resizeObserver.observe(mapContainerRef.current);
        }

        map.on('load', () => {
          // Hide built-in basemap place and label layers to avoid duplicate text behind station labels
          const styleLayers = map.getStyle().layers || [];
          for (const layer of styleLayers) {
            if (layer.id.includes('place') || layer.id.includes('label')) {
              try {
                map.setLayoutProperty(layer.id, 'visibility', 'none');
              } catch {}
            }
          }

          // Default initial view: Nergundi Jn -> Cuttack Jn -> Barang Jn -> Bhubaneswar
          map.fitBounds(
            [
              [85.76, 20.23],
              [85.96, 20.52],
            ],
            { padding: { top: 75, bottom: 85, left: 60, right: 60 }, duration: 600 }
          );

          // 1. Natural Railway Track Solid White Casing (Halo)
          map.addSource('railway-track-casing-source', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: 'ECoR Trunk Line' },
              geometry: { type: 'LineString', coordinates: SMOOTH_TRACK_COORDS },
            },
          });

          map.addLayer({
            id: 'railway-track-casing',
            type: 'line',
            source: 'railway-track-casing-source',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#FFFFFF',
              'line-opacity': 1,
              'line-width': 8,
            },
          });

          // 2. Completed Journey Section (Solid slate #475569, line-width: 4.5, line-opacity: 1)
          map.addSource('completed-track-source', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: 'Completed Section' },
              geometry: { type: 'LineString', coordinates: completedCoords },
            },
          });

          map.addLayer({
            id: 'completed-track-line',
            type: 'line',
            source: 'completed-track-source',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#475569',
              'line-width': 4.5,
              'line-opacity': 1,
            },
          });

          // 3. Upcoming Clear Rail Segment (Solid deep navy #0f172a, line-width: 4.5, line-opacity: 1)
          map.addSource('remaining-track-source', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: 'Remaining Section' },
              geometry: { type: 'LineString', coordinates: remainingCoords },
            },
          });

          map.addLayer({
            id: 'remaining-track-line',
            type: 'line',
            source: 'remaining-track-source',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#0F294A',
              'line-width': 4.5,
              'line-opacity': 1,
            },
          });

          // Directional chevrons along remaining track indicating forward travel
          map.addLayer({
            id: 'railway-direction-chevrons',
            type: 'symbol',
            source: 'remaining-track-source',
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 90,
              'text-field': '›',
              'text-size': 14,
              'text-keep-upright': false,
            },
            paint: {
              'text-color': '#FFFFFF',
              'text-opacity': 1,
              'text-halo-color': '#0F294A',
              'text-halo-width': 1.5,
            },
          });

          // 4. Affected Delay Section (Ahead of train: Cuttack toward Barang / Bhubaneswar)
          map.addSource('freight-hazard-source', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: 'Delay Section Ahead' },
              geometry: { type: 'LineString', coordinates: SMOOTH_CONGESTION_AHEAD_COORDS },
            },
          });

          // Dedicated white casing beneath amber delay line
          map.addLayer({
            id: 'freight-hazard-casing',
            type: 'line',
            source: 'freight-hazard-source',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#FFFFFF',
              'line-opacity': 1,
              'line-width': 9,
            },
          });

          // Slow Traffic Ahead: Solid amber (#f59e0b), line-width: 5.5, line-opacity: 1
          map.addLayer({
            id: 'freight-hazard-core',
            type: 'line',
            source: 'freight-hazard-source',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#F59E0B',
              'line-width': 5.5,
              'line-opacity': 1,
            },
          });

          // Delay badge: Plain passenger copy "Goods Train Ahead (~14m delay)" with crisp white halo
          map.addSource('freight-badge-source', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { label: '⚠ Goods Train Ahead (~14m delay)' },
              geometry: {
                type: 'Point',
                coordinates: [85.856, 20.431], // Midpoint Cuttack to Barang
              },
            },
          });

          map.addLayer({
            id: 'freight-badge-layer',
            type: 'symbol',
            source: 'freight-badge-source',
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 12,
              'text-offset': [0, -1.4],
              'text-anchor': 'bottom',
            },
            paint: {
              'text-color': '#92400E',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 2.5,
            },
          });

          // 5. Dashed Emerald NH-16 Rescue Route (CTC ➔ BBS)
          map.addSource('nh16-highway', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: 'NH-16 Expressway Rescue Corridor' },
              geometry: { type: 'LineString', coordinates: SMOOTH_NH16_COORDS },
            },
          });

          // Dedicated white casing beneath NH-16 cab line
          map.addLayer({
            id: 'nh16-highway-casing',
            type: 'line',
            source: 'nh16-highway',
            layout: {
              visibility: isRescueAvailable ? 'visible' : 'none',
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#FFFFFF',
              'line-opacity': 1,
              'line-width': 8,
            },
          });

          // NH-16 Cab Bypass: Crisp emerald dashed line (#059669), line-width: 4, line-opacity: 1
          map.addLayer({
            id: 'nh16-highway-line',
            type: 'line',
            source: 'nh16-highway',
            layout: {
              visibility: isRescueAvailable ? 'visible' : 'none',
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#059669',
              'line-width': 4,
              'line-dasharray': [2, 2],
              'line-opacity': 1,
            },
          });

          // NH-16 Rescue Pill Badge with crisp white halo
          map.addSource('nh16-badge-source', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { label: 'Cab from Cuttack • 21 mins faster' },
              geometry: {
                type: 'Point',
                coordinates: [85.875, 20.370],
              },
            },
          });

          map.addLayer({
            id: 'nh16-highway-badge',
            type: 'symbol',
            source: 'nh16-badge-source',
            layout: {
              visibility: isRescueAvailable ? 'visible' : 'none',
              'text-field': ['get', 'label'],
              'text-size': 12,
              'text-offset': [1.2, 0],
              'text-anchor': 'left',
            },
            paint: {
              'text-color': '#065F46',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 2.5,
            },
          });

          // 6. Curated Regional Places & Landmarks (Monochrome Slate Typography)
          map.addSource('regional-places-source', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: REGIONAL_PLACES.map((p) => ({
                type: 'Feature',
                properties: {
                  name: p.name,
                  type: p.type,
                },
                geometry: {
                  type: 'Point',
                  coordinates: p.coords,
                },
              })),
            },
          });

          map.addLayer({
            id: 'regional-places-labels',
            type: 'symbol',
            source: 'regional-places-source',
            layout: {
              'text-field': ['get', 'name'],
              'text-size': [
                'case',
                ['==', ['get', 'type'], 'water'],
                10,
                10.5,
              ],
              'text-letter-spacing': 0.08,
              'text-anchor': 'center',
              'text-max-width': 9,
              'text-allow-overlap': false,
              'text-ignore-placement': false,
            },
            paint: {
              'text-color': [
                'case',
                ['==', ['get', 'type'], 'water'],
                '#64748B',
                ['==', ['get', 'type'], 'landmark'],
                '#475569',
                '#64748B',
              ],
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 2,
              'text-opacity': 0.85,
            },
          });

          // 7. Station Nodes
          map.addSource('station-nodes', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: STATIONS.map((stn) => {
                const isUp = currentTrain?.direction === 'UP' || selectedTrain === '18410';
                const safeTrainKm = Number.isFinite(trainKm) ? trainKm : 115.0;
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
                  type: 'Feature',
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
                    type: 'Point',
                    coordinates: stn.coords,
                  },
                };
              }),
            },
          });

          // Station Circle Outer Ring (highlighting destination & transfer hub)
          map.addLayer({
            id: 'station-outer-halo',
            type: 'circle',
            source: 'station-nodes',
            paint: {
              'circle-radius': [
                'case',
                ['get', 'is_destination'],
                11,
                ['get', 'is_rescue_transfer'],
                9,
                ['get', 'is_current'],
                9,
                0,
              ],
              'circle-color': [
                'case',
                ['get', 'is_destination'],
                '#0F294A',
                ['get', 'is_rescue_transfer'],
                '#F59E0B',
                '#10B981',
              ],
              'circle-opacity': 0.25,
            },
          });

          map.addLayer({
            id: 'station-circles',
            type: 'circle',
            source: 'station-nodes',
            paint: {
              'circle-radius': [
                'case',
                ['get', 'is_destination'],
                6,
                ['get', 'is_current'],
                5.5,
                4.5,
              ],
              'circle-color': '#FFFFFF',
              'circle-stroke-color': [
                'case',
                ['get', 'is_destination'],
                '#0F294A',
                ['get', 'is_rescue_transfer'],
                '#D97706',
                ['get', 'is_current'],
                '#059669',
                '#64748B',
              ],
              'circle-stroke-width': 2.5,
            },
          });

          // Station labels: Anchored RIGHT with offset and crisp white halo
          map.addLayer({
            id: 'station-labels',
            type: 'symbol',
            source: 'station-nodes',
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 12,
              'text-offset': [-1.0, 0],
              'text-anchor': 'right',
            },
            paint: {
              'text-color': '#0F172A',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 2.5,
            },
          });

          // 7. Live Trains GeoJSON Source (Snapped strictly to railway polyline)
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

          map.addSource('trains-source', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: initialTrainFeatures,
            },
          });

          // Selected train pulsing orange/navy halo
          map.addLayer({
            id: 'trains-halo',
            type: 'circle',
            source: 'trains-source',
            paint: {
              'circle-radius': [
                'case',
                ['get', 'is_target'],
                16,
                8,
              ],
              'circle-color': [
                'case',
                ['get', 'is_target'],
                '#F97316',
                '#3B82F6',
              ],
              'circle-opacity': [
                'case',
                ['get', 'is_target'],
                0.35,
                0.2,
              ],
            },
          });

          // Train core point
          map.addLayer({
            id: 'trains-point',
            type: 'circle',
            source: 'trains-source',
            paint: {
              'circle-radius': [
                'case',
                ['get', 'is_target'],
                8,
                5.5,
              ],
              'circle-color': [
                'case',
                ['get', 'is_target'],
                '#EA580C',
                '#2563EB',
              ],
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2.5,
            },
          });

          // Train label
          map.addLayer({
            id: 'trains-label',
            type: 'symbol',
            source: 'trains-source',
            layout: {
              'text-field': [
                'case',
                ['get', 'is_target'],
                ['concat', ['get', 'train_no'], ' • ', ['get', 'train_name']],
                ['concat', ['get', 'train_no'], ' (+', ['to-string', ['get', 'delay_mins']], 'm)'],
              ],
              'text-size': 12,
              'text-offset': [1.4, 0],
              'text-anchor': 'left',
            },
            paint: {
              'text-color': '#0F172A',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 2.5,
            },
          });

          // ==========================================
          // Interactive Marker Popups (Section 8)
          // ==========================================

          // Train click handler
          map.on('click', 'trains-point', (e) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties as any;
            const coords = (e.features[0].geometry as any).coordinates.slice();

            closeActivePopup();

            const isTarget = props.is_target;
            const trainNo = escapeHtml(props.train_no);
            const trainName = escapeHtml(props.train_name);
            const delay = Math.round(Number(props.delay_mins) || 0);
            const speed = Math.round(Number(props.speed_kmph) || 0);
            const curStation = escapeHtml(props.current_station);
            const nxtStation = escapeHtml(props.next_station || 'BBS');

            const popupHtml = `
              <div class="p-3 max-w-xs text-xs space-y-2">
                <div class="flex items-center justify-between border-b pb-1.5 border-slate-100">
                  <div class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full ${isTarget ? 'bg-orange-500 ring-2 ring-orange-200' : 'bg-blue-600'}"></span>
                    <strong class="font-bold text-sm text-[#0F294A]">${trainNo} ${trainName}</strong>
                  </div>
                  <span class="px-1.5 py-0.5 rounded text-xs font-bold ${isTarget ? 'bg-orange-50 text-orange-800' : 'bg-slate-100 text-slate-700'}">
                    ${isTarget ? 'Your Train' : 'Corridor Train'}
                  </span>
                </div>
                <div class="space-y-1 text-slate-600 font-medium">
                  <div class="flex justify-between">
                    <span>Running Status:</span>
                    <strong class="${delay > 5 ? 'text-amber-800' : 'text-emerald-700'} font-bold">
                      ${delay > 0 ? `+${delay}m late` : 'On Time'} • ${speed > 0 ? `${speed} km/h` : 'At Station'}
                    </strong>
                  </div>
                  <div class="flex justify-between">
                    <span>Position:</span>
                    <span class="text-slate-800 font-bold">${curStation ? `Platform ${curStation}` : `En route to ${nxtStation}`}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Data Source:</span>
                    <span class="text-slate-500 font-mono text-xs">Real-Time Corridor Telemetry</span>
                  </div>
                </div>
                ${
                  !isTarget
                    ? `<button id="btn-track-${props.train_no}" class="w-full mt-1.5 py-1 px-2.5 bg-[#0F294A] hover:bg-slate-800 text-white font-bold rounded-lg text-center transition-colors cursor-pointer text-xs">
                        Track this train
                      </button>`
                    : ''
                }
              </div>
            `;

            const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
              .setLngLat(coords)
              .setHTML(popupHtml)
              .addTo(map);

            activePopupRef.current = popup;

            // Wire up "Track this train" button inside popup
            setTimeout(() => {
              const btn = document.getElementById(`btn-track-${props.train_no}`);
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

            const stnName = escapeHtml(props.name);
            const stnCode = escapeHtml(props.code);
            const roleBadge = escapeHtml(props.role_badge);
            const explanation = escapeHtml(props.explanation);
            const kmFormatted = Number(props.km || 0).toFixed(1);

            const popupHtml = `
              <div class="p-3 max-w-xs text-xs space-y-2">
                <div class="flex items-center justify-between border-b pb-1.5 border-slate-100">
                  <strong class="font-bold text-sm text-[#0F294A]">${stnName} (${stnCode})</strong>
                  <span class="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-700">km ${kmFormatted}</span>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-bold text-[#0F294A]">${roleBadge}</div>
                  <p class="text-slate-600 leading-snug">${explanation}</p>
                </div>
                ${
                  props.code === 'BBS'
                    ? `<div class="bg-slate-50 p-1.5 rounded border border-slate-200 text-xs text-slate-700 font-medium">
                        Expected Arrival: <strong class="text-[#0F294A] font-bold">${escapeHtml(prediction.expectedTime)}</strong> (Window: ${escapeHtml(prediction.likelyWindow)})
                      </div>`
                    : ''
                }
              </div>
            `;

            const popup = new maplibregl.Popup({ offset: 10, closeButton: true })
              .setLngLat(coords)
              .setHTML(popupHtml)
              .addTo(map);

            activePopupRef.current = popup;
          });

          // Change cursor to pointer over interactive layers
          ['trains-point', 'station-circles', 'freight-hazard-core', 'freight-hazard-casing', 'freight-badge-layer'].forEach((layerId) => {
            map.on('mouseenter', layerId, () => {
              map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', layerId, () => {
              map.getCanvas().style.cursor = '';
            });
          });

          // Direct click on delay hazard on map triggers Goods Train Ahead view & popup
          ['freight-hazard-core', 'freight-hazard-casing', 'freight-badge-layer'].forEach((layerId) => {
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
      closeActivePopup();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Run on mount

  // Update track completed vs remaining geometry when trainKm changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const completedSource = map.getSource('completed-track-source') as any;
    if (completedSource && typeof completedSource.setData === 'function') {
      completedSource.setData({
        type: 'Feature',
        properties: { name: 'Completed Section' },
        geometry: { type: 'LineString', coordinates: completedCoords },
      });
    }

    const remainingSource = map.getSource('remaining-track-source') as any;
    if (remainingSource && typeof remainingSource.setData === 'function') {
      remainingSource.setData({
        type: 'Feature',
        properties: { name: 'Remaining Section' },
        geometry: { type: 'LineString', coordinates: remainingCoords },
      });
    }
  }, [completedCoords, remainingCoords]);

  // Synchronize NH-16 Rescue route visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const shouldShowRescue = isRescueAvailable || activeMapView === 'alternative_route';
    const visibility = shouldShowRescue ? 'visible' : 'none';

    if (map.getLayer('nh16-highway-casing')) {
      map.setLayoutProperty('nh16-highway-casing', 'visibility', visibility);
    }
    if (map.getLayer('nh16-highway-line')) {
      map.setLayoutProperty('nh16-highway-line', 'visibility', visibility);
    }
    if (map.getLayer('nh16-highway-badge')) {
      map.setLayoutProperty('nh16-highway-badge', 'visibility', visibility);
    }
  }, [isRescueAvailable, activeMapView]);

  // Synchronize phantom freight slow-zone visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasActiveFreight =
      (activeSnapshot.phantom_freights?.length ?? 0) > 0 || activeMapView === 'delays_ahead';
    const visibility = hasActiveFreight ? 'visible' : 'none';

    for (const layerId of ['freight-hazard-casing', 'freight-hazard-core', 'freight-badge-layer']) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    }
  }, [activeSnapshot.phantom_freights, activeMapView]);

  // Keep latest train coordinates in a ref so 1.5s WebSocket ticks never hijack manual user zoom/pan
  const currentTrainRef = useRef(currentTrain);
  currentTrainRef.current = currentTrain;

  // Synchronize Map Camera with activeMapView ONLY when view mode or selected train changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const trainSnapshot = currentTrainRef.current;
    if (activeMapView === 'my_train') {
      closeActivePopup();
      if (trainSnapshot && trainSnapshot.lon && trainSnapshot.lat) {
        if (selectedTrain === '12821') {
          // Smoothly fit bounds around Nergundi Jn -> Cuttack Jn -> Barang Jn -> Bhubaneswar
          map.fitBounds(
            [
              [85.76, 20.23],
              [85.96, 20.52],
            ],
            { padding: { top: 75, bottom: 85, left: 60, right: 60 }, duration: 600 }
          );
        } else {
          // For other trains (Vande Bharat 22895 or Sri Jagannath 18410), center camera directly on the train
          map.flyTo({
            center: [trainSnapshot.lon, trainSnapshot.lat],
            zoom: 12.2,
            speed: 1.2,
            duration: 600,
          });
        }
      } else {
        map.fitBounds(
          [
            [85.76, 20.23],
            [85.96, 20.52],
          ],
          { padding: { top: 75, bottom: 85, left: 60, right: 60 }, duration: 600 }
        );
      }
    } else if (activeMapView === 'delays_ahead') {
      map.fitBounds(
        [
          [85.80, 20.36],
          [85.92, 20.49],
        ],
        { padding: 85, duration: 600 }
      );
    } else if (activeMapView === 'alternative_route') {
      closeActivePopup();
      map.fitBounds(
        [
          [85.79, 20.24],
          [85.95, 20.48],
        ],
        { padding: 80, duration: 600 }
      );
    } else if (activeMapView === 'full_journey') {
      closeActivePopup();
      map.fitBounds(
        [
          [85.75, 19.78],
          [86.55, 21.08],
        ],
        { padding: { top: 70, bottom: 85, left: 50, right: 50 }, duration: 600 }
      );
    }
  }, [activeMapView, selectedTrain, closeActivePopup]);

  // Synchronize Delay Inspection between Left Dashboard and Map (Section 5)
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

      setTimeout(() => {
        if (!mapRef.current) return;
        openGoodsTrainPopup(mapRef.current);
      }, 150);
      return;
    }

    const causes = getDelayCauses(selectedTrain, forecast, currentTrain?.current_station);
    const targetCause = causes.find((c) => c.id === selectedDelayId);

    if (targetCause && targetCause.coordinates) {
      const targetCoords = targetCause.coordinates;
      map.flyTo({
        center: targetCoords,
        zoom: 12.0,
        speed: 1.2,
        duration: 800,
      });

      const displayTag = targetCause.tag === 'Projected (+12m)' || targetCause.id === 'cause-1'
        ? '~12 min wait'
        : targetCause.tag;

      const displayTitle = targetCause.popupTitle || targetCause.title;
      const displayLocation = targetCause.locationName || 'Trunk corridor';
      const displayMessage = targetCause.id === 'cause-1'
        ? 'Your train will pause briefly at Cuttack so the faster 22895 Vande Bharat can pass ahead.'
        : (targetCause.popupMessage || targetCause.explanation);

      const popupHtml = `
        <div class="w-[300px] p-3.5 text-sm space-y-2 font-sans">
          <!-- Row 1: Top bar (status dot + soft amber badge, clean space for close button) -->
          <div class="flex items-center justify-between pr-6">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
                ${displayTag}
              </span>
            </div>
          </div>

          <!-- Row 2: Full-width Title -->
          <h4 class="font-bold text-[15px] leading-snug text-slate-900 pt-0.5">
            ${displayTitle}
          </h4>

          <!-- Row 3: Location + Plain Description -->
          <div class="pt-1.5 border-t border-slate-100">
            <div class="text-xs font-semibold text-slate-500 mb-1">${displayLocation}</div>
            <p class="text-slate-700 leading-relaxed text-[13px] sm:text-sm">${displayMessage}</p>
          </div>
        </div>
      `;

      setTimeout(() => {
        if (!mapRef.current) return;
        const popup = new maplibregl.Popup({ anchor: 'right', offset: [-16, 0], closeButton: true, maxWidth: '320px' })
          .setLngLat(targetCoords)
          .setHTML(popupHtml)
          .addTo(mapRef.current);

        activePopupRef.current = popup;
      }, 150);
    }
  }, [selectedDelayId, selectedTrain, forecast, currentTrain?.current_station, closeActivePopup, openGoodsTrainPopup]);

  return (
    <div
      className={`relative w-full h-full bg-[#FAF9F6] overflow-hidden ${
        isModal
          ? 'rounded-none border-0'
          : 'min-h-[500px] rounded-2xl border border-[#E5E7EB] shadow-xs'
      }`}
    >
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* ======================================================== */}
      {/* Top-Right: Simplified Passenger Map Controls (Section 6) */}
      {/* ======================================================== */}
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

      {/* Contextual Clean Map Legend (Section 10) */}
      <MapLegend />
    </div>
  );
};
