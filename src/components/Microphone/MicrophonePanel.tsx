import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Ear, AudioLines } from 'lucide-react';
import { MIC_EQ_PRESETS, useHeadsetStore } from '../../stores/headsetStore';
import { DeviceNotice } from '../common/DeviceNotice';
import { Toggle } from '../common/Toggle';
import { Card, CardTitle, Page, item } from '../common/Page';

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
    <Page title="Microphone" subtitle="Mute, sidetone and voice EQ, applied on the headset itself.">
      <motion.button
        variants={item}
        whileTap={{ scale: 0.985 }}
        onClick={() => setMicMute(!muted)}
        className={`surface w-full p-6 flex items-center gap-5 text-left transition-colors ${muted ? '!border-coral/40' : ''}`}
      >
        <div className="relative w-16 h-16 flex items-center justify-center">
          {!muted && <span className="absolute inset-0 rounded-2xl bg-mint/20 animate-ping [animation-duration:2.4s]" />}
          <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center ${muted ? 'bg-coral/15 text-coral' : 'accent-gradient text-ink-950'}`}>
            {muted ? <MicOff size={28} /> : <Mic size={28} />}
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xl font-semibold">{muted ? 'Mic muted' : 'Mic live'}</p>
          <p className="text-sm text-fg-muted mt-1">Click to {muted ? 'unmute' : 'mute'}. Same as the mute button on the headset.</p>
        </div>
      </motion.button>

      <Card>
        <CardTitle
          icon={Ear}
          title="Sidetone"
          hint="Hear your own voice so you don't end up shouting."
          right={<Toggle checked={sidetoneOn} onChange={(on) => setSidetone(on, sidetoneLevel)} label="Sidetone enabled" />}
        />
        <motion.div animate={{ opacity: sidetoneOn ? 1 : 0.35 }} className={sidetoneOn ? '' : 'pointer-events-none'}>
          <div className="flex justify-between text-xs text-fg-dim uppercase tracking-wider mb-2">
            <span>Volume</span>
            <span className="font-mono text-fg-muted">{sidetoneLevel}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={sidetoneLevel}
            onChange={(e) => setLevel(parseInt(e.target.value, 10))}
            onPointerUp={commitLevel}
            onKeyUp={commitLevel}
            className="slider"
            style={{ ['--fill' as string]: `${sidetoneLevel}%` }}
          />
        </motion.div>
      </Card>

      <Card>
        <CardTitle icon={AudioLines} title="Voice EQ" hint="Shapes how your mic sounds to others." />
        <div className="flex gap-2 flex-wrap">
          {MIC_EQ_PRESETS.map((p) => (
            <button key={p.index} onClick={() => setMicEqPreset(p.index)} className={`chip ${settings.mic_eq_preset === p.index ? 'chip-active' : 'chip-idle'}`}>
              {p.name}
            </button>
          ))}
        </div>
      </Card>
    </Page>
  );
};
