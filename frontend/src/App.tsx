import React, { useEffect } from 'react';
import { useRailStore } from './stores/useRailStore';
import { wsClient } from './services/wsClient';
import { fetchForecast, evaluateRescue, fetchCorridorConfig } from './services/api';
import { TopHeader } from './components/layout/TopHeader';
import { DemoDrawer } from './components/layout/DemoDrawer';
import { RescueBanner } from './components/rescue/RescueBanner';
import { CabModal } from './components/rescue/CabModal';
import { ConnectionGuard } from './components/rescue/ConnectionGuard';
import { EtaRangeBar } from './components/timeline/EtaRangeBar';
import { VerticalTimeline } from './components/timeline/VerticalTimeline';
import { CorridorMap } from './components/map/CorridorMap';

export const App: React.FC = () => {
  const {
    selectedTrain,
    passengerStatus,
    mobileTab,
    setForecast,
    setRescue,
  } = useRailStore();

  // Initialize WebSocket stream and load initial corridor state
  useEffect(() => {
    wsClient.connect();
    fetchCorridorConfig().catch((err) => console.warn('Config fetch error:', err));

    return () => {
      wsClient.disconnect();
    };
  }, []);

  // Fetch forecast and rescue whenever selected train or boarding status changes
  useEffect(() => {
    let isMounted = true;

    // Load forecast
    fetchForecast(selectedTrain)
      .then((fc) => {
        if (isMounted) setForecast(fc);
      })
      .catch((err) => console.warn('Forecast error:', err));

    // Load rescue evaluation
    evaluateRescue({
      train_no: selectedTrain,
      destination_code: 'BBS',
      connection_deadline_utc: Math.floor(Date.now() / 1000) + 3600,
      transfer_buffer_mins: 15,
      passenger_status: passengerStatus,
    })
      .then((res) => {
        if (isMounted) setRescue(res);
      })
      .catch((err) => console.warn('Rescue evaluation error:', err));

    return () => {
      isMounted = false;
    };
  }, [selectedTrain, passengerStatus, setForecast, setRescue]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F172A] flex flex-col font-sans">
      {/* Top Application Header */}
      <TopHeader />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden max-w-[1600px] w-full mx-auto">
        {/* Left Story Pane: Where Is My Train Vertical Timeline & Predictive Cards */}
        <div
          className={`w-full lg:w-[480px] xl:w-[540px] shrink-0 p-4 space-y-4 overflow-y-auto lg:h-[calc(100vh-61px)] ${
            mobileTab === 'radar' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Rescue Advisory / Safe-Boarding Lock */}
          <RescueBanner />

          {/* Probabilistic ETA Range Bar with Connection Cutoff Pin */}
          <EtaRangeBar />

          {/* Connection Survival Probability Gauge */}
          <ConnectionGuard />

          {/* Vertical Stop-by-Stop Timeline */}
          <VerticalTimeline />
        </div>

        {/* Right Digital Twin Pane: MapLibre GL 60 FPS WebGL Radar */}
        <div
          className={`flex-1 p-4 lg:pl-0 h-[calc(100vh-61px)] min-h-[500px] ${
            mobileTab === 'timeline' ? 'hidden lg:block' : 'block'
          }`}
        >
          <CorridorMap />
        </div>
      </main>

      {/* Floating Modals and Presenter Drawers */}
      <CabModal />
      <DemoDrawer />
    </div>
  );
};
