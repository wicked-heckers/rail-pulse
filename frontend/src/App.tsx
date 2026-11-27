import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { useRailStore } from './stores/useRailStore';
import { wsClient } from './services/wsClient';
import { fetchForecast, evaluateRescue, fetchCorridorConfig, fetchCorridorState } from './services/api';
import { TopHeader } from './components/layout/TopHeader';
import { DemoDrawer } from './components/layout/DemoDrawer';
import { CabModal } from './components/rescue/CabModal';
import { ArrivalConnectionCard } from './components/connection/ArrivalConnectionCard';
import { VerticalTimeline } from './components/timeline/VerticalTimeline';
import { LandingPage } from './components/landing/LandingPage';
import { timeStringToMinutes } from './components/dashboard/passengerUtils';
import { ArrowLeft, Map } from 'lucide-react';

const CorridorMap = lazy(() =>
  import('./components/map/CorridorMap').then((m) => ({ default: m.CorridorMap }))
);

const MapSkeleton = () => (
  <div className="w-full h-full min-h-[500px] rounded-2xl bg-slate-100 animate-pulse border border-slate-200 flex items-center justify-center">
    <div className="flex items-center gap-2 text-slate-400 font-mono text-xs">
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
      <span>Loading Corridor Map...</span>
    </div>
  </div>
);

