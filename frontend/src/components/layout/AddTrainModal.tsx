import React, { useState, useEffect } from 'react';
import { useManagerTrainStore, type ManagerTrain } from '../../stores/useManagerTrainStore';
import { X, Train, Plus, Sparkles, AlertCircle } from 'lucide-react';

interface PresetTrain {
  no: string;
  name: string;
  priority: ManagerTrain['priority'];
  direction: ManagerTrain['direction'];
  from: string;
  to: string;
  currentStation: string;
  currentDelayMins: number;
}

const PRESETS: PresetTrain[] = [
  {
    no: '12073',
    name: 'Jan Shatabdi Express',
    priority: 'Superfast',
    direction: 'DN',
    from: 'HWH',
    to: 'BBS',
    currentStation: 'JJKR',
    currentDelayMins: 14,
  },
  {
    no: '12801',
    name: 'Purushottam Express',
    priority: 'Superfast',
    direction: 'UP',
    from: 'PURI',
    to: 'NDLS',
    currentStation: 'CTC',
    currentDelayMins: 0,
  },
  {
    no: '18418',
    name: 'Puri - Gunupur Express',
    priority: 'Express',
    direction: 'DN',
    from: 'PURI',
    to: 'GNPR',
    currentStation: 'KUR',
    currentDelayMins: 8,
  },
  {
    no: '20836',
    name: 'Vande Bharat Express',
    priority: 'Superfast',
    direction: 'UP',
    from: 'PURI',
    to: 'ROU',
    currentStation: 'BBS',
    currentDelayMins: 3,
  },
];

const STATIONS = [
  { code: 'BHC', name: 'Bhadrak (0 km)' },
  { code: 'JJKR', name: 'Jajpur Keonjhar Rd (44 km)' },
  { code: 'JKPR', name: 'Jakhapura Junction (51 km)' },
  { code: 'NRG', name: 'Nergundi Junction (106 km)' },
  { code: 'CTC', name: 'Cuttack Junction (115 km)' },
  { code: 'BRAG', name: 'Barang Junction (128 km)' },
  { code: 'BBS', name: 'Bhubaneswar (143 km)' },
  { code: 'KUR', name: 'Khurda Road (162 km)' },
  { code: 'PURI', name: 'Puri Terminal (206 km)' },
];

export const AddTrainModal: React.FC = () => {
  const { isAddModalOpen, setAddModalOpen, addTrain } = useManagerTrainStore();

  const [no, setNo] = useState('');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<ManagerTrain['priority']>('Superfast');
  const [direction, setDirection] = useState<ManagerTrain['direction']>('DN');
  const [from, setFrom] = useState('HWH');
  const [to, setTo] = useState('PURI');
  const [currentStation, setCurrentStation] = useState('JJKR');
  const [currentDelayMins, setCurrentDelayMins] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Close modal on Escape
  useEffect(() => {
    if (!isAddModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, setAddModalOpen]);

  if (!isAddModalOpen) return null;

  const handleApplyPreset = (p: PresetTrain) => {
    setNo(p.no);
    setName(p.name);
    setPriority(p.priority);
    setDirection(p.direction);
    setFrom(p.from);
    setTo(p.to);
    setCurrentStation(p.currentStation);
    setCurrentDelayMins(p.currentDelayMins);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNo = no.trim();
    const cleanName = name.trim();

    if (!cleanNo) {
      setError('Please provide a valid train number (e.g. 12073).');
      return;
    }
    if (['12821', '22895', '18410'].includes(cleanNo)) {
      setError(`Train ${cleanNo} is a protected core corridor service and cannot be overwritten.`);
      return;
    }
    if (!cleanName) {
      setError('Please provide a train name (e.g. Jan Shatabdi Express).');
      return;
    }

    addTrain({
      no: cleanNo,
      name: cleanName,
      priority,
      direction,
      from: from.trim().toUpperCase() || 'HWH',
      to: to.trim().toUpperCase() || 'PURI',
      currentStation,
      currentDelayMins: Number(currentDelayMins) || 0,
    });

    // Reset fields
    setNo('');
    setName('');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#0F294A] text-white shadow-2xs">
              <Train className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#0F294A]">Add Train to Corridor</h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold border border-blue-200">
                  Manager Only
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Dispatch and monitor extra train services in live dashboard
              </p>
            </div>
          </div>
          <button
            onClick={() => setAddModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick 1-click Presets */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Quick Presets (Corridor Express Services):</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.no}
                  onClick={() => handleApplyPreset(p)}
                  className="text-left px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#0F294A] hover:shadow-2xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-[#0F294A] group-hover:text-blue-700">
                      {p.no}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {p.direction}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 truncate font-medium">
                    {p.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            {/* Train Number & Name */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Train No. <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12073"
                  value={no}
                  onChange={(e) => setNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A]"
                  maxLength={6}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Train Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jan Shatabdi Express"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A]"
                />
              </div>
            </div>

            {/* Priority & Direction */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Class / Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ManagerTrain['priority'])}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A]"
                >
                  <option value="Target">Target (High Priority Focus)</option>
                  <option value="Superfast">Superfast (Vande Bharat / SF)</option>
                  <option value="Express">Express (Mail / Express)</option>
                  <option value="Passenger">Passenger (Local / MEMU)</option>
                  <option value="Special">Special (Holiday / Exam Spl)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Line Direction
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setDirection('DN')}
                    className={`py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      direction === 'DN'
                        ? 'bg-white text-[#0F294A] font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    DN (to PURI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('UP')}
                    className={`py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      direction === 'UP'
                        ? 'bg-white text-[#0F294A] font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    UP (to HWH)
                  </button>
                </div>
              </div>
            </div>

            {/* Origin & Destination */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  From (Origin)
                </label>
                <input
                  type="text"
                  placeholder="HWH"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  To (Destination)
                </label>
                <input
                  type="text"
                  placeholder="PURI"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A]"
                />
              </div>
            </div>

            {/* Active Station & Initial Delay */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Corridor Position
                </label>
                <select
                  value={currentStation}
                  onChange={(e) => setCurrentStation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A]"
                >
                  {STATIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Delay (mins)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={360}
                    value={currentDelayMins}
                    onChange={(e) => setCurrentDelayMins(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A]"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {[0, 15, 30].map((d) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => setCurrentDelayMins(d)}
                        className="px-2 py-1 text-xs font-mono rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                      >
                        +{d}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#0F294A] hover:bg-[#1A3F6D] text-white shadow-2xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add & Monitor Train</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
