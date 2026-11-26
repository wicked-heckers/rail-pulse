import { create } from 'zustand';
import type {
  CorridorSnapshot,
  CorridorSummary,
  ForecastResponse,
  RescueEvaluationResponse,
} from '../types/corridor';
import { MOCK_SNAPSHOT } from '../services/mockFallback';
import { listCorridors, switchCorridorApi } from '../services/api';

interface ConnectionTargetState {
  station_code: string;
  deadline_time: string;
  transfer_buffer_mins: number;
  isCustom?: boolean;
}

interface RailStore {
  // Navigation & View Flow
  currentView: 'landing' | 'dashboard';
  language: 'EN' | 'HI' | 'OR';
  selectedTrain: string;
  passengerStatus: 'PRE_BOARDING' | 'ON_BOARD';
  mobileTab: 'timeline' | 'radar';
  drawerOpen: boolean;
  cabModalOpen: boolean;

  // Real-Time Corridor Data
  activeCorridorId: string;
  availableCorridors: CorridorSummary[];
  activeSnapshot: CorridorSnapshot;
  forecast: ForecastResponse | null;
  rescue: RescueEvaluationResponse | null;
  connectionTarget: ConnectionTargetState;

  // Map Interactive State (Stage 2)
  activeMapView: 'my_train' | 'delays_ahead' | 'alternative_route' | 'full_journey';
  selectedDelayId: string | null;

  // Connection & Health
  wsConnected: boolean;
  wsStatusText: string;
  refreshNonce: number;
  activeCausesByTrain: Record<string, string[]>;

  // Actions
  fetchCorridors: () => Promise<void>;
  switchCorridor: (corridorId: string) => Promise<void>;
  setCurrentView: (view: 'landing' | 'dashboard') => void;
  setLanguage: (lang: 'EN' | 'HI' | 'OR') => void;
  navigateToDashboardWithTrain: (trainNo?: string) => void;
  setSelectedTrain: (trainNo: string) => void;
  setPassengerStatus: (status: 'PRE_BOARDING' | 'ON_BOARD') => void;
  setMobileTab: (tab: 'timeline' | 'radar') => void;
  setDrawerOpen: (open: boolean) => void;
  setCabModalOpen: (open: boolean) => void;
  setConnectionTarget: (target: Partial<ConnectionTargetState>) => void;
  setActiveMapView: (view: 'my_train' | 'delays_ahead' | 'alternative_route' | 'full_journey') => void;
  setSelectedDelayId: (id: string | null) => void;
  updateSnapshot: (snapshot: CorridorSnapshot) => void;
  setForecast: (forecast: ForecastResponse) => void;
  setRescue: (rescue: RescueEvaluationResponse) => void;
  setWsStatus: (connected: boolean, text: string) => void;
  setTrainCauses: (trainNo: string, causes: string[]) => void;
  clearAllCauses: () => void;
  triggerRefresh: () => void;
}

