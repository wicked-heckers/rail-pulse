import React, { useEffect, useRef, useState } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { setSpeedMultiplier } from '../../services/api';
import { Shield, Navigation, ArrowLeft, Settings, Clock } from 'lucide-react';
import { TrainDropdown } from './TrainDropdown';

function formatEpochClockIST(epochSecs: number): string {
  const istSecs = (Math.floor(epochSecs) + 19800) % 86400;
  const pos = istSecs < 0 ? istSecs + 86400 : istSecs;
  const h24 = Math.floor(pos / 3600);
  const mins = Math.floor((pos % 3600) / 60);
  const secs = pos % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')} ${period}`;
}

export const TopHeader: React.FC = () => {
  const {
    selectedTrain,
    activeSnapshot,
    updateSnapshot,
    passengerStatus,
    setPassengerStatus,
    drawerOpen,
    setDrawerOpen,
    setCurrentView,
  } = useRailStore();

  const activeTrain = activeSnapshot.trains?.find((t) => t.train_no === selectedTrain);
  const simSpeed = activeSnapshot.speed_multiplier || 1;
  const clockAnchorRef = useRef<{ tickUtc: number; syncedAtMs: number; speed: number }>({
    tickUtc: activeSnapshot.tick_utc || 1795067700,
    syncedAtMs: Date.now(),
    speed: simSpeed,
  });
  const [displayEpoch, setDisplayEpoch] = useState<number>(
    activeSnapshot.tick_utc || 1795067700
  );

  // Sync clock anchor whenever backend tick or speed multiplier changes
  useEffect(() => {
    const tick = activeSnapshot.tick_utc || 1795067700;
    clockAnchorRef.current = {
      tickUtc: tick,
      syncedAtMs: Date.now(),
      speed: activeSnapshot.speed_multiplier || 1,
    };
    setDisplayEpoch(tick);
  }, [activeSnapshot.tick_utc, activeSnapshot.speed_multiplier]);

  // Smooth sub-second digital clock interpolation scaled by 1x / 10x / 30x
  useEffect(() => {
    const id = window.setInterval(() => {
      const { tickUtc, syncedAtMs, speed } = clockAnchorRef.current;
      const elapsedSec = (Date.now() - syncedAtMs) / 1000;
      setDisplayEpoch(tickUtc + elapsedSec * speed);
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const handleQuickSpeed = async (newSpeed: number) => {
    updateSnapshot({ ...activeSnapshot, speed_multiplier: newSpeed });
    try {
      await setSpeedMultiplier(newSpeed);
    } catch {
      // Keep optimistic client clock speed if network call fails
    }
  };

  // Listen for Shift + D hotkey for Demo drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setDrawerOpen(!drawerOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen, setDrawerOpen]);

  return (
    <header className="h-[52px] shrink-0 sticky top-0 z-40 bg-[#FAF9F6] border-b border-[#E5E7EB] px-4 sm:px-5 flex items-center justify-between">
      {/* Brand & Return */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => setCurrentView('landing')}
          className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
          title="Return to Landing Page"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <button
          onClick={() => setCurrentView('landing')}
          className="flex items-center gap-2.5 group transition-opacity cursor-pointer"
          title="Return to Landing Page"
        >
          <img src="/logo.png" alt="Rail-Pulse logo" className="w-7 h-7 object-contain" />
          <span className="font-mono font-bold text-base sm:text-lg tracking-wider text-[#0F294A]">
            RAIL-PULSE
          </span>
        </button>

        <span
          className="hidden sm:inline-flex text-xs font-mono px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-bold select-none cursor-default"
          title="East Coast Railway Trunk Corridor"
        >
          {activeTrain?.direction === 'UP' || selectedTrain === '18410'
            ? 'PURI → BHC'
            : 'BHC → PURI'}
        </span>
      </div>

      {/* Active Monitored Train Selector (Hidden on < md since active train is prominent in arrival card) */}
      <div className="hidden md:flex items-center justify-center px-1 sm:px-2">
        <TrainDropdown />
      </div>

      {/* Right Controls: Digital Clock + Safe-Boarding Toggle + Demo Button */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Live Digital Simulation Clock + Quick 1x/10x/30x */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0F294A] text-white border border-slate-700 shadow-2xs"
          title="Live Corridor Simulation Clock (IST)"
        >
          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-mono font-bold text-xs tracking-tight tabular-nums whitespace-nowrap">
            {formatEpochClockIST(displayEpoch)}{' '}
            <span className="hidden sm:inline text-slate-300 text-[10px]">IST</span>
          </span>
          <div className="hidden sm:flex items-center gap-0.5 ml-1 pl-1.5 border-l border-slate-600">
            {[1, 10, 30].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleQuickSpeed(s)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                  simSpeed === s
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title={`Set simulation clock speed to ${s}x`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* At Home | On Board Toggle */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setPassengerStatus('PRE_BOARDING')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              passengerStatus === 'PRE_BOARDING'
                ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Safe-Boarding: At home protection against premature bailout advice"
          >
            <Shield className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">At Home</span>
          </button>
          <button
            onClick={() => setPassengerStatus('ON_BOARD')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              passengerStatus === 'ON_BOARD'
                ? 'bg-white text-[#0F294A] shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="On Board: Enables early-junction road rescue evaluation"
          >
            <Navigation className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">On Board</span>
          </button>
        </div>

        {/* Compact Demo Button */}
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
          title="Demo Controls (Shift+D)"
        >
          <Settings className="w-4 h-4 text-[#0F294A]" />
          <span>Demo</span>
        </button>
      </div>
    </header>
  );
};
