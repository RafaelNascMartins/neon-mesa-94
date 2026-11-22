import { useCallback, useEffect, useRef, useState } from 'react';
import { synthAudio, type VmClip } from '../game/audio';
import type { VmItemId, VmShopState } from '../game/types';
import { ItemIcon } from './SvgIcons';

/**
 * Conversation with VM, the vending-machine merchant. The player never speaks; they pick a
 * topic and only VM answers (recorded lines, typed out as subtitles while he talks).
 */

interface VmDialogProps {
  getShop: () => VmShopState;
  onBuy: (id: VmItemId) => { ok: boolean; message: string };
  onClose: () => void;
}

type LineKey = 'greet' | 'wanna' | 'hey' | 'bossAsk' | 'bossProps' | 'bossMad' | 'what' | 'name' | 'why' | 'like' | 'gf' | 'thanks';

const LINES: Record<LineKey, { text: string; clips: VmClip[] }> = {
  greet: { text: 'sup, wanna buy something?', clips: ['sup', 'wanna'] },
  wanna: { text: 'wanna buy something?', clips: ['wanna'] },
  hey: { text: 'hey', clips: ['hey'] },
  bossAsk: { text: 'hey, was that you that took down the big guy?', clips: ['hey', 'wasThatYou', 'tookDown'] },
  bossProps: { text: 'yeah, props to you, flesh', clips: ['props'] },
  bossMad: { text: "now he's mad", clips: ['now', 'hes', 'mad'] },
  what: { text: 'what', clips: ['what'] },
  name: { text: "my name? it's VM", clips: ['myName', 'its', 'vi', 'em'] },
  why: { text: "i don't know, i wasn't programmed to think, just sell", clips: ['dunno'] },
  like: { text: 'yeah', clips: ['yeah'] },
  gf: { text: 'duh, of course', clips: ['duh', 'ofCourse'] },
  thanks: { text: 'thanks for the credits, organic', clips: ['thanks'] },
};

type View = 'main' | 'talk' | 'shop';

interface Option {
  label: string;
  action: () => void;
}

