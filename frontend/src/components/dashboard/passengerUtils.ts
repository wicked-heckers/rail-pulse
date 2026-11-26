import type {
  CorridorSnapshot,
  ForecastResponse,
  RescueEvaluationResponse,
} from '../../types/corridor';
import type { StationData } from '../timeline/StationRow';

export interface TrainIdentity {
  trainNo: string;
  trainName: string;
  locationText: string;
  statusText: string;
  statusTone: 'emerald' | 'amber' | 'rose' | 'slate';
}

export interface ArrivalPrediction {
  destinationCode: string;
  destinationName: string;
  expectedTime: string;
  likelyWindow: string;
  earliestTime: string;
  worstCaseTime: string;
  slackMins: number;
  p10Time: string;
  p50Time: string;
  p90Time: string;
  p10DelayMins: number;
  p50DelayMins: number;
  p90DelayMins: number;
}

export interface ConnectionEvaluation {
  status: 'safe' | 'at_risk' | 'uncertain';
  label: 'Safe' | 'At Risk' | 'Uncertain';
  explanation: string;
  connectingTrainName: string;
  connectionDeadline: string;
  bufferMins: number;
  isLogicalMismatch?: boolean;
}

export interface DelayCause {
  id: string;
  title: string;
  tag: string;
  tagType: 'confirmed' | 'projected' | 'clear';
  explanation: string;
  locationName?: string;
  coordinates?: [number, number]; // [lon, lat]
  popupTitle?: string;
  popupMessage?: string;
  highlightType?: 'freight_zone' | 'cuttack_loop' | 'station' | null;
}


/**
 * Formats 24-hour "HH:MM" or existing 12-hour strings to clean standard "hh:mm AM/PM".
 */
export function formatTime12Hour(timeStr?: string): string {
  if (!timeStr) return '12:15 PM';
  const trimmed = timeStr.trim();
  if (trimmed.toUpperCase().includes('AM') || trimmed.toUpperCase().includes('PM')) {
    return trimmed;
  }
  const [hStr, mStr] = trimmed.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h)) return trimmed;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mPad = m.toString().padStart(2, '0');
  const hPad = h12.toString().padStart(2, '0');
  return `${hPad}:${mPad} ${period}`;
}

/**
 * Converts a simulation UTC epoch to 12-hour IST (UTC+05:30) string.
 */
export function formatEpochTo12Hour(epoch: number): string {
  if (!epoch || isNaN(epoch)) return '12:09 PM';
  // IST offset is +19800 seconds
  const istSeconds = (Math.floor(epoch) + 19800) % 86400;
  const positiveSecs = istSeconds < 0 ? istSeconds + 86400 : istSeconds;
  const hours24 = Math.floor(positiveSecs / 3600);
  const minutes = Math.floor((positiveSecs % 3600) / 60);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const mPad = minutes.toString().padStart(2, '0');
  const hPad = hours12.toString().padStart(2, '0');
  return `${hPad}:${mPad} ${period}`;
}

/**
 * Parses time strings like "12:09 PM", "12:15", "09:30 AM" into minutes from midnight.
 */
