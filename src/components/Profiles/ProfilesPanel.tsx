import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Play, Trash2, Plus } from 'lucide-react';
import { useHeadsetStore } from '../../stores/headsetStore';
import { loadProfiles, saveProfiles } from '../../utils/tauri-bridge';
import { Card, CardTitle, Page, item } from '../common/Page';

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
    loadSettings(true);
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
    applyEq(p.eq_preset, p.eq_bands, p.name);
    await setSidetone(p.sidetone_enabled, p.sidetone_level);
    await setMicEqPreset(p.mic_eq_preset);
  };

  return (
    <Page title="Profiles" subtitle="Snapshots of EQ, sidetone and voice EQ you can switch with one click.">
      <Card>
        <CardTitle icon={Plus} title="Save current setup" />
        <div className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveCurrent()}
            placeholder="Profile name, e.g. Late-night music"
            className="flex-1 bg-white/[0.03] px-4 py-2.5 rounded-xl border border-line outline-none focus:border-mint/60 text-sm transition-colors"
          />
          <button onClick={saveCurrent} disabled={!settings?.eq_bands || !name.trim()} className="chip chip-active !px-5 disabled:opacity-40">
            Save
          </button>
        </div>
      </Card>

      {profiles.length === 0 ? (
        <motion.div variants={item} className="flex flex-col items-center gap-3 text-center text-fg-dim py-14">
          <Layers className="opacity-50 animate-float" size={32} />
          <p className="text-sm">No profiles yet. Set things up how you like, then save them here.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatePresence>
            {profiles.map((p) => (
              <motion.div key={p.name} layout variants={item} exit={{ opacity: 0, scale: 0.95 }} className="surface surface-hover p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-mint/10 text-mint flex items-center justify-center">
                  <Layers size={18} />
                </div>
                <span className="flex-1 font-semibold truncate">{p.name}</span>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => apply(p)} className="chip chip-active flex items-center gap-1.5">
                  <Play size={13} /> Apply
                </motion.button>
                <button
                  onClick={() => persist(profiles.filter((x) => x.name !== p.name))}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-dim hover:bg-coral/10 hover:text-coral transition-colors"
                  aria-label="Delete profile"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Page>
  );
};
