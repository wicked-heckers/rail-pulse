import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Draws a crisp circular/badge frame (@2x HiDPI) around an optional loaded train logo image.
 */
function buildTrainBadgeImageData(
  isTarget: boolean,
  iconImg?: HTMLImageElement | null
): ImageData | null {
  const size = isTarget ? 72 : 60;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const c = size / 2;
  const ringColor = isTarget ? '#EA580C' : '#2563EB';
  const outerHaloColor = isTarget ? 'rgba(249, 115, 22, 0.25)' : 'rgba(37, 99, 235, 0.16)';
  const badgeRadius = isTarget ? 27 : 23;

  // Soft outer glow ring
  ctx.fillStyle = outerHaloColor;
  ctx.beginPath();
  ctx.arc(c, c, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  // Crisp white circular badge base
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(c, c, badgeRadius, 0, Math.PI * 2);
  ctx.fill();

  // Colored identity border (#EA580C for Your Train, #2563EB for Other Trains)
  ctx.lineWidth = isTarget ? 4.5 : 3.5;
  ctx.strokeStyle = ringColor;
  ctx.stroke();

  if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
    const iconPad = isTarget ? 14 : 12;
    const drawSize = size - iconPad * 2;
    ctx.drawImage(iconImg, iconPad, iconPad, drawSize, drawSize);
  } else {
    // Immediate synchronous fallback inner dot while PNG finishes decoding (~1ms)
    ctx.fillStyle = ringColor;
    ctx.beginPath();
    ctx.arc(c, c, isTarget ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Registers upright train logo sprites on MapLibre immediately and upgrades them
 * in-place once `/dashboard-train-icon.png` loads.
 */
export function registerTrainSprites(map: MapLibreMap): void {
  if (!map.hasImage('train-target')) {
    const fallbackTarget = buildTrainBadgeImageData(true);
    if (fallbackTarget) {
      map.addImage('train-target', fallbackTarget, { pixelRatio: 2 });
    }
  }
  if (!map.hasImage('train-other')) {
    const fallbackOther = buildTrainBadgeImageData(false);
    if (fallbackOther) {
      map.addImage('train-other', fallbackOther, { pixelRatio: 2 });
    }
  }

  const img = new Image();
  img.onload = () => {
    const targetWithIcon = buildTrainBadgeImageData(true, img);
    if (targetWithIcon && map.hasImage('train-target')) {
      map.updateImage('train-target', targetWithIcon);
    }
    const otherWithIcon = buildTrainBadgeImageData(false, img);
    if (otherWithIcon && map.hasImage('train-other')) {
      map.updateImage('train-other', otherWithIcon);
    }
  };
  img.src = '/dashboard-train-icon.png';
}
