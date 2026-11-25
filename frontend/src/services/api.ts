import type {
  ForecastResponse,
  RescueEvaluationResponse,
} from '../types/corridor';
import { MOCK_RESCUE_ONBOARD, getMockForecast } from './mockFallback';

const API_BASE = '/api/v1';

export async function fetchCorridorConfig(): Promise<{
  mapbox_access_token?: string | null;
  corridor_name: string;
  corridor_start_km: number;
  corridor_end_km: number;
}> {
  try {
    const res = await fetch(`${API_BASE}/corridor/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Corridor config fetch failed', err);
    return {
      corridor_name: 'ECoR_BHC_PURI',
      corridor_start_km: 0.0,
      corridor_end_km: 206.0,
    };
  }
}

export async function fetchForecast(trainNo: string): Promise<ForecastResponse> {
  try {
    const res = await fetch(`${API_BASE}/trains/${trainNo}/forecast`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`Forecast fetch for ${trainNo} failed, using mock data`, err);
    return getMockForecast(trainNo);
  }
}

export async function evaluateRescue(payload: {
  train_no: string;
  destination_code: string;
  connection_deadline_utc: number;
  transfer_buffer_mins: number;
  passenger_status: 'PRE_BOARDING' | 'ON_BOARD';
}): Promise<RescueEvaluationResponse> {
  try {
    const res = await fetch(`${API_BASE}/rescue/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Rescue evaluation failed, using fallback', err);
    if (payload.passenger_status === 'PRE_BOARDING') {
      return {
        passenger_status: 'PRE_BOARDING',
        survival_probability_pct: 18.0,
        risk_level: 'HIGH_RISK_MISS',
        safe_boarding_lock: true,
        boarding_advisory: 'Report to your boarding station as per official schedule. Delayed trains can recover slack.',
        bailout_recommended: false,
        disclaimer: "Deboarding remains passenger's voluntary decision.",
      };
    }
    return MOCK_RESCUE_ONBOARD;
  }
}

export async function injectTrainDelay(trainNo: string, addedDelayMins: number): Promise<any> {
  const res = await fetch(`${API_BASE}/demo/inject-delay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ train_no: trainNo, added_delay_mins: addedDelayMins }),
  });
  return await res.json();
}

export async function startDemoScenario(name = 'DHAULI_CASCADE', speed = 1): Promise<any> {
  const res = await fetch(`${API_BASE}/demo/scenario/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_name: name, speed_multiplier: speed }),
  });
  return await res.json();
}

export async function injectFreightShadow(
  blockId = 'DN_CTC_BRAG',
  penaltyMins = 20.0,
  confidence = 0.88
): Promise<any> {
  const res = await fetch(`${API_BASE}/demo/inject-freight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ block_id: blockId, penalty_mins: penaltyMins, confidence }),
  });
  return await res.json();
}

export async function resetCorridor(): Promise<any> {
  const res = await fetch(`${API_BASE}/demo/reset`, {
    method: 'POST',
  });
  return await res.json();
}

export async function injectULIPFreight(): Promise<any> {
  const res = await fetch(`${API_BASE}/webhooks/ulip-fois`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ULIP-API-Key': 'railpulse-enterprise-ulip-key',
    },
    body: JSON.stringify({
      rake_id: 'BOXN_COAL_CONFIRMED',
      block_id: 'DN_CTC_BRAG',
      direction: 'DN',
      speed_kmph: 28.0,
      cargo_type: 'COAL',
    }),
  });
  return await res.json();
}
