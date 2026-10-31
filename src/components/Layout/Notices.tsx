import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useSynapseStore } from '../../stores/synapseStore';

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
