import React, { useEffect } from 'react';
import { useRailStore } from './stores/useRailStore';
import { wsClient } from './services/wsClient';
import { fetchForecast, evaluateRescue, fetchCorridorConfig } from './services/api';
import { TopHeader } from './components/layout/TopHeader';
import { DemoDrawer } from './components/layout/DemoDrawer';
import { CabModal } from './components/rescue/CabModal';
import { AddTrainModal } from './components/layout/AddTrainModal';
import { ArrivalConnectionCard } from './components/connection/ArrivalConnectionCard';
import { VerticalTimeline } from './components/timeline/VerticalTimeline';
import { CorridorMap } from './components/map/CorridorMap';
import { LandingPage } from './components/landing/LandingPage';
import { timeStringToMinutes } from './components/dashboard/passengerUtils';

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

  const monitoredTrain = activeSnapshot.trains?.find((t) => t.train_no === selectedTrain);
  const simBucket = Math.floor((activeSnapshot.tick_utc || 0) / 30);
  const trainPhaseKey = `${monitoredTrain?.status ?? ''}|${Math.round(
    monitoredTrain?.current_delay_mins ?? 0
  )}|${monitoredTrain?.current_station ?? ''}|${monitoredTrain?.next_station ?? ''}|${activeSnapshot.phantom_freights?.length ?? 0
    }`;

  // Initialize WebSocket stream and load initial corridor state in background
  useEffect(() => {
    wsClient.connect();
    fetchCorridorConfig().catch((err) => console.warn('Config fetch error:', err));

    return () => {
      wsClient.disconnect();
    };
  }, []);

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
          deadlineEpoch = simMidnightIst + targetMinutes * 60;
        } else if (targetStop?.sched_arr_epoch) {
          // Realistic connecting departure: +15m cushion + 15m transfer buffer after scheduled arrival
          deadlineEpoch = targetStop.sched_arr_epoch + (bufferMins + 15) * 60;
          const istDate = new Date((deadlineEpoch + 19800) * 1000);
          const hh = istDate.getUTCHours().toString().padStart(2, '0');
          const mm = istDate.getUTCMinutes().toString().padStart(2, '0');
          const autoDeadline = `${hh}:${mm}`;
          if (connectionTarget?.deadline_time !== autoDeadline) {
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
    connectionTarget?.deadline_time,
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

  // Screen 2: Real-Time Corridor Analytics & Digital Twin Dashboard (Auto-Expanding Sidebar + Sticky Map)
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F172A] flex flex-col font-sans">
      {/* Top Application Header (Sticky 52px Bar) */}
      <TopHeader />

      {/* Main Responsive Layout */}
      <main className="flex flex-col md:flex-row flex-1 items-stretch md:items-start w-full max-w-[1600px] mx-auto">
        {/* Sidebar Container (order-2 on mobile, order-1 on desktop) */}
        <div className="w-full md:w-[38%] md:min-w-[380px] md:max-w-[460px] order-2 md:order-1 shrink-0 p-3 flex flex-col gap-3">
          {/* Section 1: Train Identity + Arrival & Connection Summary */}
          <ArrivalConnectionCard />

          {/* Sections 2, 3: Journey Details & Delay Causes */}
          <VerticalTimeline />
        </div>

        {/* Map Container (order-1 on mobile, order-2 on desktop) */}
        <div className="order-1 md:order-2 w-full h-[38vh] min-h-[260px] md:sticky md:top-[52px] md:h-[calc(100vh-52px)] md:flex-1 p-3 md:pl-0 overflow-hidden">
          <CorridorMap />
        </div>
      </main>

      {/* Floating Modals and Presenter Drawers */}
      <CabModal />
      <AddTrainModal />
      <DemoDrawer />
    </div>
  );
};
