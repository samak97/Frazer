import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, AppWindow, Bell } from 'lucide-react';
import { useAudioStore, type AudioSession } from '../../stores/audioStore';
import { Page, item } from '../common/Page';

const AppIcon = ({ session }: { session: AudioSession }) => {
  if (session.icon) return <img src={session.icon} alt="" className="w-8 h-8 object-contain drop-shadow" />;
  const Icon = session.id === 'system' ? Bell : AppWindow;
  return <Icon size={22} className="text-mint" />;
};

const Row = ({ session }: { session: AudioSession }) => {
  const { updateSessionVolume, toggleSessionMute } = useAudioStore();
  const pct = Math.round(session.volume * 100);

  return (
    <motion.div
      layout
      variants={item}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`surface surface-hover p-4 flex items-center gap-4 ${session.is_muted ? 'opacity-60' : ''}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-line flex items-center justify-center shrink-0">
        <AppIcon session={session} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold truncate" title={session.name}>{session.name}</p>
          <span className="text-xs font-mono text-fg-muted tabular-nums">{session.is_muted ? 'muted' : `${pct}%`}</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={session.volume}
          onChange={(e) => updateSessionVolume(session.id, parseFloat(e.target.value))}
          className="slider mt-1.5"
          style={{ ['--fill' as string]: `${pct}%` }}
          aria-label={`${session.name} volume`}
        />
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => toggleSessionMute(session.id)}
        aria-label={session.is_muted ? 'Unmute' : 'Mute'}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          session.is_muted ? 'bg-coral/15 text-coral' : 'text-fg-muted hover:bg-white/[0.06] hover:text-fg'
        }`}
      >
        {session.is_muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </motion.button>
    </motion.div>
  );
};

export const AppVolumeMixer = () => {
  const { sessions, fetchSessions } = useAudioStore();

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 3000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  return (
    <Page title="Volume Mixer" subtitle="Per-app volume on your default output device.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AnimatePresence>
          {sessions.map((s) => (
            <Row key={s.id} session={s} />
          ))}
        </AnimatePresence>
      </div>
      {sessions.length === 0 && <motion.p variants={item} className="text-fg-dim text-sm">No apps are playing audio right now.</motion.p>}
    </Page>
  );
};
