import React, { useState, useRef, useEffect } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { useManagerTrainStore, type ManagerTrain } from '../../stores/useManagerTrainStore';
import {
  Train,
  ChevronDown,
  Plus,
  Check,
  Trash2,
  Search,
  Compass,
} from 'lucide-react';

export const TrainDropdown: React.FC = () => {
  const { selectedTrain, setSelectedTrain } = useRailStore();
  const { trains, setAddModalOpen, removeTrain } = useManagerTrainStore();

  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Find currently active train details
  const activeTrain = trains.find((t) => t.no === selectedTrain) || {
    no: selectedTrain,
    name: 'Selected Train',
    priority: 'Target',
    direction: 'DN',
    from: 'HWH',
    to: 'PURI',
  };

  const filteredTrains = trains.filter(
    (t) =>
      t.no.includes(filterQuery) ||
      t.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const getPriorityBadge = (priority: ManagerTrain['priority']) => {
    switch (priority) {
      case 'Target':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Target
          </span>
        );
      case 'Superfast':
        return (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            Superfast
          </span>
        );
      case 'Express':
        return (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Express
          </span>
        );
      default:
        return (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {priority}
          </span>
        );
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? 'bg-slate-100 border-[#0F294A] ring-2 ring-[#0F294A]/10'
            : 'bg-white hover:bg-slate-50 border-slate-200/90 text-slate-800'
        }`}
        title="Select active monitored train"
      >
        <div className="p-1 rounded-md bg-[#0F294A]/5 text-[#0F294A]">
          <Train className="w-4 h-4" />
        </div>

        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="font-extrabold text-[#0F294A]">{activeTrain.no}</span>
          <span className="text-slate-600 font-sans font-medium hidden sm:inline truncate max-w-[140px]">
            {activeTrain.name}
          </span>
        </div>

        {activeTrain.priority === 'Target' && (
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse hidden sm:inline-block" />
        )}

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-slate-700' : ''
          }`}
        />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-0 md:left-0 md:right-auto w-84 sm:w-92 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="px-4 pb-2.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Corridor Train Fleet
              </span>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {trains.length} services
            </span>
          </div>

          {/* Search filter if more than 3 trains */}
          {trains.length > 3 && (
            <div className="px-3.5 pt-2.5 pb-1">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by train no or name..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0F294A]"
                />
              </div>
            </div>
          )}

          {/* Train List */}
          <div className="max-h-72 overflow-y-auto px-2 py-1.5 space-y-1">
            {filteredTrains.length === 0 ? (
              <div className="py-5 text-center text-sm text-slate-400">
                No matching trains found.
              </div>
            ) : (
              filteredTrains.map((t) => {
                const isSelected = selectedTrain === t.no;
                return (
                  <div
                    key={t.no}
                    onClick={() => {
                      setSelectedTrain(t.no);
                      setIsOpen(false);
                    }}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0F294A]/5 border border-[#0F294A]/20 shadow-2xs'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-mono font-bold ${
                          isSelected
                            ? 'bg-[#0F294A] text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                        }`}
                      >
                        {isSelected ? <Check className="w-4 h-4" /> : t.direction}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">
                            {t.no}
                          </span>
                          <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                            {t.name}
                          </span>
                          {t.isCustom && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-mono font-bold">
                              Added
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                          <span>{t.from || 'HWH'} → {t.to || 'PURI'}</span>
                          <span>•</span>
                          <span>{t.direction === 'DN' ? 'Down Line' : 'Up Line'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {getPriorityBadge(t.priority)}

                      {/* Delete button for manager-added trains */}
                      {t.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTrain(t.no);
                          }}
                          className="p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remove custom train"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Manager Action Footer */}
          <div className="mt-1.5 pt-2.5 px-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setAddModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-bold text-[#0F294A] bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/80 transition-colors cursor-pointer group"
            >
              <div className="p-0.5 rounded bg-blue-600 text-white group-hover:scale-105 transition-transform">
                <Plus className="w-3.5 h-3.5" />
              </div>
              <span>Add Train (Manager Team)</span>
            </button>
            <p className="text-xs text-center text-slate-400 mt-1.5">
              Managers can inject extra services to simulate dispatch
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
