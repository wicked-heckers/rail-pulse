export interface PilotStation {
  code: string;
  name: string;
  km: number;
}

export const PILOT_STATIONS: PilotStation[] = [
  { code: 'BHC', name: 'Bhadrak', km: 0.0 },
  { code: 'JJKR', name: 'Jajpur Keonjhar Road', km: 44.0 },
  { code: 'CTC', name: 'Cuttack', km: 115.0 },
  { code: 'BBS', name: 'Bhubaneswar', km: 143.0 },
  { code: 'KUR', name: 'Khurda Road', km: 162.0 },
  { code: 'PURI', name: 'Puri', km: 206.0 },
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

export const PILOT_TRAINS: PilotTrain[] = [
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

export interface RecentItem {
  id: string;
  label: string;
  fromCode: string;
  toCode: string;
}

export const DEFAULT_RECENT: RecentItem[] = [
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
