import type {
  CorridorSnapshot,
  ForecastResponse,
  RescueEvaluationResponse,
} from '../types/corridor';
import { MOCK_RESCUE_ONBOARD, MOCK_SNAPSHOT, getMockForecast } from './mockFallback';

export async function fetchCorridorState(backendOrigin: string): Promise<CorridorSnapshot> {
  try {
    const res = await fetch(`${backendOrigin}/api/v1/corridor/state`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Corridor state fetch failed, using fallback:', err);
    return MOCK_SNAPSHOT;
  }
}

export async function fetchForecast(
  backendOrigin: string,
  trainNo: string
): Promise<ForecastResponse> {
  try {
    const res = await fetch(`${backendOrigin}/api/v1/trains/${trainNo}/forecast`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`Forecast fetch for ${trainNo} failed, using fallback:`, err);
    return getMockForecast(trainNo);
  }
}

export async function evaluateRescue(
  backendOrigin: string,
  payload: {
    train_no: string;
    destination_code: string;
    connection_deadline_utc: number;
    transfer_buffer_mins: number;
    passenger_status: 'PRE_BOARDING' | 'ON_BOARD';
  }
): Promise<RescueEvaluationResponse> {
  try {
    const res = await fetch(`${backendOrigin}/api/v1/rescue/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Rescue evaluation failed, using fallback:', err);
    if (payload.passenger_status === 'PRE_BOARDING') {
      return {
        passenger_status: 'PRE_BOARDING',
        survival_probability_pct: 18.0,
        risk_level: 'HIGH_RISK_MISS',
        safe_boarding_lock: true,
        boarding_advisory:
          'Report to your boarding station as per official schedule. Delayed trains can recover slack.',
        bailout_recommended: false,
        disclaimer: "Deboarding remains passenger's voluntary decision.",
      };
    }
    return MOCK_RESCUE_ONBOARD;
  }
}

export async function injectTrainDelay(
  backendOrigin: string,
  trainNo: string,
  addedDelayMins: number
): Promise<void> {
  await fetch(`${backendOrigin}/api/v1/demo/inject-delay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ train_no: trainNo, added_delay_mins: addedDelayMins }),
  });
}

export async function resetCorridor(backendOrigin: string): Promise<void> {
  await fetch(`${backendOrigin}/api/v1/demo/reset`, { method: 'POST' });
}
