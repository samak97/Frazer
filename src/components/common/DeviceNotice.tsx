import { Headphones } from 'lucide-react';
import { useHeadsetStore } from '../../stores/headsetStore';

/** Shown in place of a settings page while the headset can't be read. */
export const DeviceNotice = ({ title }: { title: string }) => {
  const { loading, error, loadSettings } = useHeadsetStore();

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
        <Headphones className="text-text-dim opacity-50" size={32} />
      </div>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-text-dim max-w-md">
        {loading
          ? 'Reading settings from the headset…'
          : error ?? 'Turn on your headset and make sure its dongle is plugged in.'}
      </p>
      {!loading && (
        <button
          onClick={loadSettings}
          className="px-6 py-2.5 rounded-xl bg-accent-primary text-white font-bold hover:scale-105 transition-all"
        >
          Retry
        </button>
      )}
    </div>
  );
};
