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
      { stationCode: 'PURI', stationName: 'Puri Terminal', arrTime: '14:00 PM', depTime: '14:00 PM', km: 206.0 },
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
      { stationCode: 'PURI', stationName: 'Puri Terminal', arrTime: '13:35 PM', depTime: '13:35 PM', km: 206.0 },
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
      { stationCode: 'BHC', stationName: 'Bhadrak', arrTime: '13:20 PM', depTime: '13:25 PM', km: 0.0 },
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
