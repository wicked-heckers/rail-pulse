import React from 'react';
import { Search, Activity, ShieldCheck } from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const HowItWorks: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].steps;

  const steps = [
    { badge: t.s1Badge, title: t.s1Title, desc: t.s1Desc, icon: Search },
    { badge: t.s2Badge, title: t.s2Title, desc: t.s2Desc, icon: Activity },
    { badge: t.s3Badge, title: t.s3Title, desc: t.s3Desc, icon: ShieldCheck },
  ];

  return (
    <section aria-label="How Rail-Pulse works" className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div
              key={i}
              className="rounded-2xl bg-white/95 backdrop-blur-xs border border-slate-200/90 p-5 sm:p-6 shadow-xs hover:shadow-md hover:border-slate-300/90 transition-all duration-200 flex flex-col"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-bold tracking-wider text-[#0F294A]/70 uppercase">
                  {step.badge}
                </span>
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-[#0F294A] flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <h4 className="text-base font-bold text-slate-900 leading-snug">
                {step.title}
              </h4>
              <p className="text-sm leading-relaxed text-slate-600 mt-1.5">
                {step.desc}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
