/**
 * Catmull-Rom spline interpolation for dense, natural railway & highway geometries.
 */
function catmullRomSpline(points: [number, number][], numSamples = 8): [number, number][] {
  if (points.length < 2) return points;
  const result: [number, number][] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    for (let j = 0; j < numSamples; j++) {
      const t = j / numSamples;
      const t2 = t * t;
      const t3 = t2 * t;

      const lon =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);

      const lat =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

      result.push([Number(lon.toFixed(5)), Number(lat.toFixed(5))]);
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

// Full East Coast Railway trunk line waypoints (Bhadrak to Puri)
const ECOR_STATION_WAYPOINTS: [number, number][] = [
  [86.4950, 21.0583], // BHC - Bhadrak
  [86.3750, 21.0120], // Kenduapada
  [86.2750, 20.9780], // Manjuri Road
  [86.1950, 20.9600], // Baitarani Road
  [86.1333, 20.9500], // JJKR - Jajpur Keonjhar Road
  [86.0600, 20.9400], // JKPR - Jakhapura Junction
  [86.0100, 20.8500], // Haridaspur
  [85.9800, 20.7600], // Dhanmandal
  [85.9600, 20.6700], // Barchana
  [85.9350, 20.5900], // Kapilas Road
  [85.9200, 20.5500], // NRG - Nergundi Junction
  [85.8950, 20.4900], // Kendrapara Road
  [85.8829, 20.4625], // CTC - Cuttack Junction
  [85.8500, 20.4250], // Gopalpur Balikuda
  [85.8300, 20.4000], // BRAG - Barang Junction
  [85.8320, 20.3300], // Mancheswar
  [85.8330, 20.2950], // Vani Vihar
  [85.8333, 20.2667], // BBS - Bhubaneswar
  [85.8150, 20.2300], // Lingaraj Temple Road
  [85.7700, 20.2000], // Retang
  [85.7333, 20.1833], // KUR - Khurda Road Junction
  [85.7400, 20.1200], // Motari
  [85.7700, 20.0200], // Delang
  [85.7900, 19.9500], // Kanas Road
  [85.8100, 19.9000], // Sakhi Gopal
  [85.8200, 19.8500], // Malatipatpur
  [85.8314, 19.8133], // PURI - Puri Terminal
];

// NH-16 Highway expressway bailout alignment (Cuttack to Bhubaneswar)
const NH16_HIGHWAY_WAYPOINTS: [number, number][] = [
  [85.8829, 20.4625], // Cuttack Station
  [85.8920, 20.4430], // OMP Square
  [85.8850, 20.4100], // Telengapentha
  [85.8750, 20.3700], // Phulnakhara
  [85.8650, 20.3350], // Hanspal
  [85.8580, 20.3010], // Rasulgarh Square
  [85.8450, 20.2850], // Vani Vihar Square
  [85.8333, 20.2667], // Master Canteen / Bhubaneswar Station
];

// South Eastern Railway Kolkata Trunk Line waypoints (Howrah to Kharagpur Junction)
const SER_HWH_KGP_WAYPOINTS: [number, number][] = [
  [88.3426, 22.5830], // HWH - Howrah Junction
  [88.2830, 22.5800], // SRC - Santragachi Junction
  [88.1100, 22.4700], // ULB - Uluberia
  [87.9700, 22.4600], // BZN - Bagnan
  [87.8600, 22.4200], // MCA - Mecheda Junction
  [87.7200, 22.4100], // PKU - Panskura Junction
  [87.5500, 22.3700], // BCK - Balichak
  [87.3200, 22.3300], // KGP - Kharagpur Junction
];

// High-resolution smooth Catmull-Rom geometries
export const SMOOTH_TRACK_COORDS = catmullRomSpline(ECOR_STATION_WAYPOINTS, 8);
export const SMOOTH_NH16_COORDS = catmullRomSpline(NH16_HIGHWAY_WAYPOINTS, 8);

const SMOOTH_HWH_KGP_TRACK_COORDS = catmullRomSpline(SER_HWH_KGP_WAYPOINTS, 8);

// Active Delay Ahead: Cuttack (CTC) down to Barang (BRAG) & Mancheswar
// Physically ahead of southbound train 12821 towards Bhubaneswar
const CONGESTION_AHEAD_WAYPOINTS: [number, number][] = [
  [85.8829, 20.4625], // CTC - Cuttack Junction
  [85.8500, 20.4250], // Gopalpur Balikuda
  [85.8300, 20.4000], // BRAG - Barang Junction
  [85.8320, 20.3300], // Mancheswar
];
export const SMOOTH_CONGESTION_AHEAD_COORDS = catmullRomSpline(CONGESTION_AHEAD_WAYPOINTS, 8);
const SMOOTH_KOLKATA_CONGESTION_AHEAD_COORDS = SMOOTH_HWH_KGP_TRACK_COORDS.slice(8, 17);

interface TrackMatchResult {
  coords: [number, number];
}

function findClosestTrackMatch(
  lon: number,
  lat: number,
  coords?: [number, number][]
): TrackMatchResult {
  const defaultTrack = lon >= 87.0 ? SMOOTH_HWH_KGP_TRACK_COORDS : SMOOTH_TRACK_COORDS;
  const track = coords && coords.length >= 2 ? coords : defaultTrack;
  if (!track || track.length < 2) {
    return { coords: [lon, lat] };
  }

  let minDistanceSq = Infinity;
  let bestPoint: [number, number] = [lon, lat];

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];

    let t = 0;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 0) {
      t = ((lon - a[0]) * dx + (lat - a[1]) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projX = a[0] + t * dx;
    const projY = a[1] + t * dy;

    const distSq = (lon - projX) * (lon - projX) + (lat - projY) * (lat - projY);
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      bestPoint = [projX, projY];
    }
  }

  return { coords: bestPoint };
}

