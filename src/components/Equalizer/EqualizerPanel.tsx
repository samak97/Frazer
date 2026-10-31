import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { SlidersHorizontal, RotateCcw, Sparkles, MousePointerClick, AlertTriangle } from 'lucide-react';
import {
  CUSTOM_EQ_INDEX,
  CYCLE_CHOICES,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  RECOMMENDED_EQ,
  useHeadsetStore,
} from '../../stores/headsetStore';
import { DeviceNotice } from '../common/DeviceNotice';
import { Card, CardTitle, Page, item } from '../common/Page';

const BANDS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const FLAT = BANDS.map(() => 0);
const RANGE = EQ_MAX_DB - EQ_MIN_DB;
/** Graph geometry (SVG units): one column per band. */
const W = 1000;
const H = 240;
const PAD = 22;

const yOf = (db: number) => PAD + ((EQ_MAX_DB - db) / RANGE) * (H - 2 * PAD);
const xOf = (i: number) => (W / BANDS.length) * (i + 0.5);

/** Smooth curve through the band points (Catmull-Rom converted to cubic Béziers). */
function curvePath(gains: number[]) {
  const pts = gains.map((g, i) => [xOf(i), yOf(g)] as const);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const EqGraph = ({ gains, onChange }: { gains: number[]; onChange: (band: number, db: number) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  const dbAt = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = (clientY - r.top) / r.height;
    const svgY = t * H;
    const db = EQ_MAX_DB - ((svgY - PAD) / (H - 2 * PAD)) * RANGE;
    return Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, Math.round(db)));
  };

  const move = (e: React.PointerEvent) => {
    if (dragging.current == null) return;
    const db = dbAt(e.clientY);
    if (db !== gains[dragging.current]) onChange(dragging.current, db);
  };

  const line = curvePath(gains);
  return (
    <div>
      <div
        ref={ref}
        className="relative h-64 touch-none"
        onPointerMove={move}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <linearGradient id="eqStroke" x1="0" x2="1">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset="1" stopColor="#3df5b0" />
            </linearGradient>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3df5b0" stopOpacity="0.28" />
              <stop offset="1" stopColor="#3df5b0" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[EQ_MAX_DB, 0, EQ_MIN_DB].map((db) => (
            <line key={db} x1="0" x2={W} y1={yOf(db)} y2={yOf(db)} stroke="rgba(255,255,255,0.07)" strokeDasharray={db === 0 ? '' : '4 6'} vectorEffect="non-scaling-stroke" />
          ))}
          {BANDS.map((_, i) => (
            <line key={i} x1={xOf(i)} x2={xOf(i)} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.04)" vectorEffect="non-scaling-stroke" />
          ))}
          <motion.path animate={{ d: `${line} L ${xOf(9)} ${H} L ${xOf(0)} ${H} Z` }} transition={{ type: 'spring', stiffness: 220, damping: 26 }} fill="url(#eqFill)" />
          <motion.path animate={{ d: line }} transition={{ type: 'spring', stiffness: 220, damping: 26 }} fill="none" stroke="url(#eqStroke)" strokeWidth="3" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 6px rgba(61,245,176,0.5))' }} />
        </svg>

        {gains.map((g, i) => (
          <motion.button
            key={i}
            aria-label={`${BANDS[i]} Hz`}
            onPointerDown={(e) => {
              // Capture on the graph so the drag keeps tracking outside the knob.
              ref.current?.setPointerCapture(e.pointerId);
              dragging.current = i;
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') onChange(i, Math.min(EQ_MAX_DB, g + 1));
              if (e.key === 'ArrowDown') onChange(i, Math.max(EQ_MIN_DB, g - 1));
            }}
            animate={{ top: `${(yOf(g) / H) * 100}%` }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            whileHover={{ scale: 1.25 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-[0_0_0_5px_rgba(61,245,176,0.22),0_4px_12px_rgba(0,0,0,0.6)] cursor-grab active:cursor-grabbing focus:outline-none focus:shadow-[0_0_0_7px_rgba(61,245,176,0.4)]"
            style={{ left: `${(xOf(i) / W) * 100}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-10 mt-3">
        {BANDS.map((f, i) => (
          <div key={f} className="text-center">
            <p className="text-xs font-mono text-fg-muted tabular-nums">{gains[i] > 0 ? '+' : ''}{gains[i]}</p>
            <p className="text-[10px] text-fg-dim mt-0.5">{f >= 1000 ? `${f / 1000}k` : f}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const EqualizerPanel = () => {
  const { settings, loadSettings, loadConfig, applyEq, buttonCycle, toggleCycleEntry } = useHeadsetStore();

  useEffect(() => {
    loadSettings();
    loadConfig();
  }, [loadSettings, loadConfig]);

  if (!settings?.eq_bands) return <DeviceNotice title="Equalizer" />;

  const gains = settings.eq_bands;
  const activePreset = settings.eq_preset;
  const isCustom = activePreset === CUSTOM_EQ_INDEX;
  const activeRecommended = isCustom ? RECOMMENDED_EQ.find((r) => r.bands.every((b, i) => b === gains[i]))?.name : undefined;

  const setBand = (index: number, value: number) => {
    const next = [...gains];
    next[index] = value;
    applyEq(CUSTOM_EQ_INDEX, next, 'Custom');
  };

  return (
    <Page
      title="Equalizer"
      subtitle="Stored on the headset, so it follows you to any PC or console."
      actions={
        <button onClick={() => applyEq(CUSTOM_EQ_INDEX, FLAT, 'Flat')} className="chip chip-idle flex items-center gap-2">
          <RotateCcw size={14} /> Flat
        </button>
      }
    >
      {settings.eq_enabled === false && (
        <motion.div variants={item} className="surface !rounded-2xl p-4 flex gap-3 text-sm border-amber/30">
          <AlertTriangle size={18} className="text-amber shrink-0 mt-0.5" />
          <p className="text-fg-muted">
            The headset's EQ is switched off. Synapse does this while its THX Spatial is on. Pick any preset to switch it back on, and quit Synapse completely so it stays on.
          </p>
        </motion.div>
      )}

      <Card>
        <CardTitle icon={SlidersHorizontal} title="10-band EQ" hint="Drag the points (−5 to +5 dB). Tip: for full volume keep the curve gentle and near the top. Wide curves that reach far down sound quieter." />
        <div className="flex flex-wrap gap-2 mb-6">
          {[...EQ_PRESETS, { name: 'Custom', index: CUSTOM_EQ_INDEX, bands: gains }].map((p) => (
            <button
              key={p.name}
              onClick={() => applyEq(p.index, p.bands, p.name)}
              className={`chip ${activePreset === p.index && !activeRecommended ? 'chip-active' : 'chip-idle'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <EqGraph gains={gains} onChange={setBand} />
      </Card>

      <Card>
        <CardTitle icon={Sparkles} title="Recommended" hint="Tuned for this headset. Saved to the Custom slot." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {RECOMMENDED_EQ.map((r) => {
            const active = activeRecommended === r.name;
            return (
              <motion.button
                key={r.name}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => applyEq(CUSTOM_EQ_INDEX, r.bands, r.name)}
                className={`relative text-left p-4 rounded-2xl border overflow-hidden transition-colors ${
                  active ? 'border-mint/60 bg-mint/[0.07]' : 'border-line bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 bottom-1 h-10 w-full opacity-40">
                  <path d={curvePath(r.bands)} fill="none" stroke="#3df5b0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="relative">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-fg-muted mt-1">{r.use}</p>
                  <p className="text-[10px] text-fg-dim mt-3 uppercase tracking-wider pb-12">{r.source}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle
          icon={MousePointerClick}
          title="Headset EQ button"
          hint="Each press of the button on the headset steps to the next preset you pick here, in this order."
        />
        <div className="flex flex-wrap gap-2">
          {CYCLE_CHOICES.map((c) => {
            const pos = buttonCycle.indexOf(c.name!);
            return (
              <motion.button
                key={c.name}
                layout
                onClick={() => toggleCycleEntry(c.name!)}
                className={`chip flex items-center gap-2 ${pos >= 0 ? 'chip-active' : 'chip-idle'}`}
              >
                {pos >= 0 && <span className="w-4 h-4 rounded-full bg-ink-950/25 text-[10px] flex items-center justify-center">{pos + 1}</span>}
                {c.name}
              </motion.button>
            );
          })}
        </div>
        {buttonCycle.length === 0 && <p className="text-xs text-fg-dim mt-3">Nothing selected: the button keeps the headset's own behaviour.</p>}
      </Card>
    </Page>
  );
};
