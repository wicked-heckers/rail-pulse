import { create } from 'zustand';
import type {
  CorridorSnapshot,
  ForecastResponse,
  RescueEvaluationResponse,
} from '../types/corridor';
import { MOCK_SNAPSHOT } from '../services/mockFallback';

interface ConnectionTargetState {
  station_code: string;
  deadline_time: string;
  transfer_buffer_mins: number;
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
  activeSnapshot: CorridorSnapshot;
  forecast: ForecastResponse | null;
  rescue: RescueEvaluationResponse | null;
  connectionTarget: ConnectionTargetState;

  // Connection & Health
  wsConnected: boolean;
  wsStatusText: string;

  // Actions
  setCurrentView: (view: 'landing' | 'dashboard') => void;
  setLanguage: (lang: 'EN' | 'HI' | 'OR') => void;
  navigateToDashboardWithTrain: (trainNo?: string) => void;
  setSelectedTrain: (trainNo: string) => void;
  setPassengerStatus: (status: 'PRE_BOARDING' | 'ON_BOARD') => void;
  setMobileTab: (tab: 'timeline' | 'radar') => void;
  setDrawerOpen: (open: boolean) => void;
  setCabModalOpen: (open: boolean) => void;
  setConnectionTarget: (target: Partial<ConnectionTargetState>) => void;
  updateSnapshot: (snapshot: CorridorSnapshot) => void;
  setForecast: (forecast: ForecastResponse) => void;
  setRescue: (rescue: RescueEvaluationResponse) => void;
  setWsStatus: (connected: boolean, text: string) => void;
}

export const useRailStore = create<RailStore>((set) => ({
  currentView: 'landing',
  language: 'EN',
  selectedTrain: '12821',
  passengerStatus: 'ON_BOARD',
  mobileTab: 'timeline',
  drawerOpen: false,
  cabModalOpen: false,

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

  setCurrentView: (view) => set({ currentView: view }),
  setLanguage: (lang) => set({ language: lang }),
  navigateToDashboardWithTrain: (trainNo) =>
    set((state) => ({
      currentView: 'dashboard',
      selectedTrain: trainNo || state.selectedTrain,
    })),
  setSelectedTrain: (trainNo) => set({ selectedTrain: trainNo }),
  setPassengerStatus: (status) => set({ passengerStatus: status }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setCabModalOpen: (open) => set({ cabModalOpen: open }),
  setConnectionTarget: (target) =>
    set((state) => ({
      connectionTarget: { ...state.connectionTarget, ...target },
    })),
  updateSnapshot: (snapshot) => set({ activeSnapshot: snapshot }),
  setForecast: (forecast) => set({ forecast }),
  setRescue: (rescue) => set({ rescue }),
  setWsStatus: (connected, text) =>
    set({ wsConnected: connected, wsStatusText: text }),
}));
