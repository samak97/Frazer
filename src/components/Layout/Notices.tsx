import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { useSynapseStore } from '../../stores/synapseStore';
import { onEqApplied } from '../../utils/tauri-bridge';

/** Warns while Synapse's engine runs, since it fights Frazer over the EQ button and EQ. */
export const SynapseBanner = () => {
  const { status, error, stop } = useSynapseStore();
  return (
    <AnimatePresence>
      {status?.running && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="surface !rounded-2xl !border-amber/30 p-4 mb-6 flex items-center gap-4">
            <AlertTriangle size={20} className="text-amber shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-semibold">Razer Synapse is running in the background</p>
              <p className="text-fg-muted mt-0.5">
                It takes over the headset's EQ button and re-applies its own EQ when the headset turns on.
                {error && <span className="text-coral"> {error}</span>}
              </p>
            </div>
            <button onClick={stop} className="chip chip-active !px-4 !py-2 shrink-0">
              Close Synapse
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

type Toast = { id: number; name: string; source: 'button' | 'restore' };

/** Bottom-right toast when the EQ button or a reconnect changed the EQ. */
export const EqToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let id = 0;
    const unlisten = onEqApplied(({ name, source }) => {
      const toast = { id: ++id, name: name ?? 'Custom', source };
      setToasts((t) => [...t.slice(-2), toast]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 3500);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="surface !rounded-2xl !bg-ink-800/90 px-4 py-3 flex items-center gap-3 shadow-2xl"
          >
            <div className="w-8 h-8 rounded-xl accent-gradient text-ink-950 flex items-center justify-center">
              {t.source === 'button' ? <SlidersHorizontal size={16} /> : <RotateCcw size={16} />}
            </div>
            <div className="text-sm">
              <p className="text-fg-dim text-xs">{t.source === 'button' ? 'EQ button' : 'Headset reconnected · EQ restored'}</p>
              <p className="font-semibold">{t.name}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
