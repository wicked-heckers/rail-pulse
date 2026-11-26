import type { ArrivalPrediction } from '../dashboard/passengerUtils';

export function escapeHtml(str?: string | number | null): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getGoodsTrainPopupHtml(): string {
  return `
    <div class="w-[300px] p-3.5 text-sm space-y-2 font-sans">
      <!-- Row 1: Orange status dot + soft amber badge (clean space on right for × close button) -->
      <div class="flex items-center justify-between pr-6">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
            ~14 min delay
          </span>
        </div>
      </div>

      <!-- Row 2: Full-width Title -->
      <h4 class="font-bold text-[15px] leading-snug text-slate-900 pt-0.5">
        Goods Train Ahead
      </h4>

      <!-- Row 3: Location + Plain Description -->
      <div class="pt-1.5 border-t border-slate-100">
        <div class="text-xs font-semibold text-slate-500 mb-1">Between Cuttack & Barang</div>
        <p class="text-slate-700 leading-relaxed text-[13px] sm:text-sm">
          A slow goods train is ahead of you toward Bhubaneswar, adding about 14 mins to your journey.
        </p>
      </div>
    </div>
  `;
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
    <div class="p-3 max-w-xs text-xs space-y-2 font-sans">
      <div class="flex items-center justify-between border-b pb-1.5 border-slate-100">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full ${isTarget ? 'bg-orange-500 ring-2 ring-orange-200' : 'bg-blue-600'}"></span>
          <strong class="font-bold text-sm text-[#0F294A]">${trainNo} ${trainName}</strong>
        </div>
        <span class="px-1.5 py-0.5 rounded text-xs font-bold ${isTarget ? 'bg-orange-50 text-orange-800' : 'bg-slate-100 text-slate-700'}">
          ${isTarget ? 'Your Train' : 'Corridor Train'}
        </span>
      </div>
      <div class="space-y-1 text-slate-600 font-medium">
        <div class="flex justify-between">
          <span>Running Status:</span>
          <strong class="${delay > 5 ? 'text-amber-800' : 'text-emerald-700'} font-bold">
            ${delay > 0 ? `+${delay}m late` : 'On Time'} • ${speed > 0 ? `${speed} km/h` : 'At Station'}
          </strong>
        </div>
        <div class="flex justify-between">
          <span>Position:</span>
          <span class="text-slate-800 font-bold">${curStation ? `Platform ${curStation}` : `En route to ${nxtStation}`}</span>
        </div>
        <div class="flex justify-between">
          <span>Data Source:</span>
          <span class="text-slate-500 font-mono text-xs">Real-Time Corridor Telemetry</span>
        </div>
      </div>
      ${
        !isTarget
          ? `<button id="btn-track-${safeTrainId}" class="w-full mt-1.5 py-1 px-2.5 bg-[#0F294A] hover:bg-slate-800 text-white font-bold rounded-lg text-center transition-colors cursor-pointer text-xs">
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
    <div class="p-3 max-w-xs text-xs space-y-2 font-sans">
      <div class="flex items-center justify-between border-b pb-1.5 border-slate-100">
        <strong class="font-bold text-sm text-[#0F294A]">${stnName} (${stnCode})</strong>
        <span class="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-700">km ${kmFormatted}</span>
      </div>
      <div class="space-y-1">
        <div class="text-xs font-bold text-[#0F294A]">${roleBadge}</div>
        <p class="text-slate-600 leading-snug">${explanation}</p>
      </div>
      ${
        props.code === 'BBS'
          ? `<div class="bg-slate-50 p-1.5 rounded border border-slate-200 text-xs text-slate-700 font-medium">
              Expected Arrival: <strong class="text-[#0F294A] font-bold">${escapeHtml(prediction.expectedTime)}</strong> (Window: ${escapeHtml(prediction.likelyWindow)})
            </div>`
          : ''
      }
    </div>
  `;
}

export function getDelayDetailPopupHtml(
  tag: string,
  title: string,
  location: string,
  message: string
): string {
  const displayTag = escapeHtml(tag);
  const displayTitle = escapeHtml(title);
  const displayLocation = escapeHtml(location);
  const displayMessage = escapeHtml(message);

  return `
    <div class="w-[300px] p-3.5 text-sm space-y-2 font-sans">
      <div class="flex items-center justify-between pr-6">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
            ${displayTag}
          </span>
        </div>
      </div>
      <h4 class="font-bold text-[15px] leading-snug text-slate-900 pt-0.5">
        ${displayTitle}
      </h4>
      <div class="pt-1.5 border-t border-slate-100">
        <div class="text-xs font-semibold text-slate-500 mb-1">${displayLocation}</div>
        <p class="text-slate-700 leading-relaxed text-[13px] sm:text-sm">${displayMessage}</p>
      </div>
    </div>
  `;
}
