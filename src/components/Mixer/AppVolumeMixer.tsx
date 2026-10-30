import { useEffect } from 'react';
import { useAudioStore } from '../../stores/audioStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Music, MessageSquare, Gamepad2, Settings } from 'lucide-react';

const AppIcon = ({ name }: { name: string }) => {
  const n = name.toLowerCase();
  if (n.includes('spotify') || n.includes('music')) return <Music size={20} />;
  if (n.includes('discord') || n.includes('messenger')) return <MessageSquare size={20} />;
  if (n.includes('chrome') || n.includes('browser')) return <Settings size={20} />;
  if (n.includes('.exe')) return <Gamepad2 size={20} />;
  return <Volume2 size={20} />;
};

export const AppVolumeMixer = () => {
  const { sessions, fetchSessions, updateSessionVolume, toggleSessionMute } = useAudioStore();

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">App Volume Mixer</h2>
          <p className="text-text-dim text-sm">Adjust audio levels for individual applications.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {sessions.map((session) => (
            <motion.div
              key={session.process_id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="premium-card glass p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent-primary/10 text-accent-primary">
                    <AppIcon name={session.name} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm truncate w-32" title={session.name}>
                      {session.name.replace('.exe', '')}
                    </h4>
                    <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">PID: {session.process_id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleSessionMute(session.process_id, session.is_muted)}
                  className={`p-2 rounded-lg transition-colors ${session.is_muted ? 'bg-error/20 text-error' : 'hover:bg-white/5 text-text-dim'}`}
                >
                  {session.is_muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold text-text-dim uppercase tracking-tight">
                  <span>Volume</span>
                  <span>{Math.round(session.volume * 100)}%</span>
                </div>
                <div className="relative h-6 flex items-center group">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={session.volume}
                    onChange={(e) => updateSessionVolume(session.process_id, parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent-primary group-hover:h-2 transition-all"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
