export interface CorridorStation {
  code: string;
  name: string;
  km: number;
}

export interface CorridorHalt {
  stationCode: string;
  stationName: string;
  arrTime: string;
  depTime: string;
  km: number;
}

export interface CorridorTrain {
  no: string;
  name: string;
  direction: 'DN' | 'UP';
  priorityRank: number;
  trainClass: 'SUPERFAST' | 'VANDE_BHARAT' | 'EXPRESS';
  badge: string;
  badgeColor: 'amber' | 'emerald' | 'blue';
  originCode: string;
  destCode: string;
  originName: string;
  destName: string;
  halts: CorridorHalt[];
}

export interface RouteSearchResult {
  train: CorridorTrain;
  fromHalt: CorridorHalt;
  toHalt: CorridorHalt;
  departureTime: string;
  arrivalTime: string;
  durationFormatted: string;
  intermediateHaltsCount: number;
}

// 6 passenger halt stations on the 206 km ECoR trunk corridor
export const CORRIDOR_STATIONS: CorridorStation[] = [
  { code: 'BHC', name: 'Bhadrak', km: 0.0 },
  { code: 'JJKR', name: 'Jajpur Keonjhar Road', km: 44.0 },
  { code: 'CTC', name: 'Cuttack Junction', km: 115.0 },
  { code: 'BBS', name: 'Bhubaneswar', km: 143.0 },
  { code: 'KUR', name: 'Khurda Road Junction', km: 162.0 },
  { code: 'PURI', name: 'Puri Terminal', km: 206.0 },
];

// Verified corridor trains based on topology and demo simulation
export const CORRIDOR_TRAINS: CorridorTrain[] = [
  {
    no: '12821',
    name: 'Dhauli Express',
    direction: 'DN',
    priorityRank: 2,
    trainClass: 'SUPERFAST',
    badge: '+28m delay (Approaching CTC)',
    badgeColor: 'amber',
    originCode: 'BHC',
    originName: 'Bhadrak',
    destCode: 'PURI',
    destName: 'Puri Terminal',
    halts: [
      { stationCode: 'BHC', stationName: 'Bhadrak', arrTime: '09:45 AM', depTime: '09:50 AM', km: 0.0 },
      { stationCode: 'JJKR', stationName: 'Jajpur Keonjhar Road', arrTime: '10:20 AM', depTime: '10:22 AM', km: 44.0 },
      { stationCode: 'CTC', stationName: 'Cuttack Junction', arrTime: '11:20 AM', depTime: '11:25 AM', km: 115.0 },
      { stationCode: 'BBS', stationName: 'Bhubaneswar', arrTime: '12:05 PM', depTime: '12:10 PM', km: 143.0 },
      { stationCode: 'KUR', stationName: 'Khurda Road Junction', arrTime: '12:35 PM', depTime: '12:40 PM', km: 162.0 },
      { stationCode: 'PURI', stationName: 'Puri Terminal', arrTime: '02:00 PM', depTime: '02:00 PM', km: 206.0 },
    ],
  },
  {
    no: '22895',
    name: 'Howrah-Puri Vande Bharat Express',
    direction: 'DN',
    priorityRank: 1,
    trainClass: 'VANDE_BHARAT',
    badge: 'On Time (130 km/h closing run)',
    badgeColor: 'emerald',
    originCode: 'BHC',
    originName: 'Bhadrak',
    destCode: 'PURI',
    destName: 'Puri Terminal',
    halts: [
      { stationCode: 'BHC', stationName: 'Bhadrak', arrTime: '10:15 AM', depTime: '10:17 AM', km: 0.0 },
      { stationCode: 'JJKR', stationName: 'Jajpur Keonjhar Road', arrTime: '10:45 AM', depTime: '10:47 AM', km: 44.0 },
      { stationCode: 'CTC', stationName: 'Cuttack Junction', arrTime: '11:38 AM', depTime: '11:40 AM', km: 115.0 },
      { stationCode: 'BBS', stationName: 'Bhubaneswar', arrTime: '12:10 PM', depTime: '12:12 PM', km: 143.0 },
      { stationCode: 'KUR', stationName: 'Khurda Road Junction', arrTime: '12:32 PM', depTime: '12:34 PM', km: 162.0 },
      { stationCode: 'PURI', stationName: 'Puri Terminal', arrTime: '01:35 PM', depTime: '01:35 PM', km: 206.0 },
    ],
  },
  {
    no: '18410',
    name: 'Sri Jagannath Express',
    direction: 'UP',
    priorityRank: 3,
    trainClass: 'EXPRESS',
    badge: '+5m delay (Normal UP Line)',
    badgeColor: 'blue',
    originCode: 'PURI',
    originName: 'Puri Terminal',
    destCode: 'BHC',
    destName: 'Bhadrak',
    halts: [
      { stationCode: 'PURI', stationName: 'Puri Terminal', arrTime: '09:30 AM', depTime: '09:30 AM', km: 206.0 },
      { stationCode: 'KUR', stationName: 'Khurda Road Junction', arrTime: '10:20 AM', depTime: '10:25 AM', km: 162.0 },
      { stationCode: 'BBS', stationName: 'Bhubaneswar', arrTime: '10:50 AM', depTime: '10:55 AM', km: 143.0 },
      { stationCode: 'CTC', stationName: 'Cuttack Junction', arrTime: '11:35 AM', depTime: '11:40 AM', km: 115.0 },
      { stationCode: 'JJKR', stationName: 'Jajpur Keonjhar Road', arrTime: '12:30 PM', depTime: '12:32 PM', km: 44.0 },
      { stationCode: 'BHC', stationName: 'Bhadrak', arrTime: '01:20 PM', depTime: '01:25 PM', km: 0.0 },
    ],
  },
];

