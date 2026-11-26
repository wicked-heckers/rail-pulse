import React, { useRef, useCallback } from 'react';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { SearchCard } from './SearchCard';
import { ValueComparison } from './ValueComparison';
import { HowItWorks } from './HowItWorks';
import { LandingFooter } from './LandingFooter';
import { LandingBackground } from './LandingBackground';

export const LandingPage: React.FC = () => {
  const searchCardRef = useRef<HTMLDivElement>(null);

  const handleNavigateToSearch = useCallback((tab: 'find' | 'track') => {
    const container = searchCardRef.current;
    if (!container) return;

    container.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const tabButtons = container.querySelectorAll<HTMLButtonElement>(':scope > div > div > div:first-child button');
    const targetBtn = tab === 'find' ? tabButtons[0] : tabButtons[1];
    targetBtn?.click();
  }, []);

  return (
    <div className="relative min-h-screen bg-[#F4F7FA] text-slate-800 flex flex-col font-sans overflow-x-hidden">
      {/* Fixed SVG Railway Transit Background Layer */}
      <LandingBackground />

      {/* Content Container */}
      <div className="relative z-10 min-h-screen flex flex-col justify-between">
        <LandingNav />

        <main className="flex-1 px-4 pt-6 md:pt-10 pb-8 flex flex-col">
          <div className="w-full max-w-3xl mx-auto flex flex-col">
            <div className="mb-6 md:mb-8">
              <HeroSection />
            </div>
            <div ref={searchCardRef}>
              <SearchCard />
            </div>
            <div className="mt-6 md:mt-8">
              <ValueComparison />
            </div>
            <div className="mt-6 md:mt-9">
              <HowItWorks />
            </div>
          </div>
        </main>

        <LandingFooter onNavigateToSearch={handleNavigateToSearch} />
      </div>
    </div>
  );
};