/**
 * Snaps any coordinate [lon, lat] onto the nearest point along the provided or active track coordinates.
 * Prevents trains from visually drifting or rendering off the physical railway line.
 */
export function snapPointToTrack(
  lon: number,
  lat: number,
  coords?: [number, number][]
): [number, number] {
  return findClosestTrackMatch(lon, lat, coords).coords;
}

const STATION_WAYPOINT_INDEX: Record<string, number> = {
  BHC: 0,
  JJKR: 4,
  JKPR: 5,
  NRG: 10,
  CTC: 12,
  BRAG: 14,
  BBS: 17,
  KUR: 20,
  PURI: 26,
};

const STATION_NAMES_MAP: Record<string, string> = {
  BHC: 'Bhadrak',
  JJKR: 'Jajpur Keonjhar Rd',
  JKPR: 'Jakhapura Jn',
  NRG: 'Nergundi Jn',
  CTC: 'Cuttack Jn',
  BRAG: 'Barang Jn',
  BBS: 'Bhubaneswar',
  KUR: 'Khurda Road Jn',
  PURI: 'Puri',
};

const SER_STATION_WAYPOINT_INDEX: Record<string, number> = {
  HWH: 0,
  SRC: 1,
  ULB: 2,
  BZN: 3,
  MCA: 4,
  PKU: 5,
  BCK: 6,
  KGP: 7,
};

const SER_STATION_NAMES_MAP: Record<string, string> = {
  HWH: 'Howrah Jn',
  SRC: 'Santragachi Jn',
  ULB: 'Uluberia',
  BZN: 'Bagnan',
  MCA: 'Mecheda Jn',
  PKU: 'Panskura Jn',
  BCK: 'Balichak',
  KGP: 'Kharagpur Jn',
};

/**
 * Extracts the exact smooth railway polyline slice and midpoint for any block ID (e.g. DN_CTC_BRAG, DN_SRC_ULB, DN_MCA_PKU).
 */