// Helper: Parse time like "10:15 AM" or "14:00 PM" into minutes from midnight
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(/[:\s]/);
  if (parts.length < 2) return 0;
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const period = parts[2]?.toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

// Search trains by number or name substring
export function searchCorridorTrains(query: string): CorridorTrain[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return CORRIDOR_TRAINS;

  return CORRIDOR_TRAINS.filter(
    (t) =>
      t.no.includes(clean) ||
      t.name.toLowerCase().includes(clean) ||
      t.trainClass.toLowerCase().includes(clean)
  );
}

// Find all corridor trains running between fromStation and toStation
export function findTrainsBetweenStations(
  fromCode: string,
  toCode: string
): { success: boolean; error?: string; results: RouteSearchResult[] } {
  if (!fromCode || !toCode) {
    return {
      success: true,
      results: [],
    };
  }

  if (fromCode === toCode) {
    return {
      success: false,
      error: 'Departure and destination stations cannot be the same. Please choose different stations.',
      results: [],
    };
  }

  const results: RouteSearchResult[] = [];

  for (const train of CORRIDOR_TRAINS) {
    const fromIdx = train.halts.findIndex((h) => h.stationCode === fromCode);
    const toIdx = train.halts.findIndex((h) => h.stationCode === toCode);

    // Train must stop at both stations and travel from -> to in sequence
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
      const fromHalt = train.halts[fromIdx];
      const toHalt = train.halts[toIdx];

      const depMin = parseTimeToMinutes(fromHalt.depTime);
      const arrMin = parseTimeToMinutes(toHalt.arrTime);
      let durationMins = arrMin - depMin;
      if (durationMins < 0) durationMins += 24 * 60; // Next-day wrap

      const hrs = Math.floor(durationMins / 60);
      const mins = durationMins % 60;
      const durationFormatted = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

      results.push({
        train,
        fromHalt,
        toHalt,
        departureTime: fromHalt.depTime,
        arrivalTime: toHalt.arrTime,
        durationFormatted,
        intermediateHaltsCount: Math.max(0, toIdx - fromIdx - 1),
      });
    }
  }

  return {
    success: true,
    results,
  };
}

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
export const ECOR_STATION_WAYPOINTS: [number, number][] = [
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

// Jakhapura (JKPR) to Nergundi (NRG) Phantom Freight bottleneck section
export const FREIGHT_HAZARD_WAYPOINTS: [number, number][] = [
  [86.0600, 20.9400], // JKPR - Jakhapura Junction
  [86.0100, 20.8500], // Haridaspur
  [85.9800, 20.7600], // Dhanmandal
  [85.9600, 20.6700], // Barchana
  [85.9350, 20.5900], // Kapilas Road
  [85.9200, 20.5500], // NRG - Nergundi Junction
];

// NH-16 Highway expressway bailout alignment (Cuttack to Bhubaneswar)
export const NH16_HIGHWAY_WAYPOINTS: [number, number][] = [
  [85.8829, 20.4625], // Cuttack Station
  [85.8920, 20.4430], // OMP Square
  [85.8850, 20.4100], // Telengapentha
  [85.8750, 20.3700], // Phulnakhara
  [85.8650, 20.3350], // Hanspal
  [85.8580, 20.3010], // Rasulgarh Square
  [85.8450, 20.2850], // Vani Vihar Square
  [85.8333, 20.2667], // Master Canteen / Bhubaneswar Station
];

// High-resolution smooth Catmull-Rom geometries
export const SMOOTH_TRACK_COORDS = catmullRomSpline(ECOR_STATION_WAYPOINTS, 8);
export const SMOOTH_FREIGHT_COORDS = catmullRomSpline(FREIGHT_HAZARD_WAYPOINTS, 8);
export const SMOOTH_NH16_COORDS = catmullRomSpline(NH16_HIGHWAY_WAYPOINTS, 8);

// Active Delay Ahead: Cuttack (CTC) down to Barang (BRAG) & Mancheswar
// Physically ahead of southbound train 12821 towards Bhubaneswar
export const CONGESTION_AHEAD_WAYPOINTS: [number, number][] = [
  [85.8829, 20.4625], // CTC - Cuttack Junction
  [85.8500, 20.4250], // Gopalpur Balikuda
  [85.8300, 20.4000], // BRAG - Barang Junction
  [85.8320, 20.3300], // Mancheswar
];
export const SMOOTH_CONGESTION_AHEAD_COORDS = catmullRomSpline(CONGESTION_AHEAD_WAYPOINTS, 8);

/**
 * Snaps any coordinate [lon, lat] onto the nearest point along SMOOTH_TRACK_COORDS.
 * Prevents trains from visually drifting or rendering off the physical railway line.
 */
export function snapPointToTrack(lon: number, lat: number): [number, number] {
  if (!SMOOTH_TRACK_COORDS || SMOOTH_TRACK_COORDS.length < 2) {
    return [lon, lat];
  }

  let minDistanceSq = Infinity;
  let bestPoint: [number, number] = [lon, lat];

  for (let i = 0; i < SMOOTH_TRACK_COORDS.length - 1; i++) {
    const a = SMOOTH_TRACK_COORDS[i];
    const b = SMOOTH_TRACK_COORDS[i + 1];

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
      bestPoint = [Number(projX.toFixed(5)), Number(projY.toFixed(5))];
    }
  }

  return bestPoint;
}


