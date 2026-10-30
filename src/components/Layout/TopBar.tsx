import { useAudioStore } from '../../stores/audioStore';

export const TopBar = () => {
  const headset = useAudioStore((s) => s.headsets[0]);

  return (
    <header className="h-header-height border-b border-border-color flex items-center justify-between px-6 sticky top-0 bg-bg-primary/80 backdrop-blur-md z-10 select-none">
      <span className="text-sm text-text-dim">
        {headset ? headset.name : 'No headset connected'}
      </span>
      {headset?.battery_level != null && (
        <span className="text-sm font-semibold text-text-secondary">
          {headset.is_charging ? 'Charging · ' : ''}{headset.battery_level}%
        </span>
      )}
    </header>
  );
};
