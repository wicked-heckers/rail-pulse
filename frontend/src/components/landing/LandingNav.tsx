import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check, Clock } from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS, type Lang } from './translations';

const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: 'EN', label: 'English' },
  { code: 'HI', label: 'हिन्दी' },
  { code: 'OR', label: 'ଓଡ଼ିଆ' },
];

function formatCurrentTimeIST(date: Date): string {
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
  return formatted.toUpperCase();
}

export const LandingNav: React.FC = () => {
  const { language, setLanguage } = useRailStore();
  const t = TRANSLATIONS[language].nav;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
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
      <div className="flex items-center justify-between gap-2 h-16 px-3 sm:px-6 max-w-5xl mx-auto w-full">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-2.5 select-none min-w-0">
          <img
            src="/logo.png"
            alt="Rail-Pulse logo"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0"
          />
          <span className="truncate font-bold tracking-tight text-slate-900 text-sm sm:text-lg">
            {t.brand}
          </span>
        </div>

        {/* Right-Aligned Controls: Live IST Clock + Language Dropdown */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Live IST Clock (hidden on mobile, visible sm+) */}
          <div
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0F294A] text-white border border-slate-700/80 shadow-2xs select-none"
            title="Current Time (IST)"
          >
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-mono font-semibold text-[13px] tracking-tight tabular-nums whitespace-nowrap">
              {formatCurrentTimeIST(now)}
              <span className="text-slate-300 text-[11px] ml-1">IST</span>
            </span>
          </div>

          <div className="relative inline-block shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 text-[13px] font-semibold text-slate-800 whitespace-nowrap transition-colors cursor-pointer"
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
            <div className="absolute right-0 top-full mt-1.5 z-50 w-40 rounded-xl bg-white border border-slate-200 shadow-lg p-1">
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
                    className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors flex items-center justify-between cursor-pointer ${
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
