import type {
  CorridorSnapshot,
  ForecastResponse,
  RescueEvaluationResponse,
} from '../../types/corridor';
import { getTrackSliceForBlock } from '../../services/corridorData';
import type { StationData } from '../timeline/StationRow';
import {
  FULL_CORRIDOR_STATIONS,
  FULL_CORRIDOR_STATIONS_UP,
  FULL_SER_STATIONS,
  FULL_SER_STATIONS_UP,
} from '../../services/corridorTimetable';

interface TrainIdentity {
  trainNo: string;
  trainName: string;
  locationText: string;
}

export interface ArrivalPrediction {
  destinationCode: string;
  destinationName: string;
  expectedTime: string;
  likelyWindow: string;
  worstCaseTime: string;
  p10Time: string;
  p50Time: string;
  p90Time: string;
  p10DelayMins: number;
  p50DelayMins: number;
  p90DelayMins: number;
}

interface ConnectionEvaluation {
  status: 'safe' | 'at_risk' | 'uncertain';
}

interface DelayCause {
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
export function formatEpochTo12Hour(epoch?: number | null): string {
  if (!epoch || isNaN(epoch) || epoch <= 0) return '—';
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
    '12822': 'Dhauli Express (UP)',
  };

  const trainName = train?.train_name || fallbackNames[trainNo] || `Express ${trainNo}`;

  if (!train) {
    return {
      trainNo,
      trainName,
      locationText: 'Location currently updating',
    };
  }

  // Location display
  let locationText = 'En route';
  if (train.status === 'AT_TERMINUS') {
    const termName =
      train.current_station === 'PURI'
        ? 'Puri Terminal'
        : train.current_station === 'BHC'
          ? 'Bhadrak'
          : train.current_station ?? 'Terminus';
    locationText = `Arrived at ${termName} (Terminus)`;
  } else if (train.current_station) {
    locationText = `Stopped at ${train.current_station} station`;
    if (train.current_station === 'CTC') locationText = 'Waiting at Cuttack (CTC)';
    if (train.current_station === 'MCA') locationText = 'Waiting at Mecheda (MCA)';
    if (train.current_station === 'SRC') locationText = 'Waiting at Santragachi (SRC)';
  } else if (train.next_station) {
    locationText = `Approaching ${train.next_station}`;
    if (train.chainage_km) {
      locationText = `Near km ${train.chainage_km.toFixed(0)} • Approaching ${train.next_station}`;
    }
  }

