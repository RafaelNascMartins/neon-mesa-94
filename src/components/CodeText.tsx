import { useEffect, useState, type ReactNode } from 'react';

/**
 * Code-book bits for the backpack / almanac: a typed-out intro ("almanaque: { … }") and
 * syntax-highlighted object blocks with a line-number gutter.
 */

/** Colours a line of pseudo-JS: keys, strings, numbers, comments, punctuation. */
export function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?)|(\b\d+(?:\/\d+)?\b)|(\b(?:const|import|from|true|false|null)\b)|([A-Za-z_][\w.]*)(?=\s*[:(=])|([{}[\](),;:=>])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const cls = m[1] ? 'tok-comment' : m[2] ? 'tok-string' : m[3] ? 'tok-number' : m[4] ? 'tok-keyword' : m[5] ? 'tok-key' : 'tok-punct';
    out.push(
      <span key={k++} className={cls}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** Types a code snippet out fast, then calls onDone. Click to skip. */
export function CodeIntro({ code, onDone, speed = 260 }: { code: string; onDone: () => void; speed?: number }) {
  const [n, setN] = useState(0);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    const start = performance.now();
    let raf = 0;
    let doneAt = 0;
    const tick = () => {
      const c = Math.min(code.length, Math.floor(((performance.now() - start) / 1000) * speed));
      setN(c);
      if (c >= code.length) {
        if (!doneAt) doneAt = performance.now();
        if (performance.now() - doneAt > 280) {
          onDone();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [code, onDone, speed, reduced]);
  const lines = code.slice(0, n).split('\n');
  return (
    <button type="button" className="code-intro" onClick={onDone} aria-label="Pular">
      {lines.map((l, i) => (
        <div key={i} className="code-line">
          <span className="code-gutter">{i + 1}</span>
          <span>
            {highlight(l)}
            {i === lines.length - 1 && <span className="code-caret">▌</span>}
          </span>
        </div>
      ))}
    </button>
  );
}

/** A `const name = { key: value, … }` block with line numbers. */
export function CodeBlock({ name, fields, comment, start = 1 }: { name: string; fields: [string, string | number][]; comment?: string; start?: number }) {
  const lines: string[] = [`const ${name} = {`];
  for (const [k, v] of fields) lines.push(`  ${k}: ${typeof v === 'number' ? v : JSON.stringify(v)},`);
  lines.push('};');
  if (comment) lines.push(`// ${comment}`);
  return (
    <div className="code-block">
      {lines.map((l, i) => (
        <div key={i} className="code-line code-line-wrap almanac-in" style={{ animationDelay: `${i * 30}ms` }}>
          <span className="code-gutter">{start + i}</span>
          <span>{highlight(l)}</span>
        </div>
      ))}
    </div>
  );
}

/** Turns a display name into a code identifier ("ARACHNID.EXE" → arachnid_exe). */
export function ident(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'item'
  );
}
