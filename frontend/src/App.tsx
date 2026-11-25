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
    passengerStatus,
    mobileTab,
    connectionTarget,
    setForecast,
    setRescue,
  } = useRailStore();

  // Initialize WebSocket stream and load initial corridor state in background
  useEffect(() => {
    wsClient.connect();
    fetchCorridorConfig().catch((err) => console.warn('Config fetch error:', err));

    return () => {
      wsClient.disconnect();
    };
  }, []);

  // Fetch forecast and rescue whenever selected train, boarding status, or connection target changes
  useEffect(() => {
    let isMounted = true;

    // Load forecast
    fetchForecast(selectedTrain)
      .then((fc) => {
        if (isMounted) setForecast(fc);
      })
      .catch((err) => console.warn('Forecast error:', err));

    // Calculate deadline epoch aligned with simulation day timeline
    const targetMinutes =
      timeStringToMinutes(connectionTarget?.deadline_time || '12:15') ?? 735;
    const SIMULATION_BASE_MIDNIGHT = 1795034100;
    const deadlineEpoch = SIMULATION_BASE_MIDNIGHT + targetMinutes * 60;

    // Load rescue evaluation
    evaluateRescue({
      train_no: selectedTrain,
      destination_code: connectionTarget?.station_code || 'BBS',
      connection_deadline_utc: deadlineEpoch,
      transfer_buffer_mins: connectionTarget?.transfer_buffer_mins ?? 15,
      passenger_status: passengerStatus,
    })
      .then((res) => {
        if (isMounted) setRescue(res);
      })
      .catch((err) => console.warn('Rescue evaluation error:', err));

    return () => {
      isMounted = false;
    };
  }, [selectedTrain, passengerStatus, connectionTarget, setForecast, setRescue]);

  // Screen 1: User first sees clean modern landing page
  if (currentView === 'landing') {
    return <LandingPage />;
  }

  // Screen 2: Real-Time Corridor Analytics & Digital Twin Dashboard (Auto-Expanding Sidebar + Sticky Map)
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F172A] flex flex-col font-sans">
      {/* Top Application Header (Sticky 52px Bar) */}
      <TopHeader />

      {/* Main Two-Column Layout */}
      <main className="flex flex-1 items-start w-full max-w-[1600px] mx-auto flex-col lg:flex-row">
        {/* Left Sidebar Container (40% width, auto-expanding) */}
        <div
          className={`w-full lg:w-[40%] shrink-0 p-3 flex flex-col gap-3 ${
            mobileTab === 'radar' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Section 1: Train Identity + Arrival & Connection Summary */}
          <ArrivalConnectionCard />

          {/* Sections 2, 3: Journey Details & Delay Causes */}
          <VerticalTimeline />
        </div>

        {/* Right Map Container (60% width, sticky full-height viewport) */}
        <div
          className={`w-full lg:w-[60%] sticky top-[52px] h-[calc(100vh-52px)] p-3 lg:pl-0 overflow-hidden ${
            mobileTab === 'timeline' ? 'hidden lg:block' : 'block'
          }`}
        >
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
