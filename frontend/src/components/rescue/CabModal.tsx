import React, { useState, useEffect } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { Car, X, Check, MapPin, Navigation } from 'lucide-react';
import { formatEpochTo12Hour } from '../dashboard/passengerUtils';

export const CabModal: React.FC = () => {
  const { cabModalOpen, setCabModalOpen, rescue, activeSnapshot } = useRailStore();
  const [isBooked, setIsBooked] = useState(false);
  const [isBooking, setIsBooking] = useState(false);

  // Close modal on Escape
  useEffect(() => {
    if (!cabModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCabModalOpen(false);
        setIsBooked(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cabModalOpen, setCabModalOpen]);

  if (!cabModalOpen) return null;

  const defaultRoadEpoch = (activeSnapshot.tick_utc || 1795067700) + 38 * 60;
  const roadArrival = rescue?.bailout_plan?.final_road_arrival_epoch
    ? formatEpochTo12Hour(rescue.bailout_plan.final_road_arrival_epoch)
    : formatEpochTo12Hour(defaultRoadEpoch);
  const minsSaved = rescue?.bailout_plan?.minutes_saved ?? 21;

  const handleConfirm = () => {
    setIsBooking(true);
    setTimeout(() => {
      setIsBooking(false);
      setIsBooked(true);
    }, 1200);
  };

  const handleClose = () => {
    setCabModalOpen(false);
    setIsBooked(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-[#E2E8F0] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">NH-16 Highway Road Transfer</h3>
              <p className="text-xs text-gray-300">Cuttack Junction ➔ Bhubaneswar Station</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {!isBooked ? (
            <>
              {/* Route Summary */}
              <div className="bg-[#FAF9F6] p-3.5 rounded-xl border border-[#E5E7EB] space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <span className="text-[#64748B] block">Pickup Location</span>
                    <strong className="text-[#0F172A]">Cuttack Junction (CTC) — Exit Gate 2 Portico</strong>
                  </div>
                </div>

                <div className="border-l-2 border-dashed border-[#CBD5E1] ml-2 pl-4 py-1">
                  <span className="text-xs font-mono text-[#64748B]">27.4 km via NH-16 Expressway (38 mins)</span>
                </div>

                <div className="flex items-start gap-2.5">
                  <Navigation className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <span className="text-[#64748B] block">Drop Location</span>
                    <strong className="text-[#0F172A]">Bhubaneswar (BBS) — Platform 1 Main Concourse</strong>
                  </div>
                </div>
              </div>

              {/* Driver & Cab Details */}
              <div className="border border-[#E2E8F0] rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">Prime Sedan (Toyota Etios)</div>
                  <div className="text-xs text-[#64748B]">Driver: Rajesh Sahu • OD 02 AB 4591</div>
                  <div className="text-xs text-emerald-600 font-medium mt-0.5">★ 4.9 (420+ trips) • 3 mins away</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold font-mono text-[#0F172A]">₹480</div>
                  <div className="text-xs text-[#64748B]">Fixed Fare</div>
                </div>
              </div>

              {/* Time Advantage Pill */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                <span className="text-emerald-800">Connection Arrival via Road:</span>
                <span className="font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-300">
                  {roadArrival} (~{minsSaved}m lead)
                </span>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-[#475569] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isBooking}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {isBooking ? 'Connecting Driver...' : 'Confirm Cab Dispatch'}
                </button>
              </div>
            </>
          ) : (
            /* Booking Confirmed State */
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h4 className="text-base font-bold text-[#0F172A]">Cab Dispatched to CTC Gate 2</h4>
              <p className="text-xs text-[#64748B] max-w-xs mx-auto">
                Your driver Rajesh Sahu is waiting at Cuttack Junction Exit Gate 2. Estimated road journey: 38 minutes to
                Bhubaneswar Station.
              </p>

              <div className="bg-[#FAF9F6] p-3 rounded-lg border border-[#E2E8F0] text-xs font-mono inline-block">
                OTP: <span className="font-bold text-emerald-700 text-sm tracking-widest">7482</span>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  Close & View Live Radar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