export function VmDialog({ getShop, onBuy, onClose }: VmDialogProps) {
  const [view, setView] = useState<View>('main');
  const [fullText, setFullText] = useState('');
  const [typed, setTyped] = useState(0);
  const [shop, setShop] = useState<VmShopState>(() => getShop());
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  const boughtThisVisit = useRef(0);
  const sayToken = useRef(0);

  /** VM speaks a line: plays the clips and types the subtitle over the clip's length. */
  const say = useCallback((key: LineKey, chained = false): Promise<number> => {
    const line = LINES[key];
    const token = chained ? sayToken.current : ++sayToken.current;
    setFullText(line.text);
    setTyped(0);
    return synthAudio.playVmLine(line.clips).then((dur) => {
      if (token !== sayToken.current) return dur;
      const total = Math.max(0.25, Math.min(dur * 0.85, line.text.length * 0.06));
      const start = performance.now();
      const tick = () => {
        if (token !== sayToken.current) return;
        const u = Math.min(1, (performance.now() - start) / 1000 / total);
        setTyped(Math.ceil(u * line.text.length));
        if (u < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return dur;
    });
  }, []);

  /** Several lines back to back (any new line the player triggers cuts the chain). */
  const sayChain = useCallback(
    async (keys: LineKey[]) => {
      const token = ++sayToken.current;
      for (let i = 0; i < keys.length; i++) {
        if (token !== sayToken.current) return;
        const dur = await say(keys[i], true);
        if (i < keys.length - 1) await new Promise((r) => setTimeout(r, dur * 1000 + 350));
      }
    },
    [say]
  );

  useEffect(() => {
    const greeting = getShop().greeting;
    if (greeting === 'firstBoss') sayChain(['bossAsk', 'bossProps', 'bossMad', 'wanna']);
    else if (greeting === 'boss') sayChain(['bossAsk', 'bossProps', 'bossMad']);
    else if (greeting === 'again') say('hey');
    else say('greet');
    return () => {
      sayToken.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say, sayChain]);

  const leaveShop = useCallback(() => {
    setView('main');
    setShopMsg(null);
    if (boughtThisVisit.current > 0) {
      boughtThisVisit.current = 0;
      say('thanks');
    }
  }, [say]);

  const options: Option[] =
    view === 'main'
      ? [
          {
            label: 'LOJA',
            action: () => {
              setShop(getShop());
              setShopMsg(null);
              setView('shop');
            },
          },
          {
            label: 'CONVERSAR',
            action: () => {
              setView('talk');
              say('what');
            },
          },
          { label: 'SAIR', action: onClose },
        ]
      : view === 'talk'
        ? [
            { label: 'QUAL É O SEU NOME?', action: () => say('name') },
            { label: 'POR QUE VOCÊ ME AJUDA?', action: () => say('why') },
            { label: 'VOCÊ GOSTA DAQUI?', action: () => say('like') },
            { label: 'VOCÊ TEM NAMORADA?', action: () => say('gf') },
            { label: 'VOLTAR', action: () => setView('main') },
          ]
        : [];

  const buy = (id: VmItemId) => {
    const res = onBuy(id);
    setShopMsg(res.message);
    if (res.ok) boughtThisVisit.current++;
    setShop(getShop());
  };

  // Keyboard: number keys pick options / items, Esc backs out
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (view === 'shop') leaveShop();
        else if (view === 'talk') setView('main');
        else onClose();
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      if (view === 'shop') {
        const item = shop.items[n - 1];
        if (item) buy(item.id);
      } else {
        options[n - 1]?.action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="hud fixed inset-0 z-30 flex flex-col justify-end items-center pb-6 sm:pb-10 px-3" data-zone="tree">
      {view === 'shop' && (
        <div className="px-window w-full max-w-[780px] mb-5 flex flex-col max-h-[62vh]">
          <div className="px-titlebar">
            <span>vm://loja</span>
            <span className="tabular-nums">créditos ¢{shop.credits}</span>
          </div>
          <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          {/* Gungeon-style item cards: big sprite, name, what it does, price */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-0.5">
            {shop.items.map((item, i) => {
              const affordable = shop.credits >= item.price;
              const disabled = item.soldOut || !affordable;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.soldOut}
                  onClick={() => buy(item.id)}
                  className="px-card vm-card relative flex flex-col items-center gap-2 px-2 pt-3 pb-2.5 text-center disabled:cursor-not-allowed"
                  style={{ opacity: disabled ? 0.45 : 1 }}
                >
                  <span className="hud-key absolute top-1.5 left-1.5">{i + 1}</span>
                  <ItemIcon id={item.id} className="w-14 h-14 sm:w-16 sm:h-16" />
                  <span className="text-[14px] sm:text-[15px] leading-none uppercase tracking-[0.04em] px-shadow">{item.name}</span>
                  <span className="text-[12px] sm:text-[13px] leading-tight" style={{ color: 'var(--px-muted)' }}>
                    {item.desc}
                  </span>
                  <span className="text-[18px] leading-none tabular-nums mt-auto px-shadow" style={{ color: item.soldOut ? 'var(--px-muted)' : affordable ? 'var(--px-accent)' : 'var(--px-danger)' }}>
                    {item.soldOut ? 'INSTALADO' : `¢${item.price}`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="px-label" style={{ color: shopMsg ? 'var(--px-bone)' : undefined }}>
              {shopMsg ?? 'Escolha um item'}
            </span>
            <button type="button" onClick={leaveShop} className="px-btn text-[14px] px-3 py-1.5">
              <span className="hud-key">ESC</span>Voltar
            </button>
          </div>
          </div>
        </div>
      )}

      {/* VM's subtitle box */}
      <div className="px-window w-full max-w-[780px] px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-1 text-[13px] leading-none tracking-[0.1em] text-black" style={{ backgroundColor: 'var(--px-cyan)' }}>
            VM
          </span>
          <span className="px-label text-[10px]">vending machine</span>
        </div>
        <p className="font-terminal text-[26px] sm:text-[34px] leading-[1.05] text-[var(--px-bone)] min-h-[1.1em]">
          {fullText.slice(0, typed)}
          <span className="hud-pulse">▌</span>
        </p>
        {options.length > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-x-6">
            {options.map((o, i) => (
              <button
                key={o.label}
                type="button"
                onClick={o.action}
                className="vm-option flex items-center gap-2 text-left text-[17px] uppercase tracking-[0.05em] px-1 py-0.5"
              >
                <span className="hud-key">{i + 1}</span>
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
