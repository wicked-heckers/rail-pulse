import React, { useState, useEffect } from 'react';
import { Compass, ArrowUpRight, X } from 'lucide-react';
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
      <footer className="w-full bg-[#0F294A] text-white border-t border-slate-800/80 mt-10 md:mt-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {/* Upper Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Brand & Tagline */}
            <div className="md:col-span-5 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white p-1 flex items-center justify-center shrink-0">
                  <img
                    src="/logo.png"
                    alt="RAIL-PULSE logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="font-mono font-bold text-base tracking-wider text-white">
                  RAIL-PULSE
                </span>
              </div>
              <p className="text-sm text-slate-300 font-medium">
                Smarter predictions. Safer connections.
              </p>
            </div>

            {/* Navigation Links */}
            <nav
              aria-label="Footer navigation"
              className="md:col-span-4 flex flex-col gap-2"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-orange-400">
                Navigation
              </span>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-200">
                <li>
                  <button
                    type="button"
                    onClick={handleHomeClick}
                    className="hover:text-orange-300 transition-colors duration-200 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
                  >
                    Home
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigateToDashboardWithTrain()}
                    className="hover:text-orange-300 transition-colors duration-200 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
                  >
                    Track Train
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setAboutOpen(true)}
                    className="hover:text-orange-300 transition-colors duration-200 cursor-pointer rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
                  >
                    About RAIL-PULSE
                  </button>
                </li>
                <li>
                  <a
                    href="https://github.com/wicked-heckers/rail-pulse/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-orange-300 transition-colors duration-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
                  >
                    <span>Contact</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  </a>
                </li>
              </ul>
            </nav>

            {/* Built For Indian Railways Journeys */}
            <div className="md:col-span-3 space-y-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400">
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span>Built for Indian Railways journeys</span>
              </div>
              <p className="text-xs text-slate-300/90 leading-relaxed">
                Designed around real corridor traffic so passengers can plan onward transfers with confidence.
              </p>
            </div>
          </div>

          {/* Divider + Disclaimer & Copyright */}
          <div className="mt-8 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-300/80">
            <p className="leading-relaxed">
              RAIL-PULSE is an independent project. Arrival predictions are estimates and may change. Not affiliated with Indian Railways.
            </p>
            <p className="whitespace-nowrap text-slate-400 shrink-0">
              &copy; {new Date().getFullYear()} RAIL-PULSE
            </p>
          </div>
        </div>
      </footer>

      {/* Compact About Modal */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-rail-pulse-title"
          onClick={() => setAboutOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white text-slate-800 border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <h3
                  id="about-rail-pulse-title"
                  className="text-base font-bold text-[#0F294A]"
                >
                  About RAIL-PULSE
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                aria-label="Close About dialog"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F294A]/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              RAIL-PULSE watches surrounding corridor traffic—not just your train—to give you a realistic arrival window and suggest timely road transfers if a tight connection is at risk.
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
