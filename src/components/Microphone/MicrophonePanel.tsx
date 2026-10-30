import { useEffect, useState } from 'react';
import { Mic, MicOff, Ear } from 'lucide-react';
import { MIC_EQ_PRESETS, useHeadsetStore } from '../../stores/headsetStore';
import { DeviceNotice } from '../common/DeviceNotice';
import { Toggle } from '../common/Toggle';

export const MicrophonePanel = () => {
  const { settings, loadSettings, setSidetone, setMicMute, setMicEqPreset } = useHeadsetStore();
  // Slider moves locally and commits on release, so dragging doesn't flood the headset.
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (!settings) return <DeviceNotice title="Microphone" />;

  const sidetoneOn = settings.sidetone_enabled ?? false;
  const sidetoneLevel = level ?? settings.sidetone_level ?? 0;
  const muted = settings.mic_muted ?? false;
  const commitLevel = () => {
    if (level !== null) setSidetone(sidetoneOn, level);
    setLevel(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Microphone</h2>
        <p className="text-text-dim mt-1">Mute, sidetone and mic EQ, applied directly on the headset.</p>
      </div>

      <div className="premium-card glass p-8 flex items-center gap-6">
        {muted ? <MicOff className="text-error" /> : <Mic className="text-accent-primary" />}
        <div className="flex-1">
          <h3 className="text-xl font-bold">Mic {muted ? 'muted' : 'live'}</h3>
          <p className="text-sm text-text-dim">Same as the mute button on the headset.</p>
        </div>
        <Toggle checked={!muted} onChange={(on) => setMicMute(!on)} label="Microphone enabled" />
      </div>

      <div className="premium-card glass p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Ear className="text-accent-primary" />
          <h3 className="text-xl font-bold flex-1">Sidetone</h3>
          <Toggle checked={sidetoneOn} onChange={(on) => setSidetone(on, sidetoneLevel)} label="Sidetone enabled" />
        </div>
        <div className={sidetoneOn ? '' : 'opacity-40 pointer-events-none'}>
          <div className="flex justify-between text-sm font-bold text-text-dim uppercase tracking-tight mb-2">
            <span>Volume</span>
            <span>{sidetoneLevel}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={sidetoneLevel}
            onChange={(e) => setLevel(parseInt(e.target.value, 10))}
            onPointerUp={commitLevel}
            onKeyUp={commitLevel}
            className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent-primary"
          />
        </div>
        <p className="text-sm text-text-dim leading-relaxed max-w-2xl">
          Sidetone lets you hear your own voice through the headset, so you don't end up shouting.
        </p>
      </div>

      <div className="premium-card glass p-8">
        <h3 className="text-xl font-bold mb-6">Mic EQ</h3>
        <div className="flex gap-2 flex-wrap">
          {MIC_EQ_PRESETS.map((p) => (
            <button
              key={p.index}
              onClick={() => setMicEqPreset(p.index)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                settings.mic_eq_preset === p.index
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-text-dim hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
