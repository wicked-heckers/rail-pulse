import { create } from 'zustand';
import type {
  CorridorSnapshot,
  ForecastResponse,
  RescueEvaluationResponse,
  TrainKinematicState,
} from '../types/corridor';
import { MOCK_SNAPSHOT } from '../services/mockFallback';

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
  drawerOpen: boolean;
  cabModalOpen: boolean;

  // Real-Time Corridor Data
  activeSnapshot: CorridorSnapshot;
  customTrains: TrainKinematicState[];
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
  setCurrentView: (view: 'landing' | 'dashboard') => void;
  setLanguage: (lang: 'EN' | 'HI' | 'OR') => void;
  navigateToDashboardWithTrain: (trainNo?: string) => void;
  setSelectedTrain: (trainNo: string) => void;
  setPassengerStatus: (status: 'PRE_BOARDING' | 'ON_BOARD') => void;
  setDrawerOpen: (open: boolean) => void;
  setCabModalOpen: (open: boolean) => void;
  setConnectionTarget: (target: Partial<ConnectionTargetState>) => void;
  setActiveMapView: (view: 'my_train' | 'delays_ahead' | 'alternative_route' | 'full_journey') => void;
  setSelectedDelayId: (id: string | null) => void;
  updateSnapshot: (snapshot: CorridorSnapshot) => void;
  addCustomTrain: (train: TrainKinematicState) => void;
  removeCustomTrain: (trainNo: string) => void;
  clearCustomTrains: () => void;
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
  drawerOpen: false,
  cabModalOpen: false,

  activeMapView: 'my_train',
  selectedDelayId: null,

  activeSnapshot: MOCK_SNAPSHOT,
  customTrains: [],
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
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setCabModalOpen: (open) => set({ cabModalOpen: open }),
  setConnectionTarget: (target) =>
    set((state) => ({
      connectionTarget: { ...state.connectionTarget, ...target },
    })),
  setActiveMapView: (view) => set({ activeMapView: view }),
  setSelectedDelayId: (id) => set({ selectedDelayId: id }),
  updateSnapshot: (snapshot) => {
    // Preserve custom trains explicitly managed in customTrains state
    const custom = get().customTrains || [];
    if (custom.length > 0) {
      const customFiltered = custom.filter(
        (ct) => !snapshot.trains?.some((st) => st.train_no === ct.train_no)
      );
      set({
        activeSnapshot: {
          ...snapshot,
          trains: [...(snapshot.trains || []), ...customFiltered],
        },
      });
    } else {
      set({ activeSnapshot: snapshot });
    }
  },
  addCustomTrain: (train) => {
    const updated = [...(get().customTrains || []).filter((t) => t.train_no !== train.train_no), train];
    const currentTrains = get().activeSnapshot?.trains || [];
    const updatedSnapshotTrains = [
      ...currentTrains.filter((t) => t.train_no !== train.train_no),
      train,
    ];
    set({
      customTrains: updated,
      activeSnapshot: {
        ...get().activeSnapshot,
        trains: updatedSnapshotTrains,
      },
    });
  },
  removeCustomTrain: (trainNo) => {
    const updated = (get().customTrains || []).filter((t) => t.train_no !== trainNo);
    const currentTrains = get().activeSnapshot?.trains || [];
    set({
      customTrains: updated,
      activeSnapshot: {
        ...get().activeSnapshot,
        trains: currentTrains.filter((t) => t.train_no !== trainNo),
      },
    });
  },
  clearCustomTrains: () => {
    const currentTrains = get().activeSnapshot?.trains || [];
    const customNos = new Set((get().customTrains || []).map((t) => t.train_no));
    set({
      customTrains: [],
      activeSnapshot: {
        ...get().activeSnapshot,
        trains: currentTrains.filter((t) => !customNos.has(t.train_no)),
      },
    });
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
