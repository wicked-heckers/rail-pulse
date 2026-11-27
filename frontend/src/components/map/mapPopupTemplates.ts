import type { ArrivalPrediction } from '../dashboard/passengerUtils';

function escapeHtml(str?: string | number | null): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getTrainPopupHtml(props: {
  train_no: string;
  train_name: string;
  delay_mins?: number;
  speed_kmph?: number;
  current_station?: string | null;
  next_station?: string | null;
  is_target?: boolean;
}): string {
  const isTarget = props.is_target;
  const trainNo = escapeHtml(props.train_no);
  const trainName = escapeHtml(props.train_name);
  const delay = Math.round(Number(props.delay_mins) || 0);
  const speed = Math.round(Number(props.speed_kmph) || 0);
  const curStation = escapeHtml(props.current_station);
  const nxtStation = escapeHtml(props.next_station || 'BBS');

  const safeTrainId = String(props.train_no).replace(/[^a-zA-Z0-9_-]/g, '');

  return `
    <div class="p-3.5 w-full max-w-[300px] text-xs space-y-2 font-sans">
      <div class="flex items-start justify-between gap-2 pr-7 border-b pb-2 border-slate-100">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full shrink-0 ${isTarget ? 'bg-orange-500 ring-2 ring-orange-200' : 'bg-blue-600'}"></span>
          <strong class="font-bold text-sm text-[#0F294A] leading-snug">${trainNo} ${trainName}</strong>
        </div>
        <span class="px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 whitespace-nowrap ${isTarget ? 'bg-orange-50 text-orange-800 border border-orange-200/70' : 'bg-slate-100 text-slate-700'}">
          ${isTarget ? 'Your Train' : 'Corridor'}
        </span>
      </div>
      <div class="space-y-1.5 text-slate-600 font-medium">
        <div class="flex items-center justify-between gap-2">
          <span>Running Status:</span>
          <strong class="${delay > 5 ? 'text-amber-800' : 'text-emerald-700'} font-bold text-right">
            ${delay > 0 ? `+${delay}m late` : 'On Time'} • ${speed > 0 ? `${speed} km/h` : 'At Station'}
          </strong>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span>Position:</span>
          <span class="text-slate-800 font-bold text-right">${curStation ? `Platform ${curStation}` : `En route to ${nxtStation}`}</span>
        </div>
      </div>
      ${
        !isTarget
          ? `<button id="btn-track-${safeTrainId}" class="w-full mt-1.5 py-1.5 px-2.5 bg-[#0F294A] hover:bg-slate-800 text-white font-bold rounded-lg text-center transition-colors cursor-pointer text-xs">
              Track this train
            </button>`
          : ''
      }
    </div>
  `;
}

export function getStationPopupHtml(
  props: {
    name: string;
    code: string;
    km: number;
    role_badge?: string;
    explanation?: string;
  },
  prediction: ArrivalPrediction
): string {
  const stnName = escapeHtml(props.name);
  const stnCode = escapeHtml(props.code);
  const roleBadge = escapeHtml(props.role_badge);
  const explanation = escapeHtml(props.explanation);
  const kmFormatted = Number(props.km || 0).toFixed(1);

  return `
    <div class="p-3.5 w-full max-w-[300px] text-xs space-y-2 font-sans">
      <div class="flex items-start justify-between gap-2 pr-7 border-b pb-2 border-slate-100">
        <strong class="font-bold text-sm text-[#0F294A] leading-snug">${stnName} (${stnCode})</strong>
        <span class="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-700 shrink-0 whitespace-nowrap">km ${kmFormatted}</span>
      </div>
      <div class="space-y-1">
        <div class="text-xs font-bold text-[#0F294A] leading-snug">${roleBadge}</div>
        <p class="text-slate-600 leading-relaxed">${explanation}</p>
      </div>
      ${
        props.code === prediction.destinationCode || props.code === 'BBS' || props.code === 'KGP' || props.code === 'PURI' || props.code === 'HWH'
          ? `<div class="bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs text-slate-700 font-medium leading-snug">
              Expected Arrival: <strong class="text-[#0F294A] font-bold">${escapeHtml(prediction.expectedTime)}</strong> (Window: ${escapeHtml(prediction.likelyWindow)})
            </div>`
          : ''
      }
    </div>
  `;
}
