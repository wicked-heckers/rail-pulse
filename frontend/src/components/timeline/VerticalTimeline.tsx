import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { StationRow, type StationData } from './StationRow';
import { HazardTrackPill, type HazardItem } from './HazardTrackPill';
import { Train, Gauge, Compass } from 'lucide-react';

const STATIONS_DATA: StationData[] = [
  {
    station_code: 'BHC',
    station_name: 'Bhadrak',
    chainage_km: 0.0,
    scheduled_arr: '09:25 AM',
    scheduled_dep: '09:30 AM',
    projected_arr: '09:25 AM',
    projected_dep: '09:30 AM',
    delay_mins: 0,
    platform: 'PF 1 (Origin)',
    is_junction: true,
    status: 'passed',
    intermediate_blocks: [
      { block_id: 'DN_BHC_A1', length_km: 2.1, speed_limit_kmh: 110, signal: 'GREEN' },
      { block_id: 'DN_BHC_A2', length_km: 2.2, speed_limit_kmh: 110, signal: 'GREEN' },
      { block_id: 'DN_BHC_A3', length_km: 1.9, speed_limit_kmh: 110, signal: 'GREEN' },
    ],
  },
  {
    station_code: 'JJKR',
    station_name: 'Jajpur Keonjhar Road',
    chainage_km: 44.0,
    scheduled_arr: '10:15 AM',
    scheduled_dep: '10:18 AM',
    projected_arr: '10:15 AM',
    projected_dep: '10:18 AM',
    delay_mins: 0,
    platform: 'PF 2 (Main)',
    is_junction: false,
    status: 'passed',
  },
  {
    station_code: 'JKPR',
    station_name: 'Jakhapura Junction',
    chainage_km: 51.0,
    scheduled_arr: '10:28 AM',
    scheduled_dep: '10:30 AM',
    projected_arr: '10:34 AM',
    projected_dep: '10:36 AM',
    delay_mins: 6,
    platform: 'PF 1 (Loop)',
    is_junction: true,
    status: 'passed',
  },
  {
    station_code: 'NRG',
    station_name: 'Nergundi Junction',
    chainage_km: 106.0,
    scheduled_arr: '11:10 AM',
    scheduled_dep: '11:12 AM',
    projected_arr: '11:32 AM',
    projected_dep: '11:34 AM',
    delay_mins: 22,
    platform: 'PF 2 (Main)',
    is_junction: false,
    status: 'current',
    intermediate_blocks: [
      { block_id: 'DN_NRG_A1', length_km: 1.8, speed_limit_kmh: 30, signal: 'DOUBLE_YELLOW' },
      { block_id: 'DN_NRG_A2', length_km: 1.7, speed_limit_kmh: 25, signal: 'RED' },
    ],
  },
  {
    station_code: 'CTC',
    station_name: 'Cuttack Junction',
    chainage_km: 115.0,
    scheduled_arr: '11:22 AM',
    scheduled_dep: '11:25 AM',
    projected_arr: '11:50 AM',
    projected_dep: '11:53 AM',
    delay_mins: 28,
    platform: 'PF 1 (Loop Hold)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'BRAG',
    station_name: 'Barang Junction',
    chainage_km: 128.0,
    scheduled_arr: '11:42 AM',
    scheduled_dep: '11:44 AM',
    projected_arr: '12:10 PM',
    projected_dep: '12:12 PM',
    delay_mins: 28,
    platform: 'PF 2 (Main)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'BBS',
    station_name: 'Bhubaneswar',
    chainage_km: 143.0,
    scheduled_arr: '12:05 PM',
    scheduled_dep: '12:10 PM',
    projected_arr: '12:33 PM',
    projected_dep: '12:38 PM',
    delay_mins: 28,
    platform: 'PF 3 (Transfer Concourse)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'KUR',
    station_name: 'Khurda Road Junction',
    chainage_km: 162.0,
    scheduled_arr: '12:40 PM',
    scheduled_dep: '12:45 PM',
    projected_arr: '13:08 PM',
    projected_dep: '13:13 PM',
    delay_mins: 28,
    platform: 'PF 2 (Main)',
    is_junction: true,
    status: 'upcoming',
  },
  {
    station_code: 'PURI',
    station_name: 'Puri Terminal',
    chainage_km: 206.0,
    scheduled_arr: '14:00 PM',
    scheduled_dep: '—',
    projected_arr: '14:20 PM',
    projected_dep: '—',
    delay_mins: 20,
    platform: 'PF 4 (Terminus)',
    is_junction: true,
    status: 'upcoming',
  },
];