export function getTrackSliceForBlock(
  blockId?: string | null,
  corridorId?: string
): {
  coords: [number, number][];
  midpoint: [number, number];
  fromCode: string;
  toCode: string;
  fromName: string;
  toName: string;
} {
  const isSERDefault = corridorId === 'SER_HWH_KGP';

  if (!blockId || !blockId.includes('_')) {
    if (isSERDefault) {
      return {
        coords: SMOOTH_KOLKATA_CONGESTION_AHEAD_COORDS,
        midpoint: [88.196, 22.525],
        fromCode: 'SRC',
        toCode: 'ULB',
        fromName: 'Santragachi Jn',
        toName: 'Uluberia',
      };
    }
    return {
      coords: SMOOTH_CONGESTION_AHEAD_COORDS,
      midpoint: [85.856, 20.431],
      fromCode: 'CTC',
      toCode: 'BRAG',
      fromName: 'Cuttack Jn',
      toName: 'Barang Jn',
    };
  }

  const parts = blockId.split('_');
  const fromCode = parts[1] || (isSERDefault ? 'SRC' : 'CTC');
  const toCode = parts[2] || (isSERDefault ? 'ULB' : 'BRAG');

  const isSER =
    isSERDefault ||
    fromCode in SER_STATION_WAYPOINT_INDEX ||
    toCode in SER_STATION_WAYPOINT_INDEX;

  if (isSER) {
    const idxA = SER_STATION_WAYPOINT_INDEX[fromCode];
    const idxB = SER_STATION_WAYPOINT_INDEX[toCode];

    if (idxA === undefined || idxB === undefined) {
      return {
        coords: SMOOTH_KOLKATA_CONGESTION_AHEAD_COORDS,
        midpoint: [88.196, 22.525],
        fromCode,
        toCode,
        fromName: SER_STATION_NAMES_MAP[fromCode] || fromCode,
        toName: SER_STATION_NAMES_MAP[toCode] || toCode,
      };
    }

    const startIdx = Math.min(idxA, idxB) * 8;
    const endIdx = Math.min(SMOOTH_HWH_KGP_TRACK_COORDS.length - 1, Math.max(idxA, idxB) * 8);
    const coords = SMOOTH_HWH_KGP_TRACK_COORDS.slice(startIdx, endIdx + 1);
    const midpoint = coords[Math.floor(coords.length / 2)] || [88.196, 22.525];

    return {
      coords: coords.length >= 2 ? coords : SMOOTH_KOLKATA_CONGESTION_AHEAD_COORDS,
      midpoint,
      fromCode,
      toCode,
      fromName: SER_STATION_NAMES_MAP[fromCode] || fromCode,
      toName: SER_STATION_NAMES_MAP[toCode] || toCode,
    };
  }

  const idxA = STATION_WAYPOINT_INDEX[fromCode];
  const idxB = STATION_WAYPOINT_INDEX[toCode];

  if (idxA === undefined || idxB === undefined) {
    return {
      coords: SMOOTH_CONGESTION_AHEAD_COORDS,
      midpoint: [85.856, 20.431],
      fromCode,
      toCode,
      fromName: STATION_NAMES_MAP[fromCode] || fromCode,
      toName: STATION_NAMES_MAP[toCode] || toCode,
    };
  }

  const startIdx = Math.min(idxA, idxB) * 8;
  const endIdx = Math.min(SMOOTH_TRACK_COORDS.length - 1, Math.max(idxA, idxB) * 8);
  const coords = SMOOTH_TRACK_COORDS.slice(startIdx, endIdx + 1);
  const midpoint = coords[Math.floor(coords.length / 2)] || [85.856, 20.431];

  return {
    coords: coords.length >= 2 ? coords : SMOOTH_CONGESTION_AHEAD_COORDS,
    midpoint,
    fromCode,
    toCode,
    fromName: STATION_NAMES_MAP[fromCode] || fromCode,
    toName: STATION_NAMES_MAP[toCode] || toCode,
  };
}


