import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';

export const LandingFooter: React.FC = () => {
  const { navigateToDashboardWithTrain } = useRailStore();
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (!aboutOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAboutOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aboutOpen]);

  const handleHomeClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <footer className="w-full bg-[#F4F7FA]/90 backdrop-blur-xs border-t border-slate-200/80 mt-8 md:mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {/* Top Row: Brand + Tagline on left, Nav Links on right */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
              <div className="flex items-center gap-2">
                <img
                  src="/logo.png"
                  alt="RAIL-PULSE logo"
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="font-mono font-bold text-sm tracking-wider text-[#0F294A]">
                  RAIL-PULSE
                </span>
              </div>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">
                |
              </span>
              <p className="text-xs text-slate-500">
                Smarter predictions. Safer connections.
              </p>
            </div>

            <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-5 text-xs sm:text-[13px] font-medium text-[#0F294A]">
              <button
                type="button"
                onClick={handleHomeClick}
                className="hover:text-orange-600 transition-colors duration-150 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => navigateToDashboardWithTrain()}
                className="hover:text-orange-600 transition-colors duration-150 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
              >
                Track Train
              </button>
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="hover:text-orange-600 transition-colors duration-150 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
              >
                About
              </button>
            </nav>
          </div>

          {/* Bottom Row: Disclaimer & Discreet Copyright */}
          <div className="mt-4 pt-3.5 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <p className="text-slate-500 leading-relaxed">
              RAIL-PULSE is an independent project. Arrival predictions are estimates and may change. Not affiliated with Indian Railways.
            </p>
            <p className="text-slate-400 whitespace-nowrap shrink-0">
              &copy; {new Date().getFullYear()} RAIL-PULSE
            </p>
          </div>
        </div>
      </footer>

      {/* Compact About Dialog */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-rail-pulse-title"
          onClick={() => setAboutOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white text-slate-800 border border-slate-200 shadow-xl p-5 sm:p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="about-rail-pulse-title"
                className="text-base font-bold text-[#0F294A]"
              >
                About RAIL-PULSE
              </h3>
              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                aria-label="Close About dialog"
                className="p-1 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              RAIL-PULSE watches surrounding corridor traffic—not just your train—to provide realistic arrival windows and timely road transfer options when a connection is tight.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
              RAIL-PULSE is an independent project. Arrival predictions are estimates and may change. Not affiliated with Indian Railways.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
