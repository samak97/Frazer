import { useEffect, useState } from 'react';
import { Layers, Play, Trash2, Plus } from 'lucide-react';
import { useHeadsetStore } from '../../stores/headsetStore';
import { loadProfiles, saveProfiles } from '../../utils/tauri-bridge';

interface Profile {
  name: string;
  eq_preset: number;
  eq_bands: number[];
  sidetone_enabled: boolean;
  sidetone_level: number;
  mic_eq_preset: number;
}

export const ProfilesPanel = () => {
  const { settings, loadSettings, applyEq, setSidetone, setMicEqPreset } = useHeadsetStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    loadSettings();
    loadProfiles<Profile>().then(setProfiles).catch(console.error);
  }, [loadSettings]);

  const persist = (next: Profile[]) => {
    setProfiles(next);
    saveProfiles(next).catch(console.error);
  };

  const saveCurrent = () => {
    if (!settings?.eq_bands || !name.trim()) return;
    const profile: Profile = {
      name: name.trim(),
      eq_preset: settings.eq_preset ?? 255,
      eq_bands: settings.eq_bands,
      sidetone_enabled: settings.sidetone_enabled ?? false,
      sidetone_level: settings.sidetone_level ?? 0,
      mic_eq_preset: settings.mic_eq_preset ?? 0,
    };
    persist([...profiles.filter((p) => p.name !== profile.name), profile]);
    setName('');
  };

  const apply = async (p: Profile) => {
    applyEq(p.eq_preset, p.eq_bands);
    await setSidetone(p.sidetone_enabled, p.sidetone_level);
    await setMicEqPreset(p.mic_eq_preset);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Profiles</h2>
        <p className="text-text-dim mt-1">Snapshots of EQ, sidetone and mic EQ you can switch between in one click.</p>
      </div>

      <div className="premium-card glass p-6 flex gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveCurrent()}
          placeholder="Profile name"
          className="flex-1 bg-white/5 px-4 py-2 rounded-xl border border-border-color outline-none focus:border-accent-primary text-sm"
        />
        <button
          onClick={saveCurrent}
          disabled={!settings?.eq_bands || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-primary text-white text-sm font-semibold disabled:opacity-40"
        >
          <Plus size={16} />
          Save current
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center gap-4 text-center text-text-dim py-16">
          <Layers className="opacity-50" size={32} />
          <p>No profiles yet. Set things up how you like, then save them here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.name} className="glass p-4 rounded-2xl flex items-center gap-4">
              <span className="flex-1 font-semibold">{p.name}</span>
              <button onClick={() => apply(p)} className="p-2 rounded-lg hover:bg-white/5 text-accent-primary" title="Apply">
                <Play size={18} />
              </button>
              <button
                onClick={() => persist(profiles.filter((x) => x.name !== p.name))}
                className="p-2 rounded-lg hover:bg-red-500/10 text-text-dim hover:text-red-500"
                title="Delete"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
