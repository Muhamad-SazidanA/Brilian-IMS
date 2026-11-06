import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { WatermarkOptions } from '../../types';

interface WatermarkOverlayProps {
  options?: Partial<WatermarkOptions>;
}

/**
 * WatermarkOverlay renders an immutable, diagonal repeating watermark
 * across the container according to docs/STYLE_GUIDE.md § 3.5.
 * Strictly enforced opacity (15% - 25%), non-selectable, pointer-events-none.
 * Text format adheres to watermark_oracle.js: {FullName} | {UserID} | {Timestamp}
 */
export const WatermarkOverlay: React.FC<WatermarkOverlayProps> = ({ options }) => {
  const { user } = useAuth();

  const watermarkText = useMemo(() => {
    const fullName = options?.FullName || user?.name || user?.username || 'Pengguna Terotorisasi';
    const userId = options?.UserID || user?.id || 'usr-anonymous';
    const timestamp = options?.Timestamp
      ? (typeof options.Timestamp === 'string'
          ? options.Timestamp
          : options.Timestamp.toISOString())
      : new Date().toISOString();

    return `${fullName} | ${userId} | ${timestamp}`;
  }, [options, user]);

  const opacity = Math.min(0.25, Math.max(0.15, options?.Opacity ?? 0.20));
  const angle = options?.DiagonalAngle ?? -45;

  // Generate repeating watermark grid rows
  const repeatUnits = useMemo(() => {
    const rows = [];
    for (let r = 0; r < 16; r++) {
      rows.push(r);
    }
    return rows;
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{ opacity, transform: `rotate(${angle}deg)` }}
      className="absolute inset-0 pointer-events-none select-none overflow-hidden z-50 flex flex-col justify-around scale-125"
    >
      {repeatUnits.map((rowIdx) => (
        <div
          key={rowIdx}
          style={{ transform: `translateX(${(rowIdx % 2) * -120}px)` }}
          className="whitespace-nowrap font-mono text-[11px] font-semibold text-slate tracking-wider flex gap-16"
        >
          <span>{watermarkText}</span>
          <span>{watermarkText}</span>
          <span>{watermarkText}</span>
          <span>{watermarkText}</span>
        </div>
      ))}
    </div>
  );
};
