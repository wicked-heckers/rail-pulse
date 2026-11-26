import React from 'react';

export const LandingBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden"
    >
      <div className="relative w-full max-w-[2172px] mx-auto h-[440px] sm:h-[580px] md:h-[680px] lg:h-[720px]">
        {/* Modern High-Speed Railway Transit & Traveller Background Illustration */}
        <img
          src="/landing-bg2.svg"
          alt=""
          className="w-full h-full object-contain object-top opacity-95 transition-opacity duration-500"
        />

        {/* Soft Mobile/Tablet text readability scrim */}
        <div className="sm:hidden absolute inset-0 bg-gradient-to-b from-[#F4F7FA]/60 via-[#F4F7FA]/20 to-[#F4F7FA]" />

        {/* Gentle Bottom Fade for Smooth Transition into Content and Background */}
        <div className="absolute inset-x-0 bottom-0 h-28 sm:h-36 bg-gradient-to-t from-[#F4F7FA] via-[#F4F7FA]/70 to-transparent" />
      </div>
    </div>
  );
};