export const useRailStore = create<RailStore>((set, get) => ({
  currentView: 'landing',
  language: 'EN',
  selectedTrain: '12821',
  passengerStatus: 'ON_BOARD',
  mobileTab: 'timeline',
  drawerOpen: false,
  cabModalOpen: false,

  activeCorridorId: 'ECoR_BHC_PURI',
  availableCorridors: [
    {
      id: 'ECoR_BHC_PURI',
      name: 'East Coast Trunk Line',
      section: 'Bhadrak – Cuttack – Bhubaneswar – Puri',
      length_km: 206.0,
      stations_count: 9,
      primary_highway: 'NH-16 / NH-316',
      region: 'East Coast Railway (ECoR)',
      is_active: true,
    },
    {
      id: 'SER_HWH_KGP',
      name: 'Kolkata Trunk Line',
      section: 'Howrah – Santragachi – Mecheda – Kharagpur',
      length_km: 115.0,
      stations_count: 8,
      primary_highway: 'NH-16 / Kona Expressway',
      region: 'South Eastern Railway (SER)',
      is_active: false,
    },
  ],

  activeMapView: 'my_train',
  selectedDelayId: null,

  activeSnapshot: MOCK_SNAPSHOT,
  forecast: null,
  rescue: null,
  connectionTarget: {
    station_code: 'BBS',
    deadline_time: '12:15',
    transfer_buffer_mins: 15,
  },

  wsConnected: false,
  wsStatusText: 'Connecting...',
  refreshNonce: 0,
  activeCausesByTrain: {},

  fetchCorridors: async () => {
    try {
      const list = await listCorridors();
      if (list && list.length > 0) {
        const active = list.find((c) => c.is_active)?.id || get().activeCorridorId;
        set({ availableCorridors: list, activeCorridorId: active });
      }
    } catch (err) {
      console.warn('fetchCorridors failed', err);
    }
  },

  switchCorridor: async (corridorId: string) => {
    try {
      const currentSpeed = get().activeSnapshot.speed_multiplier || 1;
      const newSnap = await switchCorridorApi(corridorId, currentSpeed);
      const isKolkata = corridorId === 'SER_HWH_KGP';
      set((state) => ({
        activeCorridorId: corridorId,
        availableCorridors: state.availableCorridors.map((c) => ({
          ...c,
          is_active: c.id === corridorId,
        })),
        activeSnapshot: newSnap,
        selectedTrain: '12821',
        connectionTarget: {
          station_code: isKolkata ? 'KGP' : 'BBS',
          deadline_time: isKolkata ? '11:15' : '12:15',
          transfer_buffer_mins: 15,
          isCustom: false,
        },
        refreshNonce: state.refreshNonce + 1,
      }));
    } catch (err) {
      console.warn('switchCorridor failed', err);
    }
  },

  setCurrentView: (view) => set({ currentView: view }),
  setLanguage: (lang) => set({ language: lang }),
  navigateToDashboardWithTrain: (trainNo) =>
    set((state) => ({
      currentView: 'dashboard',
      selectedTrain: trainNo || state.selectedTrain,
    })),
  setSelectedTrain: (trainNo) =>
    set((state) => ({
      selectedTrain: trainNo,
      connectionTarget: { ...state.connectionTarget, isCustom: false },
    })),
  setPassengerStatus: (status) => set({ passengerStatus: status }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setCabModalOpen: (open) => set({ cabModalOpen: open }),
  setConnectionTarget: (target) =>
    set((state) => ({
      connectionTarget: { ...state.connectionTarget, ...target },
    })),
  setActiveMapView: (view) => set({ activeMapView: view }),
  setSelectedDelayId: (id) => set({ selectedDelayId: id }),
  updateSnapshot: (snapshot) => {
    // Sync active corridor id if snapshot has it
    const activeCorridorId = snapshot.corridor_id || get().activeCorridorId;
    // Preserve custom trains that were injected into the client-side snapshot
    const currentCustom = get().activeSnapshot?.trains?.filter(
      (t) => !snapshot.trains?.some((st) => st.train_no === t.train_no)
    );
    if (currentCustom && currentCustom.length > 0) {
      set({
        activeCorridorId,
        activeSnapshot: {
          ...snapshot,
          trains: [...snapshot.trains, ...currentCustom],
        },
      });
    } else {
      set({ activeCorridorId, activeSnapshot: snapshot });
    }
  },
  setForecast: (forecast) => set({ forecast }),
  setRescue: (rescue) => set({ rescue }),
  setWsStatus: (connected, text) =>
    set({ wsConnected: connected, wsStatusText: text }),
  setTrainCauses: (trainNo, causes) =>
    set((state) => ({
      activeCausesByTrain: { ...state.activeCausesByTrain, [trainNo]: causes },
    })),
  clearAllCauses: () => set({ activeCausesByTrain: {} }),
  triggerRefresh: () => set((state) => ({ refreshNonce: state.refreshNonce + 1 })),
}));
