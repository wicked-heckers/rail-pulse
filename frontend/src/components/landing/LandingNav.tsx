import React, { useState, useRef, useEffect } from 'react';
import { TrainFront, Globe, ChevronDown, Check, Clock } from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS, type Lang } from './translations';

const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: 'EN', label: 'English' },
  { code: 'HI', label: 'हिन्दी' },
  { code: 'OR', label: 'ଓଡ଼ିଆ' },
];

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

export const LandingNav: React.FC = () => {
  const { language, setLanguage, activeSnapshot } = useRailStore();
  const t = TRANSLATIONS[language].nav;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const simSpeed = activeSnapshot.speed_multiplier || 1;
  const clockAnchorRef = useRef<{ tickUtc: number; syncedAtMs: number; speed: number }>({
    tickUtc: activeSnapshot.tick_utc || 1795067700,
    syncedAtMs: Date.now(),
    speed: simSpeed,
  });
  const [displayEpoch, setDisplayEpoch] = useState<number>(
    activeSnapshot.tick_utc || 1795067700
  );

  useEffect(() => {
    const tick = activeSnapshot.tick_utc || 1795067700;
    clockAnchorRef.current = {
      tickUtc: tick,
      syncedAtMs: Date.now(),
      speed: activeSnapshot.speed_multiplier || 1,
    };
    setDisplayEpoch(tick);
  }, [activeSnapshot.tick_utc, activeSnapshot.speed_multiplier]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const { tickUtc, syncedAtMs, speed } = clockAnchorRef.current;
      const elapsedSec = (Date.now() - syncedAtMs) / 1000;
      setDisplayEpoch(tickUtc + elapsedSec * speed);
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const activeLangLabel =
    LANG_OPTIONS.find((opt) => opt.code === language)?.label ?? 'English';

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-white/95 border-b border-slate-200 shadow-2xs">
      <div className="flex items-center justify-between h-14 px-4 sm:px-6 max-w-5xl mx-auto w-full">
        {/* Brand */}
        <div className="flex items-center gap-2.5 select-none shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#0F294A] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <TrainFront className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="whitespace-nowrap shrink-0 font-bold tracking-tight text-slate-900 text-base sm:text-lg">
            {t.brand}
          </span>
        </div>

        {/* Right-Aligned Controls: Live IST Clock + Language Dropdown */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Live Corridor Simulation Clock */}
          <div
            className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#0F294A] text-white border border-slate-700/80 shadow-2xs select-none"
            title="Live Corridor Simulation Clock (IST)"
          >
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-mono font-semibold text-xs tracking-tight tabular-nums whitespace-nowrap">
              {formatEpochClockIST(displayEpoch)}
              <span className="hidden sm:inline text-slate-300 text-[10px] ml-1">IST</span>
            </span>
          </div>

          <div className="relative inline-block shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors cursor-pointer"
            aria-expanded={menuOpen}
            aria-label="Select language"
          >
            <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>{activeLangLabel}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-50 w-40 rounded-xl bg-white border border-slate-200 shadow-lg p-1 animate-in fade-in zoom-in-95 duration-100">
              {LANG_OPTIONS.map((opt) => {
                const isActive = language === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      setLanguage(opt.code);
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      isActive
                        ? 'bg-slate-100 text-slate-900 font-semibold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-[#0F294A] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>
    </nav>
  );
};
