import { useEffect, useState } from 'react';
import { Power, Info, Rocket } from 'lucide-react';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useHeadsetStore } from '../../stores/headsetStore';
import { Toggle } from '../common/Toggle';

const AUTO_OFF_OPTIONS = [
  { label: 'Never', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
];

export const SettingsPanel = () => {
  const { settings, loadSettings, setAutoOff } = useHeadsetStore();
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    loadSettings();
    isEnabled().then(setAutostart).catch(() => {});
  }, [loadSettings]);

  const toggleAutostart = async (on: boolean) => {
    await (on ? enable() : disable());
    setAutostart(await isEnabled());
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-text-dim mt-1">Headset power and app preferences.</p>
      </div>

      {settings && (
        <div className="premium-card glass p-8 space-y-6">
          <div className="flex items-center gap-4">
            <Power className="text-accent-primary" />
            <div>
              <h3 className="text-xl font-bold">Auto power-off</h3>
              <p className="text-sm text-text-dim">Turns the headset off after this long without audio.</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {AUTO_OFF_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                onClick={() => setAutoOff(o.minutes)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  settings.auto_off_minutes === o.minutes
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-text-dim hover:text-text-primary hover:bg-white/5'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="premium-card glass p-8 flex items-center gap-4">
        <Rocket className="text-accent-primary" />
        <div className="flex-1">
          <h3 className="text-xl font-bold">Start with Windows</h3>
          <p className="text-sm text-text-dim">Launch Frazer minimised when you sign in.</p>
        </div>
        <Toggle checked={autostart} onChange={toggleAutostart} label="Start with Windows" />
      </div>

      {settings && (
        <div className="premium-card glass p-8">
          <div className="flex items-center gap-4 mb-4">
            <Info className="text-accent-primary" />
            <h3 className="text-xl font-bold">Device info</h3>
          </div>
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-text-dim">Firmware</dt>
            <dd className="font-mono">{settings.firmware ?? '—'}</dd>
            <dt className="text-text-dim">Serial</dt>
            <dd className="font-mono">{settings.serial ?? '—'}</dd>
          </dl>
        </div>
      )}
    </div>
  );
};
