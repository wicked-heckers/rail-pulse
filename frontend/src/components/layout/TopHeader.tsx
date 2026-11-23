import React, { useEffect } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { Train, Sliders, Shield, Navigation } from 'lucide-react';

const TRAIN_CHOICES = [
  { no: '12821', name: 'Dhauli Exp', badge: '+28m delay', priority: 'Target' },
  { no: '12841', name: 'Coromandel Exp', badge: 'On Time', priority: 'Superfast' },
  { no: '12839', name: 'Howrah Mail', badge: '+6m delay', priority: 'Express' },
  { no: '18409', name: 'Sri Jagannath', badge: '+12m delay', priority: 'Passenger' },
];

export const TopHeader: React.FC = () => {
  const {
    selectedTrain,
    setSelectedTrain,
    passengerStatus,
    setPassengerStatus,
    drawerOpen,
    setDrawerOpen,
    wsConnected,
    wsStatusText,
    mobileTab,
    setMobileTab,
  } = useRailStore();

  // Listen for Shift + D hotkey for Presenter drawer
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
    <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#E5E7EB] px-4 py-2.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand & Connection Radar */}
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0F172A] flex items-center justify-center text-white shadow-sm">
              <Train className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-sm tracking-wider text-[#0F172A]">RAIL-PULSE</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  ECoR TWIN
                </span>
              </div>
              <p className="text-[11px] text-[#64748B]">Bhadrak — Cuttack — Bhubaneswar — Puri</p>
            </div>
          </div>

          {/* Mobile view segmented switch: Timeline vs Live Radar */}
          <div className="flex md:hidden items-center bg-[#F1F5F9] p-0.5 rounded-lg border border-[#E2E8F0]">
            <button
              onClick={() => setMobileTab('timeline')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                mobileTab === 'timeline'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setMobileTab('radar')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                mobileTab === 'radar'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Radar
            </button>
          </div>
        </div>

        {/* Train Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto py-1 md:py-0 scrollbar-none">
          {TRAIN_CHOICES.map((t) => {
            const isSelected = selectedTrain === t.no;
            return (
              <button
                key={t.no}
                onClick={() => setSelectedTrain(t.no)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#0F172A] text-white shadow-sm ring-2 ring-emerald-500/20 font-semibold'
                    : 'bg-white text-[#475569] hover:bg-[#F8FAFC] border border-[#E2E8F0]'
                }`}
              >
                <span>{t.no}</span>
                <span className={`text-[10px] ${isSelected ? 'text-gray-300' : 'text-[#64748B]'}`}>{t.name}</span>
                {t.priority === 'Target' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="Target Active Run" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right Controls: Safe-Boarding Toggle + Presenter Trigger */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          {/* Safe-Boarding Guardrail Toggle */}
          <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-lg border border-[#E2E8F0]">
            <button
              onClick={() => setPassengerStatus('PRE_BOARDING')}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                passengerStatus === 'PRE_BOARDING'
                  ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
              title="At Home: Safe-Boarding Guardrail locks false deboarding/bailout advice before passenger boards"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>At Home</span>
            </button>
            <button
              onClick={() => setPassengerStatus('ON_BOARD')}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                passengerStatus === 'ON_BOARD'
                  ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
              title="On Board: Enables Early-Junction NH-16 Rescue evaluation at Cuttack / Bhubaneswar"
            >
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>On Board</span>
            </button>
          </div>

          {/* Live WS Pill */}
          <div
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
              wsConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}
            />
            <span>{wsStatusText}</span>
          </div>

          {/* Presenter Drawer button */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-[#F8FAFC] text-[#1E293B] border border-[#CBD5E1] shadow-xs transition-colors"
            title="Presenter Controls (Press Shift+D)"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Presenter</span>
            <kbd className="hidden md:inline text-[9px] bg-[#F1F5F9] px-1 py-0.5 rounded text-[#64748B] font-mono border border-[#E2E8F0]">
              Shift+D
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
};
