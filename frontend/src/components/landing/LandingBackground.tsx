import React from 'react';

export const LandingBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-0 pointer-events-none select-none overflow-hidden flex flex-col justify-end"
    >
      <div className="relative w-full max-w-[2172px] mx-auto h-[380px] sm:h-[480px] md:h-[560px] lg:h-[620px]">
        {/* Modern High-Speed Railway Transit & Traveller Background Illustration */}
        <img
          src="/landing-bg2.svg"
          alt=""
          className="w-full h-full object-contain object-bottom opacity-95 transition-opacity duration-500"
        />

        {/* Gentle Top Fade for Smooth Ambient Transition into the Upper Page */}
        <div className="absolute inset-x-0 top-0 h-24 sm:h-32 bg-gradient-to-b from-[#F4F7FA] via-[#F4F7FA]/70 to-transparent" />
      </div>
    </div>
  );
};