export function timeStringToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridian = match[3];

  if (meridian === 'PM' && hours < 12) hours += 12;
  if (meridian === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * 1. Derives clean, unambiguous Train Identity with a single running status badge.
 */
export function getTrainIdentity(
  trainNo: string,
  snapshot: CorridorSnapshot
): TrainIdentity {
  const train = snapshot.trains.find((t) => t.train_no === trainNo);

  const fallbackNames: Record<string, string> = {
    '12821': 'Dhauli Express',
    '22895': 'Howrah-Puri Vande Bharat Express',
    '18410': 'Sri Jagannath Express',
  };

  const trainName = train?.train_name || fallbackNames[trainNo] || `Express ${trainNo}`;

  if (!train) {
    return {
      trainNo,
      trainName,
      locationText: 'Location currently updating',
      statusText: 'Status unavailable',
      statusTone: 'slate',
    };
  }

  // Location display
  let locationText = 'En route';
  if (train.current_station) {
    locationText = `Stopped at ${train.current_station} station`;
    if (train.current_station === 'CTC') locationText = 'Waiting at Cuttack (CTC)';
  } else if (train.next_station) {
    locationText = `Approaching ${train.next_station}`;
    if (train.chainage_km) {
      locationText = `Near km ${train.chainage_km.toFixed(0)} • Approaching ${train.next_station}`;
    }
  }

  // Single running status pill (strictly avoid multiple badges)
  const delay = Math.round(train.current_delay_mins ?? 0);
  const spd = Math.round(train.speed_kmph ?? 0);
  let statusText = `Running • ${spd} km/h`;
  let statusTone: TrainIdentity['statusTone'] = 'emerald';

  if (train.status === 'OHE_BRAKE_HOLD') {
    statusText = `Stopped: OHE/Brake (${spd} km/h)`;
    statusTone = 'amber';
  } else if (train.status === 'PLATFORM_HOLD') {
    statusText = `Held at Signal/Throat (${spd} km/h)`;
    statusTone = 'amber';
  } else if (train.status === 'TSR_CAUTION') {
    statusText = `TSR Caution • ${spd} km/h (+${delay}m)`;
    statusTone = 'amber';
  } else if (train.status === 'SIGNAL_CONGESTION') {
    statusText = `Signal Crawl • ${spd} km/h (+${delay}m)`;
    statusTone = 'amber';
  } else if (train.status === 'WEATHER_CAUTION') {
    statusText = `Monsoon Slow • ${spd} km/h (+${delay}m)`;
    statusTone = 'amber';
  } else if (train.status === 'CRAWLING_FREIGHT_DRAG') {
    statusText = `Goods Ahead • ${spd} km/h`;
    statusTone = 'amber';
  } else if (train.status === 'AT_STATION_HALT' && delay > 10) {
    statusText = `Delayed (+${delay}m) • At station`;
    statusTone = 'amber';
  } else if (train.status === 'AT_STATION_HALT') {
    statusText = 'At station • 0 km/h';
    statusTone = 'slate';
  } else if (delay > 5) {
    statusText = `Delayed (+${delay}m) • ${spd} km/h`;
    statusTone = 'amber';
  } else if (delay <= 5 && spd > 0) {
    statusText = `On time • ${spd} km/h`;
    statusTone = 'emerald';
  }

  return {
    trainNo,
    trainName,
    locationText,
    statusText,
    statusTone,
  };
}

/**
 * 2. Derives expected arrival time, likely arrival window, and ML quantiles.
 */
export function getArrivalPrediction(
  trainNo: string,
  forecast: ForecastResponse | null,
  rescue?: RescueEvaluationResponse | null,
  destinationCode: string = 'BBS'
): ArrivalPrediction {
  const targetStop =
    forecast?.station_timeline?.find((s) => s.station_code === destinationCode) ??
    forecast?.station_timeline?.[forecast.station_timeline.length - 1];

  const p10Epoch = rescue?.train_p10_eta_epoch ?? forecast?.p10_eta_epoch;
  const p50Epoch = rescue?.train_p50_eta_epoch ?? forecast?.p50_eta_epoch;
  const p90Epoch = rescue?.train_p90_eta_epoch ?? forecast?.p90_eta_epoch;

  // If dynamic forecast/rescue with quantiles is available, use station-matched ETAs
  if (p50Epoch && p10Epoch && p90Epoch) {
    const p10 = formatEpochTo12Hour(p10Epoch);
    const p50 = formatEpochTo12Hour(p50Epoch);
    const p90 = formatEpochTo12Hour(p90Epoch);
    return {
      destinationCode: targetStop?.station_code ?? destinationCode,
      destinationName: targetStop?.station_name ?? 'Bhubaneswar',
      expectedTime: p50,
      likelyWindow: `${p10} – ${p90}`,
      earliestTime: p10,
      worstCaseTime: p90,
      slackMins: Math.round(forecast?.usable_slack_mins ?? 14),
      p10Time: p10,
      p50Time: p50,
      p90Time: p90,
      p10DelayMins: Math.round(forecast?.p10_delay_mins ?? 19),
      p50DelayMins: Math.round(forecast?.p50_delay_mins ?? 28),
      p90DelayMins: Math.round(forecast?.p90_delay_mins ?? 37),
    };
  }

  // Train-specific fallback defaults when live forecast is loading
  if (trainNo === '22895') {
    return {
      destinationCode: 'BBS',
      destinationName: 'Bhubaneswar',
      expectedTime: '12:05 PM',
      likelyWindow: '12:04 PM – 12:10 PM',
      earliestTime: '12:04 PM',
      worstCaseTime: '12:10 PM',
      slackMins: 6,
      p10Time: '12:04 PM',
      p50Time: '12:05 PM',
      p90Time: '12:10 PM',
      p10DelayMins: 4,
      p50DelayMins: 5,
      p90DelayMins: 10,
    };
  }

  if (trainNo === '18410') {
    return {
      destinationCode: 'BBS',
      destinationName: 'Bhubaneswar',
      expectedTime: '11:55 AM',
      likelyWindow: '11:53 AM – 12:02 PM',
      earliestTime: '11:53 AM',
      worstCaseTime: '12:02 PM',
      slackMins: 8,
      p10Time: '11:53 AM',
      p50Time: '11:55 AM',
      p90Time: '12:02 PM',
      p10DelayMins: 0,
      p50DelayMins: 2,
      p90DelayMins: 7,
    };
  }

  // Default for 12821 Dhauli Express
  return {
    destinationCode: 'BBS',
    destinationName: 'Bhubaneswar',
    expectedTime: '12:09 PM',
    likelyWindow: '12:05 PM – 12:24 PM',
    earliestTime: '12:05 PM',
    worstCaseTime: '12:24 PM',
    slackMins: forecast?.usable_slack_mins ?? 14,
    p10Time: '12:05 PM',
    p50Time: '12:09 PM',
    p90Time: '12:24 PM',
    p10DelayMins: 19,
    p50DelayMins: 28,
    p90DelayMins: 37,
  };
}

/**
 * 3. Enforces the logical data-consistency gate for connection status.
 *
 * Verifies that expected arrival, likely worst-case window, connection deadline,
 * and required transfer buffer are mathematically consistent before showing Safe.
 */
export function evaluateLogicalConnection(
  expectedTimeStr: string,
  worstCaseTimeStr: string,
  connectionDeadlineStr: string,
  bufferMins: number = 15,
  backendSurvivalPct?: number,
  connectingTrainName: string = '20817 Rajdhani Express'
): ConnectionEvaluation {
  let expectedMin = timeStringToMinutes(expectedTimeStr);
  let worstCaseMin = timeStringToMinutes(worstCaseTimeStr);
  let deadlineMin = timeStringToMinutes(connectionDeadlineStr);

  // If connection information is missing or unparseable
  if (!connectionDeadlineStr || deadlineMin === null) {
    return {
      status: 'uncertain',
      label: 'Uncertain',
      explanation: 'Connection details unavailable. Add connection details to check transfer feasibility.',
      connectingTrainName: connectingTrainName || 'Connecting train',
      connectionDeadline: 'Not set',
      bufferMins,
    };
  }

  if (expectedMin === null || worstCaseMin === null) {
    return {
      status: 'uncertain',
      label: 'Uncertain',
      explanation: 'Arrival prediction updating. Keep an eye on updates.',
      connectingTrainName,
      connectionDeadline: connectionDeadlineStr,
      bufferMins,
    };
  }

  // Handle cross-midnight rollover (e.g. expected 23:50, deadline 00:20)
  if (deadlineMin < expectedMin && expectedMin - deadlineMin > 720) {
    deadlineMin += 1440;
  }
  if (worstCaseMin < expectedMin && expectedMin - worstCaseMin > 720) {
    worstCaseMin += 1440;
  }

  // Required arrival moment at station platform to have enough buffer
  const requiredPlatformArrival = deadlineMin - bufferMins;

  // Case 1: Train arrives AFTER the connection departs OR with less than required buffer
  // E.g. 12821 expected 12:09 PM + 15m buffer = 12:24 PM > 12:15 PM deadline
  if (expectedMin > requiredPlatformArrival || worstCaseMin > deadlineMin) {
    return {
      status: 'at_risk',
      label: 'At Risk',
      explanation: 'Your train may arrive too late for your connection.',
      connectingTrainName,
      connectionDeadline: connectionDeadlineStr,
      bufferMins,
    };
  }

  // Case 2: Expected arrival has buffer, but worst-case arrival is very tight (< buffer)
  if (worstCaseMin > requiredPlatformArrival) {
    return {
      status: 'uncertain',
      label: 'Uncertain',
      explanation: 'Your connection is tight. Keep an eye on updates.',
      connectingTrainName,
      connectionDeadline: connectionDeadlineStr,
      bufferMins,
    };
  }

  // Case 3: If backend survival probability contradicts time logic (e.g. survival < 40%)
  if (typeof backendSurvivalPct === 'number' && backendSurvivalPct < 40) {
    return {
      status: 'uncertain',
      label: 'Uncertain',
      explanation: 'Your connection is tight. Keep an eye on updates.',
      connectingTrainName,
      connectionDeadline: connectionDeadlineStr,
      bufferMins,
      isLogicalMismatch: true,
    };
  }

  // Case 4: Everything fits with comfortable buffer
  return {
    status: 'safe',
    label: 'Safe',
    explanation: "You're likely to reach Bhubaneswar in time for your next train.",
    connectingTrainName,
    connectionDeadline: connectionDeadlineStr,
    bufferMins,
  };
}

/**
 * 4. Generates max 2-3 delay causes in everyday passenger wording.
 * Strictly excludes speed-to-restriction ratios, signal identifiers, priority ranks, and technical codes.
 */
export function getDelayCauses(
  trainNo: string,
  forecast: ForecastResponse | null,
  _currentStation?: string | null
): DelayCause[] {
  const activeCards = (forecast?.causal_cards ?? []).filter((c) => c.added_delay_mins > 0);
  if (activeCards.length > 0) {
    const titleMap: Record<string, string> = {
      FREIGHT_SHADOW_DRAG: 'Goods Train Ahead',
      PRIORITY_OVERTAKE_HOLD: 'Loop-Line Overtake Hold',
      CASCADE_DOUBLE_OVERTAKE: 'Extended Double Overtake Hold',
      MONSOON_WEATHER_DRAG: 'Heavy Monsoon Weather Drag',
      STATIC_TSR_CAUTION: 'Track Maintenance Caution (30 km/h TSR)',
      COACHING_CONGESTION: 'Preceding Train Signal Congestion',
      JUNCTION_THROAT_HOLD: 'Junction Platform / Throat Hold',
      OHE_OR_BRAKE_FAULT: 'OHE Trip / Brake-Binding Clearance',
    };
    return activeCards.map((c, idx) => ({
      id: `live-cause-${idx}-${c.event}`,
      title: titleMap[c.event] || c.event.replace(/_/g, ' '),
      tag: `+${Math.round(c.added_delay_mins)}m delay`,
      tagType: c.event.includes('OVERTAKE') ? 'projected' : 'confirmed',
      explanation: c.human_message,
      locationName: `${c.station_name} (${c.station_code})`,
      coordinates: c.station_code === 'CTC' ? [85.8829, 20.4625] : [85.856, 20.431],
      popupTitle: titleMap[c.event] || c.event,
      popupMessage: c.human_message,
      highlightType: c.event.includes('FREIGHT')
        ? 'freight_zone'
        : c.event.includes('OVERTAKE')
        ? 'cuttack_loop'
        : 'station',
    }));
  }

  if (forecast) {
    return [
      {
        id: `cause-clear-${trainNo}`,
        title: 'Clear route ahead',
        tag: 'Clear route',
        tagType: 'clear',
        explanation: 'No delays reported ahead—track is clear.',
        locationName: forecast.direction === 'UP' ? 'Bhubaneswar – Bhadrak UP Line' : 'Bhadrak – Puri DN Line',
        coordinates: [85.92, 20.55],
        popupTitle: 'Clear Priority Path',
        popupMessage: 'Running on clear signal aspects.',
        highlightType: 'station',
      },
    ];
  }

  if (trainNo === '12821') {
    return [
      {
        id: 'cause-2',
        title: 'Goods Train Ahead',
        tag: '~14 min delay',
        tagType: 'confirmed',
        explanation: 'A slow goods train is ahead of you toward Bhubaneswar, adding about 14 mins to your journey.',
        locationName: 'Between Cuttack & Barang',
        coordinates: [85.856, 20.431],
        popupTitle: 'Goods Train Ahead',
        popupMessage: 'A slow goods train is ahead of you toward Bhubaneswar, adding about 14 mins to your journey.',
        highlightType: 'freight_zone',
      },
      {
        id: 'cause-1',
        title: 'Waiting at Cuttack for Vande Bharat',
        tag: '~12 min wait',
        tagType: 'projected',
        explanation: 'Your train will pause briefly at Cuttack so the faster 22895 Vande Bharat can pass ahead.',
        locationName: 'Cuttack Junction (CTC)',
        coordinates: [85.8829, 20.4625],
        popupTitle: 'Waiting at Cuttack for Vande Bharat',
        popupMessage: 'Your train will pause briefly at Cuttack so the faster 22895 Vande Bharat can pass ahead.',
        highlightType: 'cuttack_loop',
      },
    ];
  }

  if (trainNo === '22895') {
    return [
      {
        id: 'cause-vande-1',
        title: 'Clear route ahead',
        tag: 'Clear route',
        tagType: 'clear',
        explanation: 'No delays reported ahead—track is clear.',
        locationName: 'Nergundi – Barang Sector',
        coordinates: [85.9200, 20.5500],
        popupTitle: 'Clear Priority Path',
        popupMessage: 'Running high-speed with clear automated signal clearance.',
        highlightType: 'station',
      },
    ];
  }

  if (trainNo === '18410') {
    return [
      {
        id: 'cause-jagannath-1',
        title: 'Routine speed regulation',
        tag: 'Minor (+5m)',
        tagType: 'confirmed',
        explanation: 'Slowed slightly near Bhubaneswar; moving at steady speed.',
        locationName: 'Bhubaneswar North Approach',
        coordinates: [85.8333, 20.2667],
        popupTitle: 'Routine speed regulation',
        popupMessage: 'Slowed slightly near Bhubaneswar; moving at steady speed.',
        highlightType: 'station',
      },
    ];
  }

  // Generic fallback before initial forecast loads
  if (trainNo !== '12821' && trainNo !== '22895' && trainNo !== '18410') {
    return [
      {
        id: 'cause-clean',
        title: 'On-time movement',
        tag: 'Clear route',
        tagType: 'clear',
        explanation: 'No major delays reported along your route.',
        locationName: 'Corridor Section',
        coordinates: [85.92, 20.58],
        popupTitle: 'Route Clear',
        popupMessage: 'No significant delay factors reported along your active journey.',
        highlightType: null,
      },
    ];
  }

  return [
    {
      id: 'cause-generic',
      title: 'Track regulation ahead',
      tag: 'Expected delay',
      tagType: 'projected',
      explanation: 'Traffic regulation along the corridor. Updates reflect in expected arrival.',
      locationName: 'Approaching Station',
      coordinates: [85.8829, 20.4625],
      popupTitle: 'Corridor Regulation',
      popupMessage: 'Traffic regulation ahead along the trunk corridor.',
      highlightType: null,
    },
  ];
}

/**
 * Categorizes a station marker's passenger relevance.
 */
export function getStationRelevance(
  stationCode: string,
  selectedTrain: string,
  isRescueActive: boolean,
  isPassed: boolean,
  isCurrent: boolean
): {
  roleBadge: string;
  roleTone: 'emerald' | 'amber' | 'blue' | 'slate' | 'rose';
  relevanceExplanation: string;
} {
  if (stationCode === 'BBS') {
    return {
      roleBadge: 'Destination & Connection Hub',
      roleTone: 'rose',
      relevanceExplanation: 'Your target station where transfer connection 20817 Rajdhani departs.',
    };
  }

  if (stationCode === 'CTC' && isRescueActive) {
    return {
      roleBadge: 'NH-16 Road Rescue Transfer Point',
      roleTone: 'amber',
      relevanceExplanation: 'Recommended early-deboard station: take NH-16 highway cab here to save ~21 mins to Bhubaneswar.',
    };
  }

  if (isCurrent) {
    return {
      roleBadge: 'Current Train Location',
      roleTone: 'amber',
      relevanceExplanation: `Train ${selectedTrain} is currently stopped or holding at this platform.`,
    };
  }

  if (isPassed) {
    return {
      roleBadge: 'Station Passed',
      roleTone: 'slate',
      relevanceExplanation: 'Your train has completed this section of the corridor.',
    };
  }

  return {
    roleBadge: 'Upcoming Station',
    roleTone: 'blue',
    relevanceExplanation: 'Upcoming intermediate stop along the railway trunk corridor.',
  };
}


/**
 * 6. Returns complete 9-station timetable for Section 4 (Journey details).
 */
export const FULL_CORRIDOR_STATIONS: StationData[] = [
  {
    station_code: 'BHC',
    station_name: 'Bhadrak',
    chainage_km: 0.0,
    scheduled_arr: '09:25 AM',
    scheduled_dep: '09:30 AM',
    projected_arr: '09:25 AM',
    projected_dep: '09:30 AM',
    delay_mins: 0,
    platform: 'PF 1 (Origin)',
    is_junction: true,
    status: 'passed',
  },
  {
    station_code: 'JJKR',
    station_name: 'Jajpur Keonjhar Road',
    chainage_km: 44.0,
    scheduled_arr: '10:15 AM',
    scheduled_dep: '10:18 AM',
    projected_arr: '10:15 AM',
    projected_dep: '10:18 AM',
    delay_mins: 0,
    platform: 'PF 2 (Main)',
    is_junction: false,
    status: 'passed',
  },
  {
    station_code: 'JKPR',
    station_name: 'Jakhapura Junction',
    chainage_km: 51.0,
    scheduled_arr: '10:28 AM',
    scheduled_dep: '10:30 AM',
    projected_arr: '10:34 AM',
    projected_dep: '10:36 AM',
    delay_mins: 6,
    platform: 'PF 1 (Loop)',
    is_junction: true,
    status: 'passed',
  },
  {
    station_code: 'NRG',
    station_name: 'Nergundi Junction',
    chainage_km: 106.0,
    scheduled_arr: '11:10 AM',
    scheduled_dep: '11:12 AM',
    projected_arr: '11:32 AM',
    projected_dep: '11:34 AM',
    delay_mins: 22,
    platform: 'PF 2 (Main)',
    is_junction: false,
    status: 'passed',
  },
  {
    station_code: 'CTC',
    station_name: 'Cuttack Junction',
    chainage_km: 115.0,
    scheduled_arr: '11:22 AM',
    scheduled_dep: '11:25 AM',
    projected_arr: '11:50 AM',
    projected_dep: '11:53 AM',
    delay_mins: 28,
    platform: 'PF 1 (Loop Hold)',
    is_junction: true,
    status: 'current',
  },
  {
    station_code: 'BRAG',
    station_name: 'Barang Junction',
    chainage_km: 128.0,
    scheduled_arr: '11:42 AM',
    scheduled_dep: '11:44 AM',
    projected_arr: '12:10 PM',
    projected_dep: '12:12 PM',
    delay_mins: 28,
    platform: 'PF 2 (Main)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'BBS',
    station_name: 'Bhubaneswar',
    chainage_km: 143.0,
    scheduled_arr: '12:05 PM',
    scheduled_dep: '12:10 PM',
    projected_arr: '12:09 PM',
    projected_dep: '12:14 PM',
    delay_mins: 4,
    platform: 'PF 3 (Transfer)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'KUR',
    station_name: 'Khurda Road Junction',
    chainage_km: 162.0,
    scheduled_arr: '12:40 PM',
    scheduled_dep: '12:45 PM',
    projected_arr: '12:48 PM',
    projected_dep: '12:53 PM',
    delay_mins: 8,
    platform: 'PF 2 (Main)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'PURI',
    station_name: 'Puri Terminal',
    chainage_km: 206.0,
    scheduled_arr: '02:00 PM',
    scheduled_dep: '—',
    projected_arr: '02:10 PM',
    projected_dep: '—',
    delay_mins: 10,
    platform: 'PF 4 (Terminus)',
    is_junction: true,
    status: 'upcoming',
  },
];

export const FULL_CORRIDOR_STATIONS_UP: StationData[] = [
  {
    station_code: 'PURI',
    station_name: 'Puri Terminal',
    chainage_km: 206.0,
    scheduled_arr: '09:30 AM',
    scheduled_dep: '09:30 AM',
    projected_arr: '09:30 AM',
    projected_dep: '09:30 AM',
    delay_mins: 0,
    platform: 'PF 3 (Origin)',
    is_junction: true,
    status: 'passed',
  },
  {
    station_code: 'KUR',
    station_name: 'Khurda Road Junction',
    chainage_km: 162.0,
    scheduled_arr: '10:20 AM',
    scheduled_dep: '10:25 AM',
    projected_arr: '10:25 AM',
    projected_dep: '10:30 AM',
    delay_mins: 5,
    platform: 'PF 1 (Main)',
    is_junction: true,
    status: 'passed',
  },
  {
    station_code: 'BBS',
    station_name: 'Bhubaneswar',
    chainage_km: 143.0,
    scheduled_arr: '10:50 AM',
    scheduled_dep: '10:55 AM',
    projected_arr: '10:55 AM',
    projected_dep: '11:00 AM',
    delay_mins: 5,
    platform: 'PF 2 (Main)',
    is_junction: true,
    status: 'current',
  },
  {
    station_code: 'BRAG',
    station_name: 'Barang Junction',
    chainage_km: 128.0,
    scheduled_arr: '11:12 AM',
    scheduled_dep: '11:14 AM',
    projected_arr: '11:17 AM',
    projected_dep: '11:19 AM',
    delay_mins: 5,
    platform: 'PF 1 (Pass)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'CTC',
    station_name: 'Cuttack Junction',
    chainage_km: 115.0,
    scheduled_arr: '11:35 AM',
    scheduled_dep: '11:40 AM',
    projected_arr: '11:40 AM',
    projected_dep: '11:45 AM',
    delay_mins: 5,
    platform: 'PF 2 (Main)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'NRG',
    station_name: 'Nergundi Junction',
    chainage_km: 106.0,
    scheduled_arr: '11:52 AM',
    scheduled_dep: '11:54 AM',
    projected_arr: '11:57 AM',
    projected_dep: '11:59 AM',
    delay_mins: 5,
    platform: 'PF 1 (Main)',
    is_junction: false,
    status: 'upcoming',
  },
  {
    station_code: 'JKPR',
    station_name: 'Jakhapura Junction',
    chainage_km: 51.0,
    scheduled_arr: '12:20 PM',
    scheduled_dep: '12:22 PM',
    projected_arr: '12:25 PM',
    projected_dep: '12:27 PM',
    delay_mins: 5,
    platform: 'PF 2 (Main)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'JJKR',
    station_name: 'Jajpur Keonjhar Road',
    chainage_km: 44.0,
    scheduled_arr: '12:30 PM',
    scheduled_dep: '12:32 PM',
    projected_arr: '12:35 PM',
    projected_dep: '12:37 PM',
    delay_mins: 5,
    platform: 'PF 1 (Main)',
    is_junction: false,
    status: 'upcoming',
  },
  {
    station_code: 'BHC',
    station_name: 'Bhadrak',
    chainage_km: 0.0,
    scheduled_arr: '01:20 PM',
    scheduled_dep: '—',
    projected_arr: '01:25 PM',
    projected_dep: '—',
    delay_mins: 5,
    platform: 'PF 3 (Terminus)',
    is_junction: true,
    status: 'upcoming',
  },
];

export function getStationTimeline(
  trainNo: string,
  forecast: ForecastResponse | null,
  activeSnapshot: CorridorSnapshot
): StationData[] {
  const train = activeSnapshot.trains.find((t) => t.train_no === trainNo);
  const trainKm = train?.chainage_km ?? 115.0;
  const isUp = train?.direction === 'UP' || trainNo === '18410';

  const baseStations = isUp ? FULL_CORRIDOR_STATIONS_UP : FULL_CORRIDOR_STATIONS;
  const forecastMap = new Map(
    (forecast?.train_no === trainNo ? forecast.station_timeline : []).map((s) => [
      s.station_code,
      s,
    ])
  );
  const lastIdx = baseStations.length - 1;

  // Merge live forecast arrival/departure epochs so Journey Details matches the digital clock & Expected Arrival
  let currentAssigned = false;
  return baseStations.map((stn, idx) => {
    const fcStop = forecastMap.get(stn.station_code);
    const isPassed = isUp ? stn.chainage_km > trainKm + 0.8 : stn.chainage_km < trainKm - 0.8;

    let status: 'passed' | 'current' | 'upcoming' = 'upcoming';
    if (train?.current_station === stn.station_code) {
      status = 'current';
      currentAssigned = true;
    } else if (isPassed) {
      status = 'passed';
    } else if (!currentAssigned && (train?.next_station === stn.station_code || idx === lastIdx)) {
      status = 'current';
      currentAssigned = true;
    }

    if (!fcStop) {
      return {
        ...stn,
        status,
      };
    }

    const schedArr = formatEpochTo12Hour(fcStop.sched_arr_epoch);
    const schedDep = idx === lastIdx ? '—' : formatEpochTo12Hour(fcStop.sched_dep_epoch);
    const projArr = formatEpochTo12Hour(fcStop.projected_arr_epoch);
    const projDep = idx === lastIdx ? '—' : formatEpochTo12Hour(fcStop.projected_dep_epoch);

    return {
      ...stn,
      scheduled_arr: schedArr,
      scheduled_dep: schedDep,
      projected_arr: projArr,
      projected_dep: projDep,
      delay_mins: Math.max(0, Math.round(fcStop.net_delay_mins)),
      status,
    };
  });
}
