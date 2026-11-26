import React from 'react';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { SearchCard } from './SearchCard';
import { ValueComparison } from './ValueComparison';
import { HowItWorks } from './HowItWorks';
import { LandingFooter } from './LandingFooter';
import { LandingBackground } from './LandingBackground';

export const LandingPage: React.FC = () => {
  return (
    <div className="relative min-h-screen bg-[#F4F7FA] text-slate-800 flex flex-col font-sans overflow-x-hidden">
      {/* SVG Railway Transit Background Layer */}
      <LandingBackground />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col min-h-screen justify-between">
        <LandingNav />

        <main className="flex-1 flex flex-col justify-center px-4 py-6">
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-5">
            <HeroSection />
            <SearchCard />
            <ValueComparison />
            <HowItWorks />
          </div>
        </main>

        <LandingFooter />
      </div>
    </div>
  );
};
