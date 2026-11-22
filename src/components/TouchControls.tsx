import { useRef, useState } from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import type { WeaponId } from '../game/types';
import { WeaponIcon } from './SvgIcons';

interface TouchControlsProps {
  onMove: (x: number, z: number) => void;
  onAim: (x: number, z: number, firing: boolean) => void;
  onDash: () => void;
  swapPrompt?: { weaponId: WeaponId; label: string } | null;
  onSwap?: () => void;
}

interface StickPos {
  dx: number;
  dy: number;
  active: boolean;
}

export function TouchControls({ onMove, onAim, onDash, swapPrompt, onSwap }: TouchControlsProps) {
  const [moveStick, setMoveStick] = useState<StickPos>({ dx: 0, dy: 0, active: false });
  const [aimStick, setAimStick] = useState<StickPos>({ dx: 0, dy: 0, active: false });
  const movePointerId = useRef<number | null>(null);
  const aimPointerId = useRef<number | null>(null);
  const moveZoneRef = useRef<HTMLDivElement>(null);
  const aimZoneRef = useRef<HTMLDivElement>(null);

  const MAX_RADIUS = 44;

  const computeStick = (clientX: number, clientY: number, el: HTMLDivElement | null) => {
    if (!el) return { nx: 0, ny: 0, dx: 0, dy: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_RADIUS) {
      dx = (dx / dist) * MAX_RADIUS;
      dy = (dy / dist) * MAX_RADIUS;
    }
    return {
      nx: dx / MAX_RADIUS,
      ny: dy / MAX_RADIUS,
      dx,
      dy,
    };
  };

  return (
    <div className="fixed inset-x-0 bottom-3 z-30 pointer-events-none flex items-end justify-between px-4 sm:px-8">
      {/* Left Virtual Movement Stick */}
      <div
        ref={moveZoneRef}
        aria-label="Analógico de movimento"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          movePointerId.current = e.pointerId;
          const res = computeStick(e.clientX, e.clientY, moveZoneRef.current);
          setMoveStick({ dx: res.dx, dy: res.dy, active: true });
          onMove(res.nx, res.ny);
        }}
        onPointerMove={(e) => {
          if (movePointerId.current !== e.pointerId) return;
          const res = computeStick(e.clientX, e.clientY, moveZoneRef.current);
          setMoveStick({ dx: res.dx, dy: res.dy, active: true });
          onMove(res.nx, res.ny);
        }}
        onPointerUp={(e) => {
          if (movePointerId.current !== e.pointerId) return;
          movePointerId.current = null;
          setMoveStick({ dx: 0, dy: 0, active: false });
          onMove(0, 0);
        }}
        onPointerCancel={() => {
          movePointerId.current = null;
          setMoveStick({ dx: 0, dy: 0, active: false });
          onMove(0, 0);
        }}
        className="pointer-events-auto relative w-28 h-28 rounded-full border-2 border-[#3a3a40] bg-[#0c0c0f]/80 flex items-center justify-center touch-none"
      >
        <div
          style={{
            transform: `translate(${moveStick.dx}px, ${moveStick.dy}px)`,
          }}
          className={`w-12 h-12 rounded-full border-2 border-black ${
            moveStick.active ? 'bg-[#e9e4d8]' : 'bg-[#e9e4d8]/50'
          }`}
        />
        <span className="absolute -top-5 text-[10px] font-display uppercase tracking-wider text-[#e9e4d8] hud-text-stroke">
          MOVER
        </span>
      </div>

      {/* Center Action Buttons: Conditional SWAP + DASH */}
      <div className="pointer-events-none flex flex-col items-center gap-2 mb-3">
        {swapPrompt && onSwap && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onSwap();
            }}
            aria-label={`Trocar arma por ${swapPrompt.label}`}
            className="pointer-events-auto px-btn px-2.5 py-1 flex items-center gap-1.5 font-display font-bold text-[10px] leading-none"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <WeaponIcon weapon={swapPrompt.weaponId} className="w-10 h-6" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDash();
            }}
            aria-label="Dash"
            className="pointer-events-auto px-btn px-btn-primary w-14 h-14 p-0 flex flex-col items-center justify-center font-display font-bold text-[10px] leading-none shrink-0"
          >
            <Zap className="w-4 h-4 fill-current mb-0.5" />
            DASH
          </button>
        </div>
      </div>

      {/* Right Aim + Auto-Fire Stick */}
      <div className="pointer-events-none flex flex-col items-end">
        <div
          ref={aimZoneRef}
          aria-label="Analógico de mira e tiro"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            aimPointerId.current = e.pointerId;
            const res = computeStick(e.clientX, e.clientY, aimZoneRef.current);
            const mag = Math.hypot(res.nx, res.ny);
            setAimStick({ dx: res.dx, dy: res.dy, active: true });
            onAim(res.nx, res.ny, mag > 0.25);
          }}
          onPointerMove={(e) => {
            if (aimPointerId.current !== e.pointerId) return;
            const res = computeStick(e.clientX, e.clientY, aimZoneRef.current);
            const mag = Math.hypot(res.nx, res.ny);
            setAimStick({ dx: res.dx, dy: res.dy, active: true });
            onAim(res.nx, res.ny, mag > 0.22);
          }}
          onPointerUp={(e) => {
            if (aimPointerId.current !== e.pointerId) return;
            aimPointerId.current = null;
            setAimStick({ dx: 0, dy: 0, active: false });
            onAim(0, 0, false);
          }}
          onPointerCancel={() => {
            aimPointerId.current = null;
            setAimStick({ dx: 0, dy: 0, active: false });
            onAim(0, 0, false);
          }}
          className="pointer-events-auto relative w-28 h-28 rounded-full border-2 border-[#ff8f2e] bg-[#0c0c0f]/80 flex items-center justify-center touch-none"
        >
          <div
            style={{
              transform: `translate(${aimStick.dx}px, ${aimStick.dy}px)`,
            }}
            className={`w-12 h-12 rounded-full border-2 border-black ${
              aimStick.active ? 'bg-[#ff8f2e]' : 'bg-[#ff8f2e]/55'
            }`}
          />
          <span className="absolute -top-5 text-[10px] font-display uppercase tracking-wider text-[#ff8f2e] hud-text-stroke">
            MIRA / TIRO
          </span>
        </div>
      </div>
    </div>
  );
}