export const App: React.FC = () => {
  const {
    currentView,
    selectedTrain,
    activeSnapshot,
    passengerStatus,
    connectionTarget,
    refreshNonce,
    setConnectionTarget,
    setForecast,
    setRescue,
  } = useRailStore();

  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const lastAutoDeadlineRef = useRef<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close full-screen mobile map on Escape key
  useEffect(() => {
    if (!mobileMapOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMapOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMapOpen]);

  const monitoredTrain = activeSnapshot.trains?.find((t) => t.train_no === selectedTrain);
  const simBucket = Math.floor((activeSnapshot.tick_utc || 0) / 30);
  const trainPhaseKey = `${monitoredTrain?.status ?? ''}|${Math.round(
    monitoredTrain?.current_delay_mins ?? 0
  )}|${monitoredTrain?.current_station ?? ''}|${monitoredTrain?.next_station ?? ''}|${activeSnapshot.phantom_freights?.length ?? 0
    }`;

  // Initialize WebSocket stream and HTTP state fallback poller
  useEffect(() => {
    let cancelled = false;
    wsClient.connect();
    fetchCorridorConfig().catch((err) => console.warn('Config fetch error:', err));

    const pollIfWsOffline = async () => {
      if (wsClient.isLiveConnected()) return;
      const snap = await fetchCorridorState();
      if (!cancelled && snap) {
        useRailStore.getState().updateSnapshot(snap);
      }
    };

    pollIfWsOffline();
    const pollInterval = window.setInterval(pollIfWsOffline, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
      wsClient.disconnect();
    };
  }, []);

  const customDeadlineDep = connectionTarget?.isCustom ? connectionTarget.deadline_time : null;

  // Fetch forecast and rescue whenever train, boarding status, connection target, or demo state changes
  useEffect(() => {
    let isMounted = true;

    const loadForecastAndRescue = async () => {
      try {
        const fc = await fetchForecast(selectedTrain);
        if (!isMounted) return;
        setForecast(fc);

        const preferredCode = connectionTarget?.station_code || 'BBS';
        const targetStop =
          fc.station_timeline?.find((s) => s.station_code === preferredCode) ??
          fc.station_timeline?.[fc.station_timeline.length - 1];
        const destCode = targetStop?.station_code ?? preferredCode;
        const bufferMins = connectionTarget?.transfer_buffer_mins ?? 15;

        let deadlineEpoch: number;
        const baseTick = activeSnapshot.tick_utc || 1795067700;
        const simMidnightIst = Math.floor((baseTick + 19800) / 86400) * 86400 - 19800;
        if (connectionTarget?.isCustom && connectionTarget.deadline_time) {
          const targetMinutes = timeStringToMinutes(connectionTarget.deadline_time) ?? 735;
          let computed = simMidnightIst + targetMinutes * 60;
          if (targetStop?.sched_arr_epoch && computed < targetStop.sched_arr_epoch - 3600) {
            computed += 86400;
          }
          deadlineEpoch = computed;
        } else if (targetStop?.sched_arr_epoch) {
          // Realistic connecting departure: +15m cushion + 15m transfer buffer after scheduled arrival
          deadlineEpoch = targetStop.sched_arr_epoch + (bufferMins + 15) * 60;
          const istDate = new Date((deadlineEpoch + 19800) * 1000);
          const hh = istDate.getUTCHours().toString().padStart(2, '0');
          const mm = istDate.getUTCMinutes().toString().padStart(2, '0');
          const autoDeadline = `${hh}:${mm}`;
          if (
            connectionTarget?.deadline_time !== autoDeadline &&
            lastAutoDeadlineRef.current !== autoDeadline
          ) {
            lastAutoDeadlineRef.current = autoDeadline;
            setConnectionTarget({ deadline_time: autoDeadline, isCustom: false });
          }
        } else {
          const targetMinutes = timeStringToMinutes(connectionTarget?.deadline_time || '12:15') ?? 735;
          deadlineEpoch = simMidnightIst + targetMinutes * 60;
        }
        const res = await evaluateRescue({
          train_no: selectedTrain,
          destination_code: destCode,
          connection_deadline_utc: deadlineEpoch,
          transfer_buffer_mins: bufferMins,
          passenger_status: passengerStatus,
        });
        if (isMounted) setRescue(res);
      } catch (err) {
        console.warn('Forecast/Rescue fetch error:', err);
      }
    };

    loadForecastAndRescue();

    return () => {
      isMounted = false;
    };
  }, [
    selectedTrain,
    passengerStatus,
    connectionTarget?.station_code,
    customDeadlineDep,
    connectionTarget?.isCustom,
    connectionTarget?.transfer_buffer_mins,
    refreshNonce,
    simBucket,
    trainPhaseKey,
    setConnectionTarget,
    setForecast,
    setRescue,
  ]);

  // Screen 1: User first sees clean modern landing page
  if (currentView === 'landing') {
    return <LandingPage />;
  }

  // Screen 2: Real-Time Corridor Analytics & Digital Twin Dashboard (Locked Viewport, Internal Sidebar Scroll)
  return (
    <div className="h-screen overflow-hidden bg-[#FAF9F6] text-[#0F172A] flex flex-col font-sans">
      {/* Top Application Header (Fixed 56px Bar) */}
      <TopHeader />

      {/* Main Two-Column Layout */}
      <main className="flex flex-1 min-h-0 w-full max-w-[1600px] mx-auto flex-col md:flex-row overflow-hidden">
        {/* Left Column / Dashboard Cards (Internal scroll, full width on mobile, 40% on desktop) */}
        <div className="w-full md:w-[40%] h-full overflow-y-auto shrink-0 px-3 py-3 flex flex-col gap-3">
          {/* Section 1: Train Identity + Arrival & Connection Summary */}
          <ArrivalConnectionCard />

          {/* Sections 2, 3: Journey Details & Delay Causes */}
          <VerticalTimeline />
        </div>

        {/* Right Map Container (60% width, desktop only full-height viewport) */}
        <div className="hidden md:block md:w-[60%] h-full p-3 md:pl-0 overflow-hidden">
          {isDesktop && (
            <Suspense fallback={<MapSkeleton />}>
              <CorridorMap />
            </Suspense>
          )}
        </div>
      </main>

      {/* Floating Bottom-Right Map Button (Mobile < md) */}
      <button
        type="button"
        onClick={() => setMobileMapOpen(true)}
        className="md:hidden fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white font-semibold text-xs shadow-xl hover:bg-slate-800 active:scale-95 transition-all cursor-pointer border border-slate-700/80 backdrop-blur-xs"
        title="Open Live Corridor Map"
        aria-label="Open Live Corridor Map"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <Map className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Map</span>
      </button>

      {/* Full-Screen Mobile Map Modal */}
      {mobileMapOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col md:hidden">
          {/* Header Bar */}
          <div className="h-[52px] px-3 flex items-center justify-between gap-2.5 bg-white border-b border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMapOpen(false)}
              className="whitespace-nowrap shrink-0 h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden">Back</span>
              <span className="hidden sm:inline">Back to Journey</span>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-100 text-xs font-bold text-slate-800 font-mono">
                {selectedTrain}
              </span>
              <span className="truncate text-xs font-semibold text-slate-700">
                {monitoredTrain?.train_name || 'Corridor Train'}
              </span>
            </div>
          </div>

          {/* Map Container */}
          <div className="flex-1 relative w-full h-full">
            <Suspense fallback={<MapSkeleton />}>
              <CorridorMap isModal={true} />
            </Suspense>
          </div>
        </div>
      )}

      {/* Floating Modals and Presenter Drawers */}
      <CabModal />
      <DemoDrawer />
    </div>
  );
};
