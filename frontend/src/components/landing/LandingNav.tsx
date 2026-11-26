import React, { useState, useRef, useEffect } from 'react';
import { TrainFront, Globe, ChevronDown, Check } from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS, type Lang } from './translations';

const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: 'EN', label: 'English' },
  { code: 'HI', label: 'हिन्दी' },
  { code: 'OR', label: 'ଓଡ଼ିଆ' },
];

export const LandingNav: React.FC = () => {
  const { language, setLanguage } = useRailStore();
  const t = TRANSLATIONS[language].nav;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

        {/* Right-Aligned Language Dropdown */}
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
    </nav>
  );
};
