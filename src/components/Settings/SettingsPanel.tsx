import { useEffect, useState } from 'react';
import { Power, Info, Rocket, ShieldOff } from 'lucide-react';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useHeadsetStore } from '../../stores/headsetStore';
import { useSynapseStore } from '../../stores/synapseStore';
import { Toggle } from '../common/Toggle';
import { Card, CardTitle, Page } from '../common/Page';

const AUTO_OFF_OPTIONS = [
  { label: 'Never', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
];

export const SettingsPanel = () => {
  const { settings, loadSettings, setAutoOff } = useHeadsetStore();
  const synapse = useSynapseStore();
  const [autostart, setAutostart] = useState(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings(true);
    isEnabled().then(setAutostart).catch(() => {});
  }, [loadSettings]);

  const toggleAutostart = async (on: boolean) => {
    try {
      await (on ? enable() : disable());
      setAutostartError(null);
    } catch (e) {
      setAutostartError(String(e));
    }
    setAutostart(await isEnabled());
  };

  return (
    <Page title="Settings" subtitle="Headset power and how Frazer runs.">
      <Card>
        <CardTitle
          icon={Rocket}
          title="Start with Windows"
          hint="Starts quietly in the tray when you sign in, so the EQ button and reconnect restore keep working."
          right={<Toggle checked={autostart} onChange={toggleAutostart} label="Start with Windows" />}
        />
        <p className="text-xs text-fg-dim">
          Closing the window keeps Frazer running in the tray. Right-click the tray icon and choose Quit to exit.
        </p>
        {autostartError && <p className="text-xs text-coral mt-2">{autostartError}</p>}
      </Card>

      <Card>
        <CardTitle
          icon={ShieldOff}
          title="Razer Synapse"
          hint="Synapse's background engine takes over the EQ button and re-applies its own EQ. Keep it off while using Frazer."
          right={
            synapse.status?.running ? (
              <button onClick={synapse.stop} className="chip chip-active">Close Synapse</button>
            ) : (
              <span className="chip chip-idle">Not running</span>
            )
          }
        />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Let Synapse start with Windows</p>
            <p className="text-xs text-fg-dim mt-0.5">Turning this off removes Synapse's startup entry. Frazer keeps a copy so you can turn it back on.</p>
          </div>
          <Toggle checked={!!synapse.status?.autostart} onChange={synapse.setAutostart} label="Let Synapse start with Windows" />
        </div>
        {synapse.error && <p className="text-xs text-coral mt-2">{synapse.error}</p>}
      </Card>

      {settings && (
        <Card>
          <CardTitle icon={Power} title="Auto power-off" hint="Turns the headset off after this long without audio." />
          <div className="flex gap-2 flex-wrap">
            {AUTO_OFF_OPTIONS.map((o) => (
              <button key={o.minutes} onClick={() => setAutoOff(o.minutes)} className={`chip ${settings.auto_off_minutes === o.minutes ? 'chip-active' : 'chip-idle'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {settings && (
        <Card>
          <CardTitle icon={Info} title="Device info" />
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-fg-dim">Firmware</dt>
            <dd className="font-mono">{settings.firmware ?? '—'}</dd>
            <dt className="text-fg-dim">Serial</dt>
            <dd className="font-mono">{settings.serial ?? '—'}</dd>
          </dl>
        </Card>
      )}
    </Page>
  );
};
