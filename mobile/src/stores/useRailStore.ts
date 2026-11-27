import { create } from 'zustand';
import { getDefaultBackendOrigin } from '../config/apiConfig';
import { ECOR_STATIONS, MOCK_SNAPSHOT } from '../services/mockFallback';
import type {
  CorridorSnapshot,
  ForecastResponse,
  RescueEvaluationResponse,
} from '../types/corridor';

export type MobileTab = 'search' | 'timeline' | 'map' | 'rescue';

function interpolateLatLon(chainageKm: number): { lat: number; lon: number } {
  if (chainageKm <= ECOR_STATIONS[0].chainage_km) {
    return { lat: ECOR_STATIONS[0].lat, lon: ECOR_STATIONS[0].lon };
  }
  const last = ECOR_STATIONS[ECOR_STATIONS.length - 1];
  if (chainageKm >= last.chainage_km) {
    return { lat: last.lat, lon: last.lon };
  }
  for (let i = 0; i < ECOR_STATIONS.length - 1; i++) {
    const a = ECOR_STATIONS[i];
    const b = ECOR_STATIONS[i + 1];
    if (chainageKm >= a.chainage_km && chainageKm <= b.chainage_km) {
      const span = b.chainage_km - a.chainage_km;
      const r = span > 0 ? (chainageKm - a.chainage_km) / span : 0;
      return {
        lat: Number((a.lat + r * (b.lat - a.lat)).toFixed(5)),
        lon: Number((a.lon + r * (b.lon - a.lon)).toFixed(5)),
      };
    }
  }
  return { lat: last.lat, lon: last.lon };
}

interface RailMobileStore {
  backendOrigin: string;
  activeTab: MobileTab;
  selectedTrain: string;
  passengerStatus: 'PRE_BOARDING' | 'ON_BOARD';
  destinationCode: string;
  transferBufferMins: number;

  activeSnapshot: CorridorSnapshot;
  forecast: ForecastResponse | null;
  rescue: RescueEvaluationResponse | null;

  wsConnected: boolean;
  wsStatusText: string;

  setBackendOrigin: (url: string) => void;
  setActiveTab: (tab: MobileTab) => void;
  selectTrainAndOpen: (trainNo: string) => void;
  setPassengerStatus: (status: 'PRE_BOARDING' | 'ON_BOARD') => void;
  setDestinationCode: (code: string) => void;
  updateSnapshot: (snapshot: CorridorSnapshot) => void;
  advanceOfflineSim: (elapsedSecs?: number) => void;
  injectLocalDelay: (trainNo: string, addedMins: number) => void;
  resetLocalSim: () => void;
  setForecast: (forecast: ForecastResponse) => void;
  setRescue: (rescue: RescueEvaluationResponse) => void;
  setWsStatus: (connected: boolean, text: string) => void;
}

export const useRailStore = create<RailMobileStore>((set) => ({
  backendOrigin: getDefaultBackendOrigin(),
  activeTab: 'search',
  selectedTrain: '12821',
  passengerStatus: 'ON_BOARD',
  destinationCode: 'BBS',
  transferBufferMins: 15,

  activeSnapshot: MOCK_SNAPSHOT,
  forecast: null,
  rescue: null,

  wsConnected: false,
  wsStatusText: 'Demo Mode',

  setBackendOrigin: (url) => set({ backendOrigin: url.replace(/\/+$/, '') }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  selectTrainAndOpen: (trainNo) =>
    set({ selectedTrain: trainNo, activeTab: 'timeline' }),
  setPassengerStatus: (status) => set({ passengerStatus: status }),
  setDestinationCode: (code) => set({ destinationCode: code }),
  updateSnapshot: (snapshot) => set({ activeSnapshot: snapshot }),
  advanceOfflineSim: (elapsedSecs = 15) =>
    set((state) => {
      const deltaHours = elapsedSecs / 3600;
      const trains = state.activeSnapshot.trains.map((t) => {
        const speed = t.speed_kmph > 0 ? t.speed_kmph : 65;
        const deltaKm = speed * deltaHours;
        let nextKm =
          t.direction === 'DN' ? t.chainage_km + deltaKm : t.chainage_km - deltaKm;
        if (nextKm >= 206) nextKm = 0;
        if (nextKm <= 0) nextKm = 206;
        const { lat, lon } = interpolateLatLon(nextKm);
        return {
          ...t,
          speed_kmph: t.speed_kmph > 0 ? t.speed_kmph : 65,
          status: t.speed_kmph > 0 ? t.status : 'RUNNING_NORMAL',
          chainage_km: Number(nextKm.toFixed(2)),
          lat,
          lon,
          last_updated_epoch: state.activeSnapshot.tick_utc + elapsedSecs,
        };
      });
      return {
        activeSnapshot: {
          ...state.activeSnapshot,
          mode: 'DEMO_OFFLINE',
          tick_utc: state.activeSnapshot.tick_utc + elapsedSecs,
          trains,
        },
      };
    }),
  injectLocalDelay: (trainNo, addedMins) =>
    set((state) => ({
      activeSnapshot: {
        ...state.activeSnapshot,
        trains: state.activeSnapshot.trains.map((t) =>
          t.train_no === trainNo
            ? { ...t, current_delay_mins: t.current_delay_mins + addedMins }
            : t
        ),
      },
    })),
  resetLocalSim: () => set({ activeSnapshot: MOCK_SNAPSHOT }),
  setForecast: (forecast) => set({ forecast }),
  setRescue: (rescue) => set({ rescue }),
  setWsStatus: (connected, text) =>
    set({ wsConnected: connected, wsStatusText: text }),
}));