  return {
    trainNo,
    trainName,
    locationText,
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
      worstCaseTime: p90,
      p10Time: p10,
      p50Time: p50,
      p90Time: p90,
      p10DelayMins: Math.round(forecast?.p10_delay_mins ?? 19),
      p50DelayMins: Math.round(forecast?.p50_delay_mins ?? 28),
      p90DelayMins: Math.round(forecast?.p90_delay_mins ?? 37),
    };
  }

  // Train-specific fallback defaults when live forecast is loading
  if (trainNo === '12822') {
    return {
      destinationCode: 'HWH',
      destinationName: 'Howrah Junction',
      expectedTime: '04:15 PM',
      likelyWindow: '04:15 PM – 04:25 PM',
      worstCaseTime: '04:25 PM',
      p10Time: '04:15 PM',
      p50Time: '04:18 PM',
      p90Time: '04:25 PM',
      p10DelayMins: 0,
      p50DelayMins: 3,
      p90DelayMins: 10,
    };
  }

  if (trainNo === '22895') {
    return {
      destinationCode: 'BBS',
      destinationName: 'Bhubaneswar',
      expectedTime: '12:05 PM',
      likelyWindow: '12:04 PM – 12:10 PM',
      worstCaseTime: '12:10 PM',
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
      worstCaseTime: '12:02 PM',
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
    worstCaseTime: '12:24 PM',
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
 */
export function evaluateLogicalConnection(
  expectedTimeStr: string,
  worstCaseTimeStr: string,
  connectionDeadlineStr: string,
  bufferMins: number = 15
): ConnectionEvaluation {
  let expectedMin = timeStringToMinutes(expectedTimeStr);
  let worstCaseMin = timeStringToMinutes(worstCaseTimeStr);
  let deadlineMin = timeStringToMinutes(connectionDeadlineStr);

  if (!connectionDeadlineStr || deadlineMin === null || expectedMin === null || worstCaseMin === null) {
    return { status: 'uncertain' };
  }

  // Handle cross-midnight rollover
  if (deadlineMin < expectedMin && expectedMin - deadlineMin > 720) {
    deadlineMin += 1440;
  } else if (expectedMin < deadlineMin && deadlineMin - expectedMin > 720) {
    expectedMin += 1440;
    worstCaseMin += 1440;
  }
  if (worstCaseMin < expectedMin && expectedMin - worstCaseMin > 720) {
    worstCaseMin += 1440;
  }

  const requiredPlatformArrival = deadlineMin - bufferMins;

  if (expectedMin > requiredPlatformArrival || worstCaseMin > deadlineMin) {
    return { status: 'at_risk' };
  }

  if (worstCaseMin > requiredPlatformArrival) {
    return { status: 'uncertain' };
  }

  return { status: 'safe' };
}

const STATION_COORDINATES_MAP: Record<string, [number, number]> = {
  BHC: [86.4950, 21.0583],
  JJKR: [86.1333, 20.9500],
  JKPR: [86.0600, 20.9400],
  NRG: [85.9200, 20.5500],
  CTC: [85.8829, 20.4625],
  BRAG: [85.8300, 20.4000],
  BBS: [85.8333, 20.2667],
  KUR: [85.7333, 20.1833],
  PURI: [85.8314, 19.8133],
  // South Eastern Railway Kolkata Trunk Line
  HWH: [88.3426, 22.5830],
  SRC: [88.2830, 22.5800],
  ULB: [88.1100, 22.4700],
  BZN: [87.9700, 22.4600],
  MCA: [87.8600, 22.4200],
  PKU: [87.7200, 22.4100],
  BCK: [87.5500, 22.3700],
  KGP: [87.3200, 22.3300],
};

/**
 * 4. Generates max 2-3 delay causes in everyday passenger wording.
 * Strictly excludes speed-to-restriction ratios, signal identifiers, priority ranks, and technical codes.
 */
export function getDelayCauses(
  trainNo: string,
  forecast: ForecastResponse | null,
  currentStation?: string | null,
  currentTrainDelayMins?: number,
  snapshot?: CorridorSnapshot | null
): DelayCause[] {
  const trainObj = snapshot?.trains?.find((t) => t.train_no === trainNo);
  const matchingShadow = snapshot?.phantom_freights?.find(
    (f) => f.direction === (forecast?.direction ?? trainObj?.direction)
  );
  const activeCards = (forecast?.causal_cards ?? []).filter((c) => c.added_delay_mins > 0);
  if (activeCards.length > 0) {
    const titleMap: Record<string, string> = {
      FREIGHT_SHADOW_DRAG: 'Goods Train Detected Ahead',
      PRIORITY_OVERTAKE_HOLD: 'Loop-Line Overtake Hold',
      CASCADE_DOUBLE_OVERTAKE: 'Extended Double Overtake Hold',
      MONSOON_WEATHER_DRAG: 'Heavy Monsoon Weather Drag',
      STATIC_TSR_CAUTION: 'Track Maintenance Caution (30 km/h TSR)',
      COACHING_CONGESTION: 'Preceding Train Signal Congestion',
      JUNCTION_THROAT_HOLD: 'Junction Platform / Throat Hold',
      OHE_OR_BRAKE_FAULT: 'OHE Trip / Brake-Binding Clearance',
    };
    return activeCards.map((c, idx) => {
      const isFreight = c.event.includes('FREIGHT');
      const accPct = isFreight && matchingShadow
        ? Math.round((matchingShadow.freight_probability ?? 0) * 100)
        : null;
      const blockGeom = isFreight && matchingShadow
        ? getTrackSliceForBlock(matchingShadow.block_id)
        : null;
      return {
        id: `live-cause-${idx}-${c.event}`,
        title: titleMap[c.event] || c.event.replace(/_/g, ' '),
        tag: `+${Math.round(c.added_delay_mins)}m delay${accPct ? ` • ${accPct}% AI Acc` : ''}`,
        tagType: c.event.includes('OVERTAKE') ? 'projected' : 'confirmed',
        explanation: c.human_message,
        locationName: blockGeom
          ? `${blockGeom.fromName} – ${blockGeom.toName}`
          : `${c.station_name} (${c.station_code})`,
        coordinates: blockGeom?.midpoint || STATION_COORDINATES_MAP[c.station_code] || [85.856, 20.431],
        popupTitle: titleMap[c.event] || c.event,
        popupMessage: c.human_message,
        highlightType: isFreight
          ? 'freight_zone'
          : c.event.includes('OVERTAKE')
            ? 'cuttack_loop'
            : 'station',
      };
    });
  }

  if (trainObj?.status === 'UNSCHEDULED_SLOWDOWN') {
    return [
      {
        id: `cause-analyzing-${trainNo}`,
        title: 'Unscheduled Slowdown Detected',
        tag: 'AI Analyzing...',
        tagType: 'projected',
        explanation:
          'Train slowed down behind an unseen obstruction ahead. Running STR + Bayesian freight accuracy model before updating delay.',
        locationName: `Near km ${(trainObj.chainage_km ?? 115).toFixed(1)}`,
        coordinates: [trainObj.lon ?? 85.856, trainObj.lat ?? 20.431],
        popupTitle: 'Analyzing Slowdown',
        popupMessage: 'AI model evaluating Section Traversal Ratio (STR) to verify goods train ahead.',
        highlightType: 'station',
      },
    ];
  }

  const forecastDelayMins = Math.round(
    Math.max(
      forecast?.p50_delay_mins ?? 0,
      forecast?.p90_delay_mins ?? 0,
      currentTrainDelayMins ?? 0
    )
  );

  if (forecast && forecastDelayMins > 0) {
    const isUp = forecast.direction === 'UP' || trainNo === '18410' || trainNo === '12822';
    const isKolkata =
      trainNo === '12822' ||
      Boolean(
        forecast.station_timeline?.some(
          (s) => s.station_code === 'HWH' || s.station_code === 'KGP'
        )
      );
    const routeText = isKolkata
      ? isUp
        ? 'Kharagpur – Howrah UP Line'
        : 'Howrah – Kharagpur DN Line'
      : isUp
        ? 'Puri – Bhadrak UP Line'
        : 'Bhadrak – Puri DN Line';
    const stationCode = currentStation || (isKolkata ? (isUp ? 'SRC' : 'MCA') : isUp ? 'BBS' : 'CTC');
    return [
      {
        id: `cause-traffic-${trainNo}`,
        title: 'Corridor Signal & Traffic Drag',
        tag: `+${forecastDelayMins}m delay`,
        tagType: 'projected',
        explanation: `Projected traffic drag and minor signal spacing ahead may add up to ${forecastDelayMins} mins by destination.`,
        locationName: currentStation ? `Near ${currentStation} • ${routeText}` : routeText,
        coordinates:
          STATION_COORDINATES_MAP[stationCode] ||
          (isKolkata ? [87.97, 22.46] : [85.856, 20.431]),
        popupTitle: 'Corridor Signal & Traffic Drag',
        popupMessage: `Projected traffic drag and minor signal spacing ahead may add up to ${forecastDelayMins} mins by destination.`,
        highlightType: 'station',
      },
    ];
  }

  if (forecast) {
    const isSER =
      forecast.station_timeline?.some((s) =>
        ['HWH', 'SRC', 'ULB', 'BZN', 'MCA', 'PKU', 'BCK', 'KGP'].includes(s.station_code)
      ) ||
      (trainObj?.lon != null && trainObj.lon > 87.0);

    return [
      {
        id: `cause-clear-${trainNo}`,
        title: 'Clear route ahead',
        tag: 'Clear route',
        tagType: 'clear',
        explanation: 'No delays reported ahead—track is clear.',
        locationName: isSER
          ? forecast.direction === 'UP'
            ? 'Kharagpur – Howrah UP Line'
            : 'Howrah – Kharagpur DN Line'
          : forecast.direction === 'UP'
            ? 'Bhubaneswar – Bhadrak UP Line'
            : 'Bhadrak – Puri DN Line',
        coordinates: isSER ? [88.196, 22.525] : [85.92, 20.55],
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
  relevanceExplanation: string;
} {
  if (stationCode === 'BBS' || stationCode === 'PURI' || stationCode === 'KGP' || stationCode === 'HWH') {
    return {
      roleBadge: 'Destination & Connection Hub',
      relevanceExplanation: `Your target destination where journey concludes and onward transfers depart.`,
    };
  }

  if (stationCode === 'SRC' && isRescueActive) {
    return {
      roleBadge: 'Kona Expressway Road Rescue Transfer Point',
      relevanceExplanation: 'Recommended early-deboard station: take Kona Expressway cab here to save ~25 mins to Howrah/Kolkata.',
    };
  }

  if (stationCode === 'MCA' && isRescueActive) {
    return {
      roleBadge: 'NH-16 Road Rescue Transfer Point',
      relevanceExplanation: 'Recommended early-deboard station: take NH-16 highway cab here to save ~32 mins to Howrah.',
    };
  }

  if (stationCode === 'CTC' && isRescueActive) {
    return {
      roleBadge: 'NH-16 Road Rescue Transfer Point',
      relevanceExplanation: 'Recommended early-deboard station: take NH-16 highway cab here to save ~21 mins to Bhubaneswar.',
    };
  }

  if (stationCode === 'KUR' && isRescueActive) {
    return {
      roleBadge: 'NH-16 Road Rescue Transfer Point',
      relevanceExplanation: 'Recommended early-deboard station: take NH-16 highway cab here to save ~22 mins to Bhubaneswar/Airport.',
    };
  }

  if (isCurrent) {
    return {
      roleBadge: 'Current Train Location',
      relevanceExplanation: `Train ${selectedTrain} is currently stopped or holding at this platform.`,
    };
  }

  if (isPassed) {
    return {
      roleBadge: 'Station Passed',
      relevanceExplanation: 'Your train has completed this section of the corridor.',
    };
  }

  return {
    roleBadge: 'Upcoming Station',
    relevanceExplanation: 'Upcoming intermediate stop along the railway trunk corridor.',
  };
}

/**
 * 6. Returns complete 9-station timetable for Section 4 (Journey details).
 */
export function getStationTimeline(
  trainNo: string,
  forecast: ForecastResponse | null,
  activeSnapshot: CorridorSnapshot
): StationData[] {
  const train = activeSnapshot.trains.find((t) => t.train_no === trainNo);
  const hasLiveTrain = Boolean(train);
  const isUp = train?.direction === 'UP' || trainNo === '18410' || trainNo === '12822';
  const isKolkata = activeSnapshot.corridor_id === 'SER_HWH_KGP' || trainNo === '12822';
  const trainKm = train?.chainage_km ?? (isUp ? (isKolkata ? 115.0 : 206.0) : 0.0);

  // If live forecast provides a validated timeline for this train, map directly from it
  if (
    forecast?.train_no === trainNo &&
    forecast.station_timeline &&
    forecast.station_timeline.length > 0
  ) {
    const lastIdx = forecast.station_timeline.length - 1;
    let currentAssigned = false;
    const junctionCodes = [
      'HWH', 'SRC', 'MCA', 'PKU', 'KGP',
      'BHC', 'JKPR', 'CTC', 'BRAG', 'BBS', 'KUR', 'PURI',
    ];

    return forecast.station_timeline.map((fcStop, idx) => {
      const isTerminus = idx === lastIdx;
      const isPassed = hasLiveTrain
        ? isUp
          ? fcStop.chainage_km > trainKm + 0.8
          : fcStop.chainage_km < trainKm - 0.8
        : false;

      let status: 'passed' | 'current' | 'upcoming' = 'upcoming';
      let isHalted = false;

      if (train?.status === 'AT_TERMINUS' && isTerminus) {
        status = 'current';
        isHalted = true;
        currentAssigned = true;
      } else if (train?.current_station === fcStop.station_code) {
        status = 'current';
        isHalted = (train?.speed_kmph ?? 0) === 0;
        currentAssigned = true;
      } else if (isPassed) {
        status = 'passed';
      } else if (!currentAssigned && (train?.next_station === fcStop.station_code || isTerminus)) {
        status = 'current';
        isHalted = (train?.speed_kmph ?? 0) === 0 && Math.abs(fcStop.chainage_km - trainKm) <= 0.8;
        currentAssigned = true;
      }

      const schedArr = formatEpochTo12Hour(fcStop.sched_arr_epoch);
      const schedDep = isTerminus ? '—' : formatEpochTo12Hour(fcStop.sched_dep_epoch);
      const projArr = formatEpochTo12Hour(fcStop.projected_arr_epoch);
      const projDep = isTerminus ? '—' : formatEpochTo12Hour(fcStop.projected_dep_epoch);

      return {
        station_code: fcStop.station_code,
        station_name: fcStop.station_name,
        chainage_km: fcStop.chainage_km,
        scheduled_arr: schedArr,
        scheduled_dep: schedDep,
        projected_arr: projArr,
        projected_dep: projDep,
        delay_mins: Math.max(0, Math.round(fcStop.net_delay_mins)),
        platform: isTerminus ? 'PF (Terminus)' : idx === 0 ? 'PF (Origin)' : 'PF (Main)',
        is_junction: junctionCodes.includes(fcStop.station_code),
        status,
        is_terminus: isTerminus,
        is_halted: isHalted,
      };
    });
  }

  // Fallback to static base stations when forecast is still loading
  const baseStations = isKolkata
    ? (isUp ? FULL_SER_STATIONS_UP : FULL_SER_STATIONS)
    : (isUp ? FULL_CORRIDOR_STATIONS_UP : FULL_CORRIDOR_STATIONS);

  const lastIdx = baseStations.length - 1;
  let currentAssigned = false;
  return baseStations.map((stn, idx) => {
    const isTerminus = idx === lastIdx;
    const isPassed = hasLiveTrain
      ? isUp
        ? stn.chainage_km > trainKm + 0.8
        : stn.chainage_km < trainKm - 0.8
      : false;

    let status: 'passed' | 'current' | 'upcoming' = 'upcoming';
    let isHalted = false;

    if (train?.status === 'AT_TERMINUS' && isTerminus) {
      status = 'current';
      isHalted = true;
      currentAssigned = true;
    } else if (train?.current_station === stn.station_code) {
      status = 'current';
      isHalted = (train?.speed_kmph ?? 0) === 0;
      currentAssigned = true;
    } else if (isPassed) {
      status = 'passed';
    } else if (!currentAssigned && (train?.next_station === stn.station_code || isTerminus)) {
      status = 'current';
      isHalted = (train?.speed_kmph ?? 0) === 0 && Math.abs(stn.chainage_km - trainKm) <= 0.8;
      currentAssigned = true;
    }

    return {
      ...stn,
      status,
      is_terminus: isTerminus,
      is_halted: isHalted,
    };
  });
}
