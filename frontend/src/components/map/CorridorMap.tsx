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

function createBaseMapStyle(mapboxToken?: string | null): any {
  const tileUrl = mapboxToken
    ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}?access_token=${mapboxToken}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'basemap-raster': {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: mapboxToken ? '© Mapbox © OpenStreetMap' : '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'basemap-layer',
        type: 'raster',
        source: 'basemap-raster',
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}

export const CorridorMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activePopupRef = useRef<MapLibrePopup | null>(null);

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
    const progressRatio = Math.min(1, Math.max(0, trainKm / totalKm));
    const splitIndex = Math.floor(progressRatio * (SMOOTH_TRACK_COORDS.length - 1));

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
            [85.80, 20.24], // SW: Bhubaneswar
            [85.92, 20.50], // NE: Cuttack
          ],
          { padding: 50, duration: 800 }
        );
      } else if (view === 'delays_ahead') {
        setSelectedDelayId('cause-2');
        // Smoothly zoom in on the delay zone ahead of the train
        map.flyTo({
          center: [85.856, 20.431],
          zoom: 12.2,
          speed: 1.2,
          duration: 800,
        });

        // Show non-blocking delay explanation popup anchored to the left of the track
        setTimeout(() => {
          if (!mapRef.current) return;
          openGoodsTrainPopup(mapRef.current);
        }, 200);
      } else if (view === 'alternative_route') {
        if (map.getLayer('nh16-highway-line')) {
          map.setLayoutProperty('nh16-highway-line', 'visibility', 'visible');
        }
        if (map.getLayer('nh16-highway-badge')) {
          map.setLayoutProperty('nh16-highway-badge', 'visibility', 'visible');
        }
        map.fitBounds(
          [
            [85.80, 20.24], // SW: Bhubaneswar
            [85.92, 20.48], // NE: Cuttack
          ],
          { padding: 50, duration: 800 }
        );
      } else if (view === 'full_journey') {
        setSelectedDelayId(null);
        map.fitBounds(
          [
            [85.55, 19.75], // SW (Puri)
            [86.60, 21.15], // NE (Bhadrak)
          ],
          { padding: 40, duration: 800 }
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
          // Hide built-in basemap city/town place label layers to avoid duplicate text
          const styleLayers = map.getStyle().layers || [];
          for (const layer of styleLayers) {
            if (
              layer.type === 'symbol' &&
              (layer.id.includes('place') ||
                layer.id.includes('label') ||
                layer.id.includes('town') ||
                layer.id.includes('city') ||
                layer.id.includes('settlement'))
            ) {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
            }
          }

          // Default initial view: Focus on active rescue action corridor (Cuttack to Bhubaneswar)
          map.fitBounds(
            [
              [85.80, 20.24], // SW: South of Bhubaneswar
              [85.92, 20.50], // NE: North of Cuttack
            ],
            { padding: 50, duration: 600 }
          );

          // 1. Natural Railway Track (Casing)
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
            paint: {
              'line-color': '#94A3B8',
              'line-width': 5.5,
              'line-opacity': 0.4,
            },
          });

          // 2. Completed Journey Section (Muted neutral line)
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
            paint: {
              'line-color': '#CBD5E1',
              'line-width': 3,
              'line-opacity': 0.85,
            },
          });

          // 3. Remaining Journey Section (Prominent navy line)
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
            paint: {
              'line-color': '#0F294A',
              'line-width': 3.5,
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
              'text-color': '#0F294A',
              'text-opacity': 0.75,
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 1,
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

          map.addLayer({
            id: 'freight-hazard-glow',
            type: 'line',
            source: 'freight-hazard-source',
            paint: {
              'line-color': '#F59E0B',
              'line-width': 8,
              'line-opacity': 0.45,
            },
          });

          map.addLayer({
            id: 'freight-hazard-core',
            type: 'line',
            source: 'freight-hazard-source',
            paint: {
              'line-color': '#D97706',
              'line-width': 3,
              'line-dasharray': [3, 2],
            },
          });

          // Delay badge: Plain passenger copy "Goods Train Ahead (~14m delay)"
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
              'text-halo-color': '#FEF3C7',
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

          map.addLayer({
            id: 'nh16-highway-line',
            type: 'line',
            source: 'nh16-highway',
            layout: {
              visibility: isRescueAvailable ? 'visible' : 'none',
            },
            paint: {
              'line-color': '#10B981',
              'line-width': 4,
              'line-dasharray': [2, 2],
            },
          });

          // NH-16 Rescue Pill Badge
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
              'text-halo-color': '#D1FAE5',
              'text-halo-width': 2.5,
            },
          });

          // 6. Station Nodes
          map.addSource('station-nodes', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: STATIONS.map((stn) => {
                const isPassed = trainKm > stn.km + 4;
                const isCurrent = Math.abs(stn.km - trainKm) <= 6;
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

          // Station labels: Anchored RIGHT with offset
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
              'text-halo-width': 2,
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
            const trainNo = props.train_no;
            const trainName = props.train_name;
            const delay = props.delay_mins;
            const speed = props.speed_kmph;

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
                      ${delay > 0 ? `+${delay}m late` : 'On Time'} • ${speed > 0 ? `${speed} km/h` : props.current_station ? 'At Platform' : props.status === 'AT_TERMINUS' ? 'Terminus' : 'Halted on Block'}
                    </strong>
                  </div>
                  <div class="flex justify-between">
                    <span>Position:</span>
                    <span class="text-slate-800 font-bold">${props.status === 'AT_TERMINUS' ? `Terminus ${props.current_station || 'PURI'}` : props.current_station ? `Platform ${props.current_station}` : `En route to ${props.next_station || 'BBS'}`}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Data Source:</span>
                    <span class="text-slate-500 font-mono text-xs">Real-Time Corridor Telemetry</span>
                  </div>
                </div>
                ${
                  !isTarget
                    ? `<button id="btn-track-${trainNo}" class="w-full mt-1.5 py-1 px-2.5 bg-[#0F294A] hover:bg-slate-800 text-white font-bold rounded-lg text-center transition-colors cursor-pointer text-xs">
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
              const btn = document.getElementById(`btn-track-${trainNo}`);
              if (btn) {
                btn.onclick = () => {
                  setSelectedTrain(trainNo);
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

            const popupHtml = `
              <div class="p-3 max-w-xs text-xs space-y-2">
                <div class="flex items-center justify-between border-b pb-1.5 border-slate-100">
                  <strong class="font-bold text-sm text-[#0F294A]">${props.name} (${props.code})</strong>
                  <span class="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-700">km ${Number(props.km).toFixed(1)}</span>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-bold text-[#0F294A]">${props.role_badge}</div>
                  <p class="text-slate-600 leading-snug">${props.explanation}</p>
                </div>
                ${
                  props.code === 'BBS'
                    ? `<div class="bg-slate-50 p-1.5 rounded border border-slate-200 text-xs text-slate-700 font-medium">
                        Expected Arrival: <strong class="text-[#0F294A] font-bold">${prediction.expectedTime}</strong> (Window: ${prediction.likelyWindow})
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
          ['trains-point', 'station-circles', 'freight-hazard-core', 'freight-hazard-glow', 'freight-badge-layer'].forEach((layerId) => {
            map.on('mouseenter', layerId, () => {
              map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', layerId, () => {
              map.getCanvas().style.cursor = '';
            });
          });

          // Direct click on delay hazard on map triggers Goods Train Ahead view & popup
          ['freight-hazard-core', 'freight-hazard-glow', 'freight-badge-layer'].forEach((layerId) => {
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

    for (const layerId of ['freight-hazard-glow', 'freight-hazard-core', 'freight-badge-layer']) {
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
          // Smoothly fit bounds to active rescue action corridor (Cuttack to Bhubaneswar)
          map.fitBounds(
            [
              [85.80, 20.24], // SW: Bhubaneswar
              [85.92, 20.50], // NE: Cuttack
            ],
            { padding: 50, duration: 750 }
          );
        } else {
          // For other trains (Vande Bharat 22895 or Sri Jagannath 18410), center camera directly on the train
          map.flyTo({
            center: [trainSnapshot.lon, trainSnapshot.lat],
            zoom: 12.2,
            speed: 1.2,
            duration: 800,
          });
        }
      } else {
        map.fitBounds(
          [
            [85.80, 20.24],
            [85.92, 20.50],
          ],
          { padding: 50, duration: 750 }
        );
      }
    } else if (activeMapView === 'delays_ahead') {
      // Focus on active disruption sector ahead of train (Cuttack to Barang)
      map.flyTo({
        center: [85.856, 20.431],
        zoom: 12.2,
        speed: 1.2,
        duration: 900,
      });
    } else if (activeMapView === 'alternative_route') {
      closeActivePopup();
      // Fit bounds between Cuttack (CTC) and Bhubaneswar (BBS)
      map.fitBounds(
        [
          [85.80, 20.24], // SW: Bhubaneswar
          [85.92, 20.48], // NE: Cuttack
        ],
        { padding: 50, duration: 800 }
      );
    } else if (activeMapView === 'full_journey') {
      closeActivePopup();
      // Fit entire corridor (Bhadrak to Puri)
      map.fitBounds(
        [
          [85.55, 19.75], // SW (Puri)
          [86.60, 21.15], // NE (Bhadrak)
        ],
        { padding: 40, duration: 800 }
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
    <div className="relative w-full h-full min-h-[260px] md:min-h-[500px] bg-[#FAF9F6] rounded-2xl overflow-hidden border border-[#E5E7EB] shadow-xs">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* ======================================================== */}
      {/* Top-Right: Simplified Passenger Map Controls (Section 6) */}
      {/* ======================================================== */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex flex-col gap-2 pointer-events-auto items-end max-w-[calc(100%-24px)]">
        {/* Mode Switcher */}
        <div className="backdrop-blur-md bg-white/95 p-1 rounded-xl border border-[#E2E8F0] shadow-md flex items-center gap-1 max-w-[calc(100vw-24px)] overflow-x-auto">
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
