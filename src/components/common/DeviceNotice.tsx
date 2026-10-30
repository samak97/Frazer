import { motion } from 'framer-motion';
import { Headphones, RefreshCw } from 'lucide-react';
import { useHeadsetStore } from '../../stores/headsetStore';

/** Shown in place of a settings page while the headset can't be read. */
export const DeviceNotice = ({ title }: { title: string }) => {
  const { loading, error, loadSettings } = useHeadsetStore();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-40" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-[70vh] text-center gap-4"
    >
      <div className="w-20 h-20 rounded-3xl surface flex items-center justify-center animate-float">
        <Headphones className="text-mint" size={34} />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-fg-muted max-w-md text-sm">
        {error ?? 'Turn on your headset and make sure its dongle is plugged in.'}
      </p>
      <button onClick={() => loadSettings()} className="chip chip-active flex items-center gap-2 mt-2">
        <RefreshCw size={14} />
        Try again
      </button>
    </motion.div>
  );
};
