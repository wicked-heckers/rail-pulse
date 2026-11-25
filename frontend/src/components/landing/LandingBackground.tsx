import React from 'react';

export const LandingBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 overflow-hidden z-0"
    >
      {/* SVG Railway Transit Vector Layer adjusted to frame the gap right below hero text and above the search card */}
      <img
        src="/landing-bg.svg"
        alt=""
        className="w-full h-full object-cover object-top opacity-65 blur-[1px] min-h-[1050px] translate-y-20 sm:translate-y-24 scale-103"
      />

      {/* Soft translucent tint overlay for text legibility */}
      <div className="absolute inset-0 bg-white/20" />

      {/* Gentle Bottom Fade for Smooth Transition into Content and Footer */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#F4F7FA]/40 to-[#F4F7FA]" />
    </div>
  );
};
