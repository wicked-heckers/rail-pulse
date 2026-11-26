import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const HowItWorks: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].steps;

  const steps = [
    { title: t.s1Title, desc: t.s1Desc },
    { title: t.s2Title, desc: t.s2Desc },
    { title: t.s3Title, desc: t.s3Desc },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-0 md:divide-x md:divide-slate-200/80 px-2 py-1">
        {steps.map((step, i) => (
          <div
            key={i}
            className="md:px-5 first:pl-0 last:pr-0 flex items-start gap-3"
          >
            <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200/80 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              {i + 1}
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                {step.title}
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
