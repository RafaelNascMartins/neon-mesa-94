import { useEffect, useRef, useState } from 'react';
import { synthAudio } from '../game/audio';

/**
 * Boot sequence shown when a run starts from the title: a terminal session where the driver
 * — right now, out on the highway in the Mustang — hops from folder to folder, gets refused
 * at /DataTree, and someone opens `vim run.sh` to edit their way in. `:wq` drops into the game.
 */

type Step =
  | { kind: 'out'; text: string; delay?: number }
  | { kind: 'cmd'; prompt: string; text: string }
  | { kind: 'pause'; ms: number }
  | { kind: 'vim' }
  | { kind: 'vimType'; text: string }
  | { kind: 'end' };

const P = (cwd: string) => `drifter@mustang:${cwd}$ `;

const SCRIPT: Step[] = [
  { kind: 'out', text: 'DataTree OS 0.94 (tty1)', delay: 120 },
  { kind: 'out', text: '', delay: 60 },
  { kind: 'cmd', prompt: 'login: ', text: 'drifter' },
  { kind: 'out', text: 'password: ********', delay: 260 },
  { kind: 'out', text: '[  OK  ] Mounted /wasteland.', delay: 140 },
  { kind: 'out', text: '[  OK  ] Started mustang.service (V8, 5.0L).', delay: 140 },
  { kind: 'out', text: '[ WARN ] Passenger seat: empty.', delay: 260 },
  { kind: 'out', text: '', delay: 80 },
  { kind: 'cmd', prompt: P('/wasteland/highway/route_66/mile_401'), text: 'cd ../mile_402' },
  { kind: 'cmd', prompt: P('/wasteland/highway/route_66/mile_402'), text: 'cd ../mile_403' },
  { kind: 'cmd', prompt: P('/wasteland/highway/route_66/mile_403'), text: 'cd ../../../desert/motel' },
  { kind: 'cmd', prompt: P('/wasteland/desert/motel'), text: 'ls' },
  { kind: 'out', text: 'NO_VACANCY.txt   bandits/   ice_machine.bin', delay: 200 },
  { kind: 'cmd', prompt: P('/wasteland/desert/motel'), text: 'cd /DataTree' },
  { kind: 'out', text: 'bash: cd: /DataTree: Permission denied', delay: 420 },
  { kind: 'cmd', prompt: P('/wasteland/desert/motel'), text: 'vim ~/run.sh' },
  { kind: 'pause', ms: 250 },
  { kind: 'vim' },
  { kind: 'pause', ms: 700 },
  { kind: 'vimType', text: ':wq' },
  { kind: 'pause', ms: 380 },
  { kind: 'end' },
];

const VIM_BUFFER = [
  '#!/bin/sh',
  "# don't stop.",
  'export TARGET=/DataTree',
  './mustang --floor-it --through bandits/',
];

interface TerminalBootProps {
  onDone: () => void;
}

export function TerminalBoot({ onDone }: TerminalBootProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [typing, setTyping] = useState<string>('');
  const [vim, setVim] = useState(false);
  const [vimStatus, setVimStatus] = useState('"~/run.sh" 4L, 77B');
  const [glitch, setGlitch] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const typeOut = async (prefix: string, text: string, commit: (full: string) => void) => {
      for (let i = 1; i <= text.length; i++) {
        if (cancelled) return;
        setTyping(prefix + text.slice(0, i));
        synthAudio.playKeyClick();
        await wait(38 + Math.random() * 55);
      }
      await wait(120);
      commit(prefix + text);
      setTyping('');
    };

    (async () => {
      await wait(250);
      for (const step of SCRIPT) {
        if (cancelled) return;
        if (step.kind === 'out') {
          setLines((l) => [...l, step.text]);
          await wait(step.delay ?? 120);
        } else if (step.kind === 'cmd') {
          setTyping(step.prompt);
          await wait(220);
          await typeOut(step.prompt, step.text, (full) => setLines((l) => [...l, full]));
        } else if (step.kind === 'pause') {
          await wait(step.ms);
        } else if (step.kind === 'vim') {
          setVim(true);
        } else if (step.kind === 'vimType') {
          await typeOut('', step.text, () => undefined);
          setVimStatus('"~/run.sh" 4L, 77B written');
        } else if (step.kind === 'end') {
          setGlitch(true);
          synthAudio.playCrtGlitch();
          await wait(420);
          if (!cancelled) finish();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any key / click skips
  useEffect(() => {
    const skip = (e: Event) => {
      e.preventDefault();
      finish();
    };
    const t = setTimeout(() => {
      window.addEventListener('keydown', skip);
      window.addEventListener('pointerdown', skip);
    }, 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // Outer layer stays solid black the whole time (so nothing behind ever flashes through);
    // only the screen content collapses in the CRT power-off.
    <div className="fixed inset-0 z-50 bg-black overflow-hidden select-none">
    <div
      className="absolute inset-0 bg-black"
      style={{ animation: glitch ? 'crtOff 420ms steps(6, end) forwards' : undefined }}
    >
      <div className="absolute inset-0 p-6 sm:p-10 font-terminal text-[15px] sm:text-[19px] leading-[1.45] text-[#e9e4d8]">
        {!vim ? (
          <>
            {lines.map((l, i) => (
              <div
                key={i}
                className="whitespace-pre-wrap"
                style={{
                  color: l.startsWith('bash:') ? '#ff3b3b' : l.startsWith('[ WARN') ? '#ffb020' : l.startsWith('[  OK') ? '#8f897d' : undefined,
                }}
              >
                {l || ' '}
              </div>
            ))}
            <div className="whitespace-pre-wrap">
              {typing}
              <span className="inline-block w-[0.6em] h-[1.1em] align-[-0.15em] bg-[#e9e4d8] hud-pulse" />
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full">
            {VIM_BUFFER.map((l, i) => (
              <div key={i} className="whitespace-pre">
                <span className="text-[#4b4f58] inline-block w-8 text-right mr-3">{i + 1}</span>
                <span style={{ color: i === 2 ? '#ff2a3c' : i < 2 ? '#8f897d' : undefined }}>{l}</span>
              </div>
            ))}
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={`t${i}`} className="text-[#2e6bff]">
                ~
              </div>
            ))}
            <div className="mt-auto flex justify-between bg-[#e9e4d8] text-black px-2">
              <span>{typing ? typing : vimStatus}</span>
              <span>4,1 All</span>
            </div>
          </div>
        )}
      </div>

      {/* CRT: scanlines + vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px)',
          boxShadow: 'inset 0 0 160px rgba(0,0,0,0.95)',
        }}
      />
      <div className="absolute bottom-4 right-5 font-pixel text-[12px] tracking-[0.12em] text-[#4b4f58]">
        QUALQUER TECLA PARA PULAR
      </div>
    </div>
    </div>
  );
}
