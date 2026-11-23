import React, { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTrainAnimator } from './useTrainAnimator';
import { MapLegend } from './MapLegend';
import { fetchCorridorConfig } from '../../services/api';
import { Maximize2, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';

// Verified ECoR Track & Station Topology
const STATIONS = [
  { code: 'BHC', name: 'Bhadrak', km: 0.0, coords: [86.4950, 21.0583] },
  { code: 'JJKR', name: 'Jajpur K. Rd', km: 44.0, coords: [86.1333, 20.9500] },
  { code: 'JKPR', name: 'Jakhapura Jn', km: 51.0, coords: [86.0600, 20.9400] },
  { code: 'NRG', name: 'Nergundi Jn', km: 106.0, coords: [85.9200, 20.5500] },
  { code: 'CTC', name: 'Cuttack Jn', km: 115.0, coords: [85.8829, 20.4625] },
  { code: 'BRAG', name: 'Barang Jn', km: 128.0, coords: [85.8300, 20.4000] },
  { code: 'BBS', name: 'Bhubaneswar', km: 143.0, coords: [85.8333, 20.2667] },
  { code: 'KUR', name: 'Khurda Rd Jn', km: 162.0, coords: [85.7333, 20.1833] },
  { code: 'PURI', name: 'Puri', km: 206.0, coords: [85.8314, 19.8133] },
];

const TRACK_COORDS = STATIONS.map((s) => s.coords);

const NH16_COORDS = [
  [85.8829, 20.4625], // Cuttack Jn
  [85.8920, 20.4430], // OMP Square
  [85.8750, 20.3700], // Phulnakhara
  [85.8580, 20.3010], // Rasulgarh
  [85.8333, 20.2667], // Bhubaneswar Stn
];

/**
 * Creates a rock-solid, zero-crash raster basemap style.
 * Uses Mapbox Light-v11 tiles when access token is present; falls back to OpenStreetMap.
 */
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

  // Attach 60 FPS GPU vector animator
  useTrainAnimator(mapRef);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isCancelled = false;

    // Fetch config to check for Mapbox Access Token
    fetchCorridorConfig()
      .then((cfg) => {
        if (isCancelled || !mapContainerRef.current || mapRef.current) return;

        const baseStyle = createBaseMapStyle(cfg.mapbox_access_token);

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: baseStyle,
          center: [85.88, 20.46], // Center near Cuttack
          zoom: 8.8,
          attributionControl: false,
        });

        mapRef.current = map;

        // Auto-resize observer to handle flexbox rendering
        const resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        if (mapContainerRef.current) {
          resizeObserver.observe(mapContainerRef.current);
        }

        map.on('load', () => {
          // Fit corridor bounds nicely
          map.fitBounds(
            [
              [85.55, 19.75], // SW (Puri)
              [86.60, 21.15], // NE (Bhadrak)
            ],
            { padding: 35, duration: 600 }
          );

          // 1. Add Railway Track Line
          map.addSource('railway-track', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: 'ECoR Trunk Line' },
              geometry: {
                type: 'LineString',
                coordinates: TRACK_COORDS,
              },
            },
          });

          map.addLayer({
            id: 'railway-track-casing',
            type: 'line',
            source: 'railway-track',
            paint: {
              'line-color': '#94A3B8',
              'line-width': 6,
              'line-opacity': 0.5,
            },
          });

          map.addLayer({
            id: 'railway-track-line',
            type: 'line',
            source: 'railway-track',
            paint: {
              'line-color': '#0F172A',
              'line-width': 3,
            },
          });

          // 2. Add NH-16 Highway Road Transfer Route (CTC ➔ BBS)
          map.addSource('nh16-highway', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: 'NH-16 Expressway Bailout Route' },
              geometry: {
                type: 'LineString',
                coordinates: NH16_COORDS,
              },
            },
          });

          map.addLayer({
            id: 'nh16-highway-line',
            type: 'line',
            source: 'nh16-highway',
            paint: {
              'line-color': '#059669',
              'line-width': 3.5,
              'line-dasharray': [2, 2],
            },
          });

          // 3. Add Phantom Freight Shadow Hazard Zone (between NRG and CTC)
          map.addSource('freight-hazard-zone', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: 'Phantom Freight Shadow Zone' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [85.91, 20.56],
                    [85.93, 20.56],
                    [85.89, 20.45],
                    [85.87, 20.45],
                    [85.91, 20.56],
                  ],
                ],
              },
            },
          });

          map.addLayer({
            id: 'freight-hazard-layer',
            type: 'fill',
            source: 'freight-hazard-zone',
            paint: {
              'fill-color': '#F59E0B',
              'fill-opacity': 0.25,
            },
          });

          map.addLayer({
            id: 'freight-hazard-outline',
            type: 'line',
            source: 'freight-hazard-zone',
            paint: {
              'line-color': '#D97706',
              'line-width': 1.5,
              'line-dasharray': [3, 2],
            },
          });

          // 4. Add Station Nodes
          map.addSource('station-nodes', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: STATIONS.map((stn) => ({
                type: 'Feature',
                properties: {
                  code: stn.code,
                  name: stn.name,
                  km: stn.km,
                },
                geometry: {
                  type: 'Point',
                  coordinates: stn.coords,
                },
              })),
            },
          });

          map.addLayer({
            id: 'station-circles',
            type: 'circle',
            source: 'station-nodes',
            paint: {
              'circle-radius': 5.5,
              'circle-color': '#FFFFFF',
              'circle-stroke-color': '#0F172A',
              'circle-stroke-width': 2.5,
            },
          });

          map.addLayer({
            id: 'station-labels',
            type: 'symbol',
            source: 'station-nodes',
            layout: {
              'text-field': ['get', 'code'],
              'text-size': 11,
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
            },
            paint: {
              'text-color': '#0F172A',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 2,
            },
          });

          // 5. Add Live Trains GeoJSON Source for 60 FPS GPU Animator
          map.addSource('trains-source', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {
                    train_no: '12821',
                    train_name: 'Dhauli Exp',
                    speed_kmph: 64,
                    delay_mins: 28,
                    is_target: true,
                  },
                  geometry: {
                    type: 'Point',
                    coordinates: [85.8828, 20.4631],
                  },
                },
                {
                  type: 'Feature',
                  properties: {
                    train_no: '22895',
                    train_name: 'Vande Bharat',
                    speed_kmph: 130,
                    delay_mins: 2,
                    is_target: false,
                  },
                  geometry: {
                    type: 'Point',
                    coordinates: [86.1384, 20.8412],
                  },
                },
              ],
            },
          });

          // Train circle halo for target train
          map.addLayer({
            id: 'trains-halo',
            type: 'circle',
            source: 'trains-source',
            paint: {
              'circle-radius': [
                'case',
                ['get', 'is_target'],
                14,
                8,
              ],
              'circle-color': [
                'case',
                ['get', 'is_target'],
                '#10B981',
                '#3B82F6',
              ],
              'circle-opacity': 0.3,
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
                7,
                5,
              ],
              'circle-color': [
                'case',
                ['get', 'is_target'],
                '#059669',
                '#2563EB',
              ],
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            },
          });

          // Train labels
          map.addLayer({
            id: 'trains-label',
            type: 'symbol',
            source: 'trains-source',
            layout: {
              'text-field': [
                'concat',
                ['get', 'train_no'],
                ' (+',
                ['to-string', ['get', 'delay_mins']],
                'm)',
              ],
              'text-size': 11,
              'text-offset': [0, -1.4],
              'text-anchor': 'bottom',
            },
            paint: {
              'text-color': '#0F172A',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 2,
            },
          });
        });
      })
      .catch((err) => {
        console.warn('Map initialization config error:', err);
      });

    return () => {
      isCancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Controls
  const handleFitCorridor = () => {
    if (!mapRef.current) return;
    mapRef.current.fitBounds(
      [
        [85.55, 19.75], // SW (Puri)
        [86.60, 21.15], // NE (Bhadrak)
      ],
      { padding: 40, duration: 800 }
    );
  };

  const handleLocateTarget = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [85.8828, 20.4631], // Cuttack area
      zoom: 11.5,
      speed: 1.2,
    });
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  return (
    <div className="relative w-full h-full min-h-[500px] bg-[#FAF9F6] rounded-xl overflow-hidden border border-[#E5E7EB] shadow-xs">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Floating Toolbar Controls */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-[#E2E8F0] shadow-md pointer-events-auto">
        <button
          onClick={handleLocateTarget}
          title="Center on Target Train 12821"
          className="p-2 text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
        >
          <LocateFixed className="w-4 h-4 text-emerald-600" />
        </button>
        <button
          onClick={handleFitCorridor}
          title="Fit Full Corridor (BHC ➔ PURI)"
          className="p-2 text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="h-px bg-[#E2E8F0] my-0.5" />
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-2 text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-2 text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Legend */}
      <MapLegend />
    </div>
  );
};