const HAZARDS: HazardItem[] = [
  {
    id: 'hz-1',
    type: 'PHANTOM_FREIGHT',
    title: 'Phantom Freight Shadow Ahead',
    location: 'Jenapur Section',
    chainage_km: 94.2,
    delay_impact_mins: 14,
    description: 'Unscheduled bulk rake occupying automatic block ahead. 12821 following double yellow aspects.',
    mitigation: 'Restricted headway speed to 25 km/h. Safe headway buffer maintained at 1,800m.',
  },
  {
    id: 'hz-2',
    type: 'LOOP_OVERTAKE',
    title: 'Loop-Line Hold for Superfast Overtake',
    location: 'Cuttack Junction',
    chainage_km: 115.0,
    delay_impact_mins: 12,
    description: '12821 diverted to CTC Loop Line to allow higher-priority 12841 Coromandel Express through run.',
    mitigation: 'Turnout deceleration + 8m dwell hold + mainline re-acceleration penalty.',
  },
];

export const VerticalTimeline: React.FC = () => {
  const { selectedTrain, activeSnapshot } = useRailStore();

  const currentTrain = activeSnapshot.trains.find((t) => t.train_no === selectedTrain) || activeSnapshot.trains[0];
  const trainSpeed = currentTrain ? Math.round(currentTrain.speed_kmph ?? 0) : 64;
  const trainKm = currentTrain ? (currentTrain.chainage_km ?? 82.4) : 82.4;
  const currentDelay = currentTrain ? Math.round(currentTrain.current_delay_mins ?? 28) : 28;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
      {/* Target Train Status Summary Banner */}
      <div className="bg-[#FAF9F6] border border-[#E2E8F0] rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center font-mono font-bold text-xs">
              <Train className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-[#0F172A]">
                  {selectedTrain} {currentTrain?.train_name ?? 'Dhauli Express'}
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                  +{currentDelay}m DELAY
                </span>
              </div>
              <p className="text-[11px] text-[#64748B]">Bhadrak (BHC) ➔ Puri (PURI) • Down Line</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-right">
            <div>
              <div className="text-[10px] text-[#64748B] flex items-center justify-end gap-1">
                <Gauge className="w-3 h-3 text-[#0F172A]" /> Speed
              </div>
              <div className="font-mono text-sm font-bold text-[#0F172A]">{trainSpeed} km/h</div>
            </div>
            <div>
              <div className="text-[10px] text-[#64748B] flex items-center justify-end gap-1">
                <Compass className="w-3 h-3 text-[#0F172A]" /> Location
              </div>
              <div className="font-mono text-xs font-bold text-emerald-700">km {trainKm.toFixed(1)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Where Is My Train Vertical Timeline with continuous track line */}
      <div className="relative">
        {/* Continuous Track Line (vertical rail) */}
        <div className="absolute left-[13px] top-6 bottom-6 w-0.5 bg-[#CBD5E1] -translate-x-1/2" />

        {/* Station Sequence */}
        {STATIONS_DATA.map((stn, idx) => {
          const isAtThisStation = Math.abs(stn.chainage_km - trainKm) < 6;
          return (
            <React.Fragment key={stn.station_code}>
              <StationRow
                station={stn}
                isTargetTrainHere={isAtThisStation}
                trainSpeed={trainSpeed}
              />

              {/* Inject Phantom Freight Hazard between Jajpur and Nergundi (km 94.2) */}
              {idx === 2 && <HazardTrackPill hazard={HAZARDS[0]} />}

              {/* Inject Loop-Line Overtake Hold at Cuttack (km 115) */}
              {idx === 3 && <HazardTrackPill hazard={HAZARDS[1]} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
