import { create } from 'zustand';
import { useRailStore } from './useRailStore';
import type { TrainKinematicState } from '../types/corridor';

export interface ManagerTrain {
  no: string;
  name: string;
  priority: 'Target' | 'Superfast' | 'Express' | 'Passenger' | 'Special';
  direction: 'DN' | 'UP';
  from: string;
  to: string;
  currentStation?: string;
  currentDelayMins?: number;
  isCustom?: boolean;
  addedAt?: number;
}

const INITIAL_TRAINS: ManagerTrain[] = [
  {
    no: '12821',
    name: 'Dhauli Exp',
    priority: 'Target',
    direction: 'DN',
    from: 'HWH',
    to: 'PURI',
    currentStation: 'CTC',
    currentDelayMins: 28,
    isCustom: false,
  },
  {
    no: '22895',
    name: 'Vande Bharat',
    priority: 'Superfast',
    direction: 'DN',
    from: 'HWH',
    to: 'PURI',
    currentStation: 'NRG',
    currentDelayMins: 2,
    isCustom: false,
  },
  {
    no: '18410',
    name: 'Sri Jagannath',
    priority: 'Express',
    direction: 'UP',
    from: 'PURI',
    to: 'HWH',
    currentStation: 'BBS',
    currentDelayMins: 5,
    isCustom: false,
  },
];

const STATION_COORDS: Record<string, { lat: number; lon: number; km: number }> = {
  BHC: { lat: 21.0583, lon: 86.4950, km: 0.0 },
  JJKR: { lat: 20.9500, lon: 86.1333, km: 44.0 },
  JKPR: { lat: 20.9400, lon: 86.0600, km: 51.0 },
  NRG: { lat: 20.5500, lon: 85.9200, km: 106.0 },
  CTC: { lat: 20.4625, lon: 85.8829, km: 115.0 },
  BRAG: { lat: 20.4000, lon: 85.8300, km: 128.0 },
  BBS: { lat: 20.2667, lon: 85.8333, km: 143.0 },
  KUR: { lat: 20.1833, lon: 85.7333, km: 162.0 },
  PURI: { lat: 19.8133, lon: 85.8314, km: 206.0 },
};

const STORAGE_KEY = 'rp_manager_trains';

function loadStoredTrains(): ManagerTrain[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_TRAINS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_TRAINS;

    // Ensure default initial trains are preserved
    const initialMap = new Map(INITIAL_TRAINS.map((t) => [t.no, t]));
    for (const item of parsed) {
      if (item && item.no) {
        initialMap.set(item.no, item);
      }
    }
    return Array.from(initialMap.values());
  } catch (err) {
    console.warn('Failed to load manager trains from localStorage:', err);
    return INITIAL_TRAINS;
  }
}

function saveTrains(trains: ManagerTrain[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trains));
  } catch (err) {
    console.warn('Failed to save manager trains to localStorage:', err);
  }
}

interface ManagerTrainStore {
  trains: ManagerTrain[];
  isAddModalOpen: boolean;
  setAddModalOpen: (open: boolean) => void;
  addTrain: (train: Omit<ManagerTrain, 'isCustom' | 'addedAt'>) => void;
  removeTrain: (trainNo: string) => void;
  resetToDefaults: () => void;
}

export const useManagerTrainStore = create<ManagerTrainStore>((set, get) => ({
  trains: loadStoredTrains(),
  isAddModalOpen: false,

  setAddModalOpen: (open) => set({ isAddModalOpen: open }),

  addTrain: (trainData) => {
    const existingTrains = get().trains;
    const trainNo = trainData.no.trim();
    if (!trainNo) return;

    const newTrain: ManagerTrain = {
      ...trainData,
      no: trainNo,
      name: trainData.name.trim() || `Train ${trainNo}`,
      isCustom: true,
      addedAt: Date.now(),
    };

    // Filter out if duplicate train number existed, then prepend
    const updated = [newTrain, ...existingTrains.filter((t) => t.no !== trainNo)];
    saveTrains(updated);
    set({ trains: updated, isAddModalOpen: false });

    // Inject into active corridor snapshot if missing so it's live on map
    const railStore = useRailStore.getState();
    const activeSnapshot = railStore.activeSnapshot;
    const stnCode = trainData.currentStation || (trainData.direction === 'DN' ? 'JJKR' : 'BBS');
    const coord = STATION_COORDS[stnCode] || STATION_COORDS['JJKR'];

    const snapshotTrain: TrainKinematicState = {
      train_no: newTrain.no,
      train_name: newTrain.name,
      direction: newTrain.direction,
      priority_rank:
        newTrain.priority === 'Target'
          ? 1
          : newTrain.priority === 'Superfast'
          ? 2
          : 3,
      chainage_km: coord.km,
      lat: coord.lat,
      lon: coord.lon,
      speed_kmph: 85.0,
      current_delay_mins: newTrain.currentDelayMins ?? 0.0,
      current_station: stnCode,
      next_station: newTrain.direction === 'DN' ? 'CTC' : 'JJKR',
      last_updated_epoch: Math.floor(Date.now() / 1000),
      status: (newTrain.currentDelayMins ?? 0) > 10 ? 'DELAYED' : 'RUNNING_NORMAL',
    };

    const currentTrains = activeSnapshot.trains || [];
    const updatedSnapshotTrains = [
      ...currentTrains.filter((t) => t.train_no !== newTrain.no),
      snapshotTrain,
    ];

    railStore.updateSnapshot({
      ...activeSnapshot,
      trains: updatedSnapshotTrains,
    });

    // Auto-select the newly added train
    railStore.setSelectedTrain(newTrain.no);
  },

  removeTrain: (trainNo) => {
    const existingTrains = get().trains;
    const target = existingTrains.find((t) => t.no === trainNo);
    if (!target || !target.isCustom) return; // Cannot delete system-default trains

    const updated = existingTrains.filter((t) => t.no !== trainNo);
    saveTrains(updated);
    set({ trains: updated });

    const railStore = useRailStore.getState();
    const currentSnapshot = railStore.activeSnapshot;
    if (currentSnapshot?.trains) {
      railStore.updateSnapshot({
        ...currentSnapshot,
        trains: currentSnapshot.trains.filter((t) => t.train_no !== trainNo),
      });
    }

    if (railStore.selectedTrain === trainNo) {
      railStore.setSelectedTrain('12821');
    }
  },

  resetToDefaults: () => {
    saveTrains(INITIAL_TRAINS);
    set({ trains: INITIAL_TRAINS });
    useRailStore.getState().setSelectedTrain('12821');
  },
}));
