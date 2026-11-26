import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const HowItWorks: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].steps;

  const steps = [
    { badge: t.s1Badge, title: t.s1Title, desc: t.s1Desc },
    { badge: t.s2Badge, title: t.s2Title, desc: t.s2Desc },
    { badge: t.s3Badge, title: t.s3Title, desc: t.s3Desc },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="w-full grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 pt-1">
        {steps.map((step, i) => (
          <div
            key={i}
            className="py-4 first:pt-0 last:pb-0 md:py-0 md:px-7 first:md:pl-0 last:md:pr-0 flex flex-col"
          >
            <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              {step.badge}
            </span>
            <h4 className="text-sm font-semibold text-slate-900 mt-1 leading-snug">
              {step.title}
            </h4>
            <p className="text-[13px] leading-relaxed text-slate-500 mt-1.5">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
