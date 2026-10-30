import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { SlidersHorizontal, RotateCcw, Sparkles } from 'lucide-react';
import {
  CUSTOM_EQ_INDEX,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  RECOMMENDED_EQ,
  useHeadsetStore,
} from '../../stores/headsetStore';
import { DeviceNotice } from '../common/DeviceNotice';

const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export const EqualizerPanel = () => {
  const { settings, loadSettings, applyEq } = useHeadsetStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (!settings?.eq_bands) return <DeviceNotice title="Equalizer" />;

  const gains = settings.eq_bands;
  const activePreset = settings.eq_preset;
  const isCustom = activePreset === CUSTOM_EQ_INDEX;
  const activeRecommended = isCustom
    ? RECOMMENDED_EQ.find((r) => r.bands.every((b, i) => b === gains[i]))?.name
    : undefined;

  const handleBandChange = (index: number, value: number) => {
    const newGains = [...gains];
    newGains[index] = value;
    applyEq(CUSTOM_EQ_INDEX, newGains);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Equalizer</h2>
          <p className="text-text-dim mt-1">Stored on the headset, so it applies on any PC or console.</p>
        </div>
        <button
          onClick={() => applyEq(CUSTOM_EQ_INDEX, FLAT)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-semibold"
        >
          <RotateCcw size={16} />
          Flat
        </button>
      </div>

      {settings.eq_enabled === false && (
        <div className="glass p-4 rounded-2xl border border-accent-secondary/40 text-sm text-text-secondary">
          The headset's EQ is switched off. Synapse does this while its THX Spatial is on. Pick a preset or move
          a slider to switch it back on. Quit Synapse completely so it doesn't switch it off again.
        </div>
      )}

      <div className="premium-card glass p-8">
        <div className="flex items-center gap-4 mb-6">
          <Sparkles className="text-accent-primary" />
          <h3 className="text-xl font-bold">Recommended</h3>
          <span className="text-xs text-text-dim">Saved to the Custom slot</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {RECOMMENDED_EQ.map((r) => (
            <button
              key={r.name}
              onClick={() => applyEq(CUSTOM_EQ_INDEX, r.bands)}
              className={`text-left p-4 rounded-2xl border transition-all ${
                activeRecommended === r.name
                  ? 'bg-accent-primary/15 border-accent-primary/60'
                  : 'bg-white/5 border-white/5 hover:bg-white/10'
              }`}
            >
              <div className="font-bold">{r.name}</div>
              <div className="text-xs text-text-secondary mt-1">{r.use}</div>
              <div className="text-[10px] text-text-dim mt-2 uppercase tracking-wider">{r.source}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="premium-card glass p-8">
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <SlidersHorizontal className="text-accent-primary" />
          <h3 className="text-xl font-bold">10-Band Equalizer</h3>

          <div className="ml-auto flex gap-2 flex-wrap">
            {[...EQ_PRESETS, { name: 'Custom', index: CUSTOM_EQ_INDEX, bands: gains }].map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyEq(preset.index, preset.bands)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  activePreset === preset.index
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-text-dim hover:text-text-primary hover:bg-white/5'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-end h-64 gap-2 px-4">
          {BANDS.map((freq, index) => {
            const gain = gains[index] ?? 0;
            const heightPercentage = ((gain - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB)) * 100;

            return (
              <div key={freq} className="flex flex-col items-center gap-4 w-full group">
                <div className="text-xs font-bold text-accent-primary">
                  {gain > 0 ? '+' : ''}{gain}dB
                </div>

                <div className="relative w-8 h-48 bg-black/40 rounded-full border border-white/5 flex items-end justify-center py-2">
                  <div className="absolute inset-0 flex flex-col justify-between py-2 items-center opacity-20 pointer-events-none">
                    <div className="w-2 h-[1px] bg-white"></div>
                    <div className="w-4 h-[1px] bg-white/50"></div>
                    <div className="w-2 h-[1px] bg-white"></div>
                  </div>

                  <input
                    type="range"
                    min={EQ_MIN_DB}
                    max={EQ_MAX_DB}
                    step="1"
                    value={gain}
                    onChange={(e) => handleBandChange(index, parseInt(e.target.value, 10))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 [writing-mode:vertical-lr] [direction:rtl]"
                  />

                  <motion.div
                    initial={false}
                    animate={{ height: `${heightPercentage}%` }}
                    className="w-2 bg-gradient-to-t from-accent-primary/50 to-accent-secondary rounded-full relative shadow-[0_0_10px_rgba(139,92,246,0.3)] transition-all duration-100 ease-out"
                  >
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-md" />
                  </motion.div>
                </div>

                <div className="text-xs font-medium text-text-dim mt-2 uppercase tracking-tight">
                  {freq >= 1000 ? `${freq / 1000}k` : freq}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
