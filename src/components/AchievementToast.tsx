import { useEffect } from 'react';
import { achievementIconUrl, type AchievementDef } from '../game/achievements';
import { SKIN_MAP } from '../game/config';

interface AchievementToastProps {
  def: AchievementDef;
  onDone: () => void;
}

/** "Conquista desbloqueada" card that drops in at the top of the screen, then slides away. */
export function AchievementToast({ def, onDone }: AchievementToastProps) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 4300);
    return () => window.clearTimeout(id);
  }, [def, onDone]);

  return (
    <div className="ach-toast" role="status" aria-live="polite" key={def.id}>
      <img src={achievementIconUrl(def.id)} alt="" aria-hidden="true" />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="ach-kicker">🏆 Conquista desbloqueada</span>
        <span className="ach-title">{def.title}</span>
        <span className="ach-desc">{def.desc}</span>
        {def.skin && <span className="ach-skin">+ Skin liberada: {SKIN_MAP[def.skin].name}</span>}
      </div>
    </div>
  );
}
