import React, { useState, useEffect } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

interface LandingFooterProps {
  onNavigateToSearch?: (tab: 'find' | 'track') => void;
}

type ActiveModal = 'forecasts' | 'faq' | 'feedback' | null;

export const LandingFooter: React.FC<LandingFooterProps> = ({ onNavigateToSearch }) => {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [feedbackTrainNo, setFeedbackTrainNo] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  useEffect(() => {
    if (!activeModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal]);

  const handleOpenFeedback = () => {
    setFeedbackTrainNo('');
    setFeedbackMessage('');
    setFeedbackSubmitted(false);
    setActiveModal('feedback');
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) return;
    setFeedbackSubmitted(true);
  };

  return (
    <>
      <footer className="w-full border-t border-slate-200/80 bg-white/70 backdrop-blur-sm mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8 md:pt-12 md:pb-10">
          {/* Asymmetrical 3-Column Editorial Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10">
            {/* Column 1: Project Information */}
            <div className="md:col-span-6">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="Rail-Pulse logo"
                  className="w-6 h-6 object-contain shrink-0"
                />
                <span className="text-base font-bold tracking-tight text-slate-900">
                  RAIL-PULSE
                </span>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed mt-3 max-w-md">
                A corridor-aware arrival and connection tracker built for the East Coast Railway
                route between Bhadrak, Cuttack, Bhubaneswar, and Puri. Instead of relying on static
                timetable estimates, Rail-Pulse factors in freight traffic, platform holds, and
                express overtakes ahead of your train to give a realistic arrival window—and a
                timely cab alternative when onward connections are at risk.
              </p>

              <p className="text-[13px] text-slate-600 mt-3 font-medium">
                Active Corridor: Bhadrak (BHC) – Jajpur – Cuttack – Bhubaneswar – Khurda Rd – Puri (PURI)
              </p>
            </div>

            {/* Column 2: Quick Navigation */}
            <div className="md:col-span-3">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                EXPLORE
              </h3>
              <div className="flex flex-col items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigateToSearch?.('find')}
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors cursor-pointer text-left"
                >
                  Find Trains
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateToSearch?.('track')}
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors cursor-pointer text-left"
                >
                  Track by Train Number
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal('forecasts')}
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors cursor-pointer text-left"
                >
                  How Forecasts Work
                </button>
              </div>
            </div>

            {/* Column 3: Help & Contact */}
            <div className="md:col-span-3">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                HELP &amp; CONTACT
              </h3>
              <div className="flex flex-col items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal('faq')}
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors cursor-pointer text-left"
                >
                  Passenger FAQ
                </button>
                <button
                  type="button"
                  onClick={handleOpenFeedback}
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors cursor-pointer text-left"
                >
                  Report an Issue / Feedback
                </button>
                <a
                  href="mailto:support@railpulse.in"
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  support@railpulse.in
                </a>
              </div>
            </div>
          </div>

          {/* Bottom Legal Row */}
          <div className="mt-10 pt-5 border-t border-slate-300/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[13px] text-slate-600">
            <p>
              Independent passenger transit project. Arrival windows are live estimates and may shift
              with railway signaling. Not affiliated with Indian Railways or IRCTC.
            </p>
            <p className="whitespace-nowrap shrink-0 font-medium">&copy; 2026 Rail-Pulse</p>
          </div>
        </div>
      </footer>

      {/* Footer Modals */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setActiveModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {activeModal === 'forecasts' && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">How Forecasts Work</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Plain-language guide to arrival windows
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                    <p className="font-semibold text-emerald-950 text-xs uppercase tracking-wide">
                      Earliest (P10)
                    </p>
                    <p className="mt-1 text-[13px] text-emerald-900">
                      When signals stay green and slow goods trains clear loop lines promptly, your
                      train can arrive by this time.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="font-semibold text-slate-900 text-xs uppercase tracking-wide">
                      Most Likely (P50)
                    </p>
                    <p className="mt-1 text-[13px] text-slate-700">
                      The realistic midpoint accounting for current traffic density, station dwell,
                      and active speed restrictions ahead.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
                    <p className="font-semibold text-amber-950 text-xs uppercase tracking-wide">
                      Worst-Case (P90)
                    </p>
                    <p className="mt-1 text-[13px] text-amber-900">
                      The latest expected arrival if freight congestion, platform holds, or express
                      overtakes ahead persist.
                    </p>
                  </div>
                </div>
              </>
            )}

            {activeModal === 'faq' && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Passenger FAQ</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Common questions about corridor tracking
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4 text-sm">
                  <div>
                    <h5 className="font-semibold text-slate-900">
                      Why do you show a time range instead of one exact minute?
                    </h5>
                    <p className="text-[13px] text-slate-600 mt-1 leading-relaxed">
                      Single-minute estimates assume an empty track ahead. Real sections have slow
                      freight rakes, crossing holds, and priority overtakes, so a range shows how
                      early or late your train may realistically arrive.
                    </p>
                  </div>

                  <div>
                    <h5 className="font-semibold text-slate-900">
                      When does Rail-Pulse suggest getting off at Cuttack for a cab?
                    </h5>
                    <p className="text-[13px] text-slate-600 mt-1 leading-relaxed">
                      When you are already on board and your projected train arrival leaves less than
                      the safe transfer buffer for your onward train, Rail-Pulse checks whether an
                      NH-16 cab from Cuttack can reach Bhubaneswar earlier.
                    </p>
                  </div>

                  <div>
                    <h5 className="font-semibold text-slate-900">
                      How often do live positions update?
                    </h5>
                    <p className="text-[13px] text-slate-600 mt-1 leading-relaxed">
                      Live corridor telemetry streams continuously over WebSocket and refreshes
                      train positions smoothly in real time as blocks and signals change.
                    </p>
                  </div>
                </div>
              </>
            )}

            {activeModal === 'feedback' && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      Report an Issue / Feedback
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Let us know about a delay discrepancy or UI issue
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {feedbackSubmitted ? (
                  <div className="py-6 text-center space-y-2.5">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      Thank you — your feedback has been recorded.
                    </p>
                    <p className="text-xs text-slate-500">
                      We review corridor reports to improve arrival accuracy.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="mt-2 px-4 py-2 rounded-lg bg-[#0F294A] text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleFeedbackSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Train Number (optional)
                      </label>
                      <input
                        type="text"
                        value={feedbackTrainNo}
                        onChange={(e) => setFeedbackTrainNo(e.target.value)}
                        placeholder="e.g. 12821"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Message
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        placeholder="Describe what you noticed..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A] resize-none"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveModal(null)}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-[#0F294A] text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Send Feedback
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
