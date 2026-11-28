import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  SMOOTH_TRACK_COORDS,
  SMOOTH_NH16_COORDS,
  SMOOTH_CONGESTION_AHEAD_COORDS,
} from '../../services/corridorData';
import { REGIONAL_PLACES } from './mapConstants';
import { registerTrainSprites } from './trainSprite';

export function initCorridorMapLayers(
  map: MapLibreMap,
  completedCoords: [number, number][],
  remainingCoords: [number, number][],
  isRescueAvailable: boolean,
  stationFeatures: any[],
  initialTrainFeatures: any[],
  fullTrackCoords?: [number, number][],
  highwayCoords?: [number, number][],
  highwayBadgeLabel?: string,
  highwayBadgeCoords?: [number, number]
): void {
  // Hide built-in basemap place and label layers to avoid duplicate text behind station labels
  const styleLayers = map.getStyle().layers || [];
  for (const layer of styleLayers) {
    if (layer.id.includes('place') || layer.id.includes('label')) {
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch { }
    }
  }

  // 1. Natural Railway Track Solid White Casing (Halo)
  map.addSource('railway-track-casing-source', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: { name: 'Railway Trunk Line' },
      geometry: { type: 'LineString', coordinates: fullTrackCoords || SMOOTH_TRACK_COORDS },
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

  // 5. Dashed Emerald Highway Rescue Route
  map.addSource('nh16-highway', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: { name: 'Expressway Rescue Corridor' },
      geometry: { type: 'LineString', coordinates: highwayCoords || SMOOTH_NH16_COORDS },
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

  // Highway Rescue Pill Badge with crisp white halo
  map.addSource('nh16-badge-source', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: { label: highwayBadgeLabel || 'Cab from Cuttack • 21 mins faster' },
      geometry: {
        type: 'Point',
        coordinates: highwayBadgeCoords || [85.875, 20.370],
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
      features: stationFeatures,
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

  // 8. Live Trains GeoJSON Source & Upright Train Logo Badges
  registerTrainSprites(map);

  map.addSource('trains-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: initialTrainFeatures,
    },
  });

  // Upright compact train logo markers scaled nicely along the track
  map.addLayer({
    id: 'trains-point',
    type: 'symbol',
    source: 'trains-source',
    layout: {
      'icon-image': ['case', ['get', 'is_target'], 'train-target', 'train-other'],
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        8,
        ['case', ['get', 'is_target'], 0.78, 0.72],
        12,
        ['case', ['get', 'is_target'], 0.98, 0.88],
      ],
      'icon-rotation-alignment': 'viewport',
      'icon-pitch-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['case', ['get', 'is_target'], 2, 1],
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
      'text-offset': [1.6, 0],
      'text-anchor': 'left',
    },
    paint: {
      'text-color': '#0F172A',
      'text-halo-color': '#FFFFFF',
      'text-halo-width': 2.5,
    },
  });
}

export function updateRouteLineGeometry(
  map: MapLibreMap,
  completedCoords: [number, number][],
  remainingCoords: [number, number][]
): void {
  const completedSource = map.getSource('completed-track-source') as any;
  if (completedSource) {
    completedSource.setData({
      type: 'Feature',
      properties: { name: 'Completed Section' },
      geometry: { type: 'LineString', coordinates: completedCoords },
    });
  }

  const remainingSource = map.getSource('remaining-track-source') as any;
  if (remainingSource) {
    remainingSource.setData({
      type: 'Feature',
      properties: { name: 'Remaining Section' },
      geometry: { type: 'LineString', coordinates: remainingCoords },
    });
  }
}
