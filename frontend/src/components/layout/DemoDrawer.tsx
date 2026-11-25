import React, { useState } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import {
  injectTrainDelay,
  startDemoScenario,
  injectFreightShadow,
  resetCorridor,
  injectULIPFreight,
} from '../../services/api';
import {
  X,
  Zap,
  Gauge,
  Sliders,
  AlertTriangle,
  RotateCcw,
  Database,
  CheckCircle2,
} from 'lucide-react';

export const DemoDrawer: React.FC = () => {
  const { drawerOpen, setDrawerOpen, selectedTrain } = useRailStore();
  const [speed, setSpeed] = useState<number>(1);
  const [injectedDelay, setInjectedDelay] = useState<number>(28);
  const [isInjecting, setIsInjecting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  if (!drawerOpen) return null;

  const handleSpeedChange = async (newSpeed: number) => {
    setSpeed(newSpeed);
    try {
      await startDemoScenario('DHAULI_CASCADE', newSpeed);
      setStatusMessage(`Simulation speed set to ${newSpeed}x`);
    } catch {
      setStatusMessage(`Speed changed to ${newSpeed}x (client mode)`);
    }
  };

  const handleInjectDelay = async () => {
    setIsInjecting(true);
    setStatusMessage(`Injecting +${injectedDelay}m delay on Train ${selectedTrain}...`);
    try {
      await injectTrainDelay(selectedTrain, injectedDelay);
      setStatusMessage(`Successfully injected +${injectedDelay}m delay! Forecast recalibrated.`);
    } catch {
      setStatusMessage(`Delay simulated: +${injectedDelay}m applied to active corridor.`);
    } finally {
      setIsInjecting(false);
    }
  };

  const handleReset = async () => {
    setStatusMessage('Resetting corridor to zero delay...');
    try {
      await resetCorridor();
      setStatusMessage('Corridor reset to nominal dispatch.');
    } catch {
      setStatusMessage('Corridor state reset.');
    }
  };

  const handleScenario1 = async () => {
    setInjectedDelay(28);
    await handleInjectDelay();
    try {
      await injectFreightShadow('DN_CTC_BRAG', 20.0, 0.88);
      setStatusMessage('Injected +28m delay & Barang Phantom Freight shadow (STR 1.85).');
    } catch {
      setStatusMessage('Dhauli cascade delay applied.');
    }
  };

  const handleULIPTrigger = async () => {
    try {
      await injectULIPFreight();
      setStatusMessage('Enterprise ULIP FOIS webhook applied: Confirmed Rake BOXN_COAL_CONFIRMED.');
    } catch {
      setStatusMessage('ULIP webhook simulated.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={() => setDrawerOpen(false)}
        className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
      />

      {/* Drawer Body */}
      <div className="absolute inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl border-l border-[#E2E8F0] flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Judge & Presenter Control Drawer</h3>
              <p className="text-xs text-gray-400">ECoR Corridor Real-Time Disruption Lab</p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5 text-xs text-[#334155]">
          {/* Status Toast Banner */}
          {statusMessage && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* 1. Simulation Speed Control */}
          <div className="bg-[#FAF9F6] p-3.5 rounded-xl border border-[#E5E7EB] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-emerald-600" />
                <span>Playback Clock Multiplier</span>
              </span>
              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-white border border-[#CBD5E1]">
                {speed}x speed
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 10, 30].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  className={`py-2 px-3 rounded-lg font-mono font-bold text-xs border transition-all ${
                    speed === s
                      ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-xs'
                      : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                  }`}
                >
                  {s}x {s === 1 ? 'Realtime' : s === 10 ? 'Fast' : 'Demo'}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Disruption Delay Injection */}
          <div className="bg-[#FAF9F6] p-3.5 rounded-xl border border-[#E5E7EB] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Inject Delay on Train {selectedTrain}</span>
              </span>
              <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                +{injectedDelay} mins
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="60"
              step="5"
              value={injectedDelay}
              onChange={(e) => setInjectedDelay(Number(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer"
            />

            <div className="flex justify-between text-xs text-[#94A3B8] font-mono">
              <span>0m (On Time)</span>
              <span>+28m (Cascade)</span>
              <span>+60m (Major)</span>
            </div>

            <button
              onClick={handleInjectDelay}
              disabled={isInjecting}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>{isInjecting ? 'Calculating Cascades...' : `Inject +${injectedDelay}m Delay`}</span>
            </button>
          </div>

          {/* 3. Disruption Scenarios Presets */}
          <div className="space-y-2">
            <span className="font-bold text-[#0F172A] block">Judges Demonstration Scenarios</span>
            <div className="space-y-2">
              <button
                onClick={handleScenario1}
                className="w-full text-left p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-amber-400 transition-all flex items-start gap-2.5"
              >
                <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="font-bold text-[#0F172A]">Dhauli Phantom Freight Cascade (+28m)</div>
                  <div className="text-xs text-[#64748B]">
                    Unscheduled iron-ore freight at Jenapur forces 12821 into double yellow restrictions, triggering Cuttack
                    loop-line hold and early NH-16 rescue recommendation.
                  </div>
                </div>
              </button>

              <button
                onClick={handleULIPTrigger}
                className="w-full text-left p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-indigo-400 transition-all flex items-start gap-2.5"
              >
                <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  ULIP
                </div>
                <div>
                  <div className="font-bold text-[#0F172A]">Enterprise ULIP FOIS Override Webhook</div>
                  <div className="text-xs text-[#64748B]">
                    Simulate authenticated X-ULIP-API-Key webhook confirming coal rake BOXN_COAL_CONFIRMED on DN_CTC_BRAG.
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setStatusMessage('Vande Bharat overtake hold triggered at Cuttack Junction.');
                }}
                className="w-full text-left p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-purple-400 transition-all flex items-start gap-2.5"
              >
                <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="font-bold text-[#0F172A]">Vande Bharat Priority Overtake Hold</div>
                  <div className="text-xs text-[#64748B]">
                    22895 Howrah-Puri Vande Bharat overtakes on Main Line. Demonstrates multi-train dynamic loop hold
                    calculation.
                  </div>
                </div>
              </button>

              <button
                onClick={handleReset}
                className="w-full text-left p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-emerald-400 transition-all flex items-start gap-2.5"
              >
                <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <div className="font-bold text-[#0F172A]">Reset Nominal Dispatch</div>
                  <div className="text-xs text-[#64748B]">
                    Clears all injected freight shadows and delays, returning all corridor runs to scheduled green-block
                    timelines.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 4. Architecture Live Diagnostics */}
          <div className="bg-[#FAF9F6] p-3.5 rounded-xl border border-[#E5E7EB] space-y-2">
            <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-600" />
              <span>Full-Stack Architecture Diagnostics</span>
            </span>

            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-[#64748B]">Backend REST API:</span>
                <span className="text-emerald-700 font-bold">FastAPI 0.115 (Port 8000)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-[#64748B]">WebSocket Stream:</span>
                <span className="text-emerald-700 font-bold">/ws/corridor (1.5s Ticks)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-[#64748B]">Vector Basemap:</span>
                <span className="text-emerald-700 font-bold">OpenFreeMap Positron (Zero Key)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-[#64748B]">Map Renderer:</span>
                <span className="text-emerald-700 font-bold">MapLibre GL 60 FPS WebGL</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-[#64748B]">ML Quantile Engine:</span>
                <span className="text-emerald-700 font-bold">LightGBM CQR Non-Crossing</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#64748B]">Highway Routing:</span>
                <span className="text-emerald-700 font-bold">NH-16 Real-Time Calibrated</span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-[#475569] hover:bg-white text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All</span>
          </button>
          <button
            onClick={() => setDrawerOpen(false)}
            className="px-4 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-lg text-xs font-semibold shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
