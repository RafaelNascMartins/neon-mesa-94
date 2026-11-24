import { useEffect, useState } from 'react';
import { synthAudio } from '../game/audio';
import { SOULS, type SoulId } from '../game/souls';
import { SOUL_FORM_TIME, SoulGlyph } from './SoulIcons';

interface SoulSelectProps {
  onPick: (soul: SoulId) => void;
}

/**
 * Arrow in the old ◀ ▶ shape, softened with a pixelated blur: the triangle is blurred, then
 * sampled into square blocks, so its edge fades out in steps.
 */
const ARROW_BLOCK = 3; // block size in viewBox units (smaller = finer pixels)

function PixelArrow({ left }: { left?: boolean }) {
  const id = `arrow-px-${left ? 'l' : 'r'}`;
  const b = ARROW_BLOCK;
  return (
    <svg
      viewBox="0 0 48 66"
      className="w-[34px] h-[47px] sm:w-[42px] sm:h-[58px]"
      style={{ transform: left ? 'scaleX(-1)' : undefined, overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <filter id={id} filterUnits="userSpaceOnUse" x={0} y={0} width={48} height={66}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={2.4} result="soft" />
          <feFlood x={b / 2 - 0.5} y={b / 2 - 0.5} width={1} height={1} />
          <feComposite width={b} height={b} />
          <feTile result="grid" />
          <feComposite in="soft" in2="grid" operator="in" />
          <feMorphology operator="dilate" radius={b / 2} />
        </filter>
      </defs>
      <polygon points="11,10 39,33 11,56" fill="currentColor" filter={`url(#${id})`} />
    </svg>
  );
}

/**
 * Run start: one soul at a time on a dark field, assembling with its own sound, name underneath
 * in the terminal font. ◀ ▶ (or ←/→, A/D) flip between souls; Enter/Space or a click on the
 * symbol picks it.
 */
export function SoulSelect({ onPick }: SoulSelectProps) {
  const [index, setIndex] = useState(0);
  const soul = SOULS[index];
  const step = (dir: number) => setIndex((i) => (i + dir + SOULS.length) % SOULS.length);

  // Every time a soul comes up, it forms again with its sound (the previous one fades out)
  useEffect(() => {
    const stop = synthAudio.playSoulForm(soul.id, SOUL_FORM_TIME[soul.id], true);
    return () => stop(0.35);
  }, [soul.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        step(1);
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        step(-1);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onPick(soul.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [soul.id, onPick]);

  const arrow = 'p-3 text-[#5a5650] hover:text-[#e9e4d8] focus-visible:text-[#e9e4d8] transition-colors bg-transparent outline-none';

  return (
    <div role="dialog" aria-modal="true" aria-label="Escolha sua alma" className="fixed inset-0 z-30 flex items-center justify-center bg-[#030304]">
      <div className="flex items-center gap-4 sm:gap-14">
        <button type="button" aria-label="Alma anterior" onClick={() => step(-1)} className={arrow}>
          <PixelArrow left />
        </button>

        <button type="button" onClick={() => onPick(soul.id)} className="flex flex-col items-center gap-6 bg-transparent outline-none w-[180px] sm:w-[240px]">
          <div key={soul.id} className="soul-pick w-40 h-40 sm:w-56 sm:h-56">
            <SoulGlyph soul={soul.id} className="w-full h-full" animate live pixel={56} />
          </div>
          <span
            key={`n-${soul.id}`}
            className="soul-pick font-terminal text-[34px] sm:text-[42px] leading-none tracking-[0.2em]"
            style={{ color: soul.color, filter: 'blur(0.8px)', textShadow: `0 0 10px ${soul.color}, 0 0 24px ${soul.color}99` }}
          >
            {soul.name}
          </span>
        </button>

        <button type="button" aria-label="Próxima alma" onClick={() => step(1)} className={arrow}>
          <PixelArrow />
        </button>
      </div>
    </div>
  );
}
