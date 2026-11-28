interface PilotStation {
  code: string;
  name: string;
  km: number;
}

const ECOR_PILOT_STATIONS: PilotStation[] = [
  { code: 'BHC', name: 'Bhadrak', km: 0.0 },
  { code: 'JJKR', name: 'Jajpur Keonjhar Road', km: 44.0 },
  { code: 'JKPR', name: 'Jakhapura Junction', km: 51.0 },
  { code: 'NRG', name: 'Nergundi Junction', km: 106.0 },
  { code: 'CTC', name: 'Cuttack Junction', km: 115.0 },
  { code: 'BRAG', name: 'Barang Junction', km: 128.0 },
  { code: 'BBS', name: 'Bhubaneswar', km: 143.0 },
  { code: 'KUR', name: 'Khurda Road Junction', km: 162.0 },
  { code: 'PURI', name: 'Puri Terminal', km: 206.0 },
];

const SER_PILOT_STATIONS: PilotStation[] = [
  { code: 'HWH', name: 'Howrah Junction', km: 0.0 },
  { code: 'SRC', name: 'Santragachi Junction', km: 7.0 },
  { code: 'ULB', name: 'Uluberia', km: 32.0 },
  { code: 'BZN', name: 'Bagnan', km: 45.0 },
  { code: 'MCA', name: 'Mecheda Junction', km: 58.0 },
  { code: 'PKU', name: 'Panskura Junction', km: 71.0 },
  { code: 'BCK', name: 'Balichak', km: 91.0 },
  { code: 'KGP', name: 'Kharagpur Junction', km: 115.0 },
];

export interface PilotTrain {
  no: string;
  name: string;
  direction: 'DN' | 'UP';
  delayStatus: string;
  statusColor: 'amber' | 'emerald';
  departureTime: string;
  origin: string;
  destination: string;
  subtitle: string;
}

const ECOR_PILOT_TRAINS: PilotTrain[] = [
  {
    no: '12821',
    name: 'Dhauli Express',
    direction: 'DN',
    delayStatus: '+28m late',
    statusColor: 'amber',
    departureTime: '09:50 AM',
    origin: 'Bhadrak (BHC)',
    destination: 'Puri (PURI)',
    subtitle: 'Departs 09:50 AM • Bhadrak (BHC) → Puri (PURI)',
  },
  {
    no: '22895',
    name: 'Vande Bharat',
    direction: 'DN',
    delayStatus: '+2m late',
    statusColor: 'emerald',
    departureTime: '10:17 AM',
    origin: 'Bhadrak (BHC)',
    destination: 'Puri (PURI)',
    subtitle: 'Departs 10:17 AM • Bhadrak (BHC) → Puri (PURI)',
  },
  {
    no: '18410',
    name: 'Sri Jagannath Express',
    direction: 'UP',
    delayStatus: '+5m late',
    statusColor: 'amber',
    departureTime: '09:30 AM',
    origin: 'Puri (PURI)',
    destination: 'Bhadrak (BHC)',
    subtitle: 'Departs 09:30 AM • Puri (PURI) → Bhadrak (BHC)',
  },
];

const SER_PILOT_TRAINS: PilotTrain[] = [
  {
    no: '12821',
    name: 'Dhauli Express',
    direction: 'DN',
    delayStatus: '+28m late',
    statusColor: 'amber',
    departureTime: '06:00 AM',
    origin: 'Howrah (HWH)',
    destination: 'Kharagpur (KGP)',
    subtitle: 'Departs 06:00 AM • Howrah (HWH) → Kharagpur (KGP)',
  },
  {
    no: '22895',
    name: 'Vande Bharat',
    direction: 'DN',
    delayStatus: '+2m late',
    statusColor: 'emerald',
    departureTime: '06:19 AM',
    origin: 'Howrah (HWH)',
    destination: 'Kharagpur (KGP)',
    subtitle: 'Departs 06:19 AM • Howrah (HWH) → Kharagpur (KGP)',
  },
  {
    no: '12822',
    name: 'Dhauli Express UP',
    direction: 'UP',
    delayStatus: '+4m late',
    statusColor: 'amber',
    departureTime: '02:00 PM',
    origin: 'Kharagpur (KGP)',
    destination: 'Howrah (HWH)',
    subtitle: 'Departs 02:00 PM • Kharagpur (KGP) → Howrah (HWH)',
  },
];

export interface RecentItem {
  id: string;
  label: string;
  fromCode: string;
  toCode: string;
}

const ECOR_DEFAULT_RECENT: RecentItem[] = [
  {
    id: 'r1',
    label: 'Bhadrak (BHC) → Bhubaneswar (BBS)',
    fromCode: 'BHC',
    toCode: 'BBS',
  },
  {
    id: 'r2',
    label: 'Cuttack (CTC) → Khurda Road (KUR)',
    fromCode: 'CTC',
    toCode: 'KUR',
  },
];

const SER_DEFAULT_RECENT: RecentItem[] = [
  {
    id: 'sr1',
    label: 'Howrah (HWH) → Kharagpur (KGP)',
    fromCode: 'HWH',
    toCode: 'KGP',
  },
  {
    id: 'sr2',
    label: 'Santragachi (SRC) → Mecheda (MCA)',
    fromCode: 'SRC',
    toCode: 'MCA',
  },
];

// Helper functions for corridor-aware discovery
export function getStationsForCorridor(corridorId?: string): PilotStation[] {
  return corridorId === 'SER_HWH_KGP' ? SER_PILOT_STATIONS : ECOR_PILOT_STATIONS;
}

export function getTrainsForCorridor(corridorId?: string): PilotTrain[] {
  return corridorId === 'SER_HWH_KGP' ? SER_PILOT_TRAINS : ECOR_PILOT_TRAINS;
}

export function getDefaultRecentForCorridor(corridorId?: string): RecentItem[] {
  return corridorId === 'SER_HWH_KGP' ? SER_DEFAULT_RECENT : ECOR_DEFAULT_RECENT;
}
