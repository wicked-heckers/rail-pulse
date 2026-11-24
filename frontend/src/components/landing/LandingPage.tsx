import React from 'react';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { SearchCard } from './SearchCard';
import { ValueComparison } from './ValueComparison';
import { HowItWorks } from './HowItWorks';
import { LandingFooter } from './LandingFooter';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F4F7FA] text-slate-800 flex flex-col font-sans">
      <LandingNav />

      <main className="flex-1 flex flex-col gap-6 py-6">
        <HeroSection />
        <SearchCard />
        <ValueComparison />
        <HowItWorks />
      </main>

      <LandingFooter />
    </div>
  );
};
