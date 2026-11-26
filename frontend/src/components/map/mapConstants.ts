// Verified ECoR Stations on the Corridor
export interface CorridorStation {
  code: string;
  name: string;
  km: number;
  coords: [number, number];
}

export const STATIONS: CorridorStation[] = [
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

// Curated regional places and landmarks in subtle monochrome typography
export interface RegionalPlace {
  name: string;
  type: 'town' | 'landmark' | 'water';
  coords: [number, number];
}

export const REGIONAL_PLACES: RegionalPlace[] = [
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

export function createBaseMapStyle(mapboxToken?: string | null): string {
  if (mapboxToken) {
    return `https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=${mapboxToken}`;
  }
  return 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
}

export type MapCameraView = 'my_train' | 'delays_ahead' | 'alternative_route' | 'full_journey';

export interface CameraPreset {
  bounds: [[number, number], [number, number]];
  padding: number | { top: number; bottom: number; left: number; right: number };
  duration: number;
}

export const CAMERA_PRESETS: Record<MapCameraView, CameraPreset> = {
  my_train: {
    bounds: [
      [85.76, 20.23],
      [85.96, 20.52],
    ],
    padding: { top: 75, bottom: 85, left: 60, right: 60 },
    duration: 600,
  },
  delays_ahead: {
    bounds: [
      [85.80, 20.36],
      [85.92, 20.49],
    ],
    padding: 85,
    duration: 600,
  },
  alternative_route: {
    bounds: [
      [85.79, 20.24],
      [85.95, 20.48],
    ],
    padding: 80,
    duration: 600,
  },
  full_journey: {
    bounds: [
      [85.75, 19.78],
      [86.55, 21.08],
    ],
    padding: { top: 70, bottom: 85, left: 50, right: 50 },
    duration: 600,
  },
};
