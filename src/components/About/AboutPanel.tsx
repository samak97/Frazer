import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, ExternalLink } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Card, Page, item } from '../common/Page';
import logo from '../../assets/logo.svg';

const GithubMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

const REPO_URL = 'https://github.com/samak97/Frazer';

const CREDITS = [
  { name: 'AutoEQ', what: 'measured EQ correction', url: 'https://github.com/jaakkopasanen/AutoEq' },
  { name: 'RTINGS', what: 'headphone measurements', url: 'https://www.rtings.com' },
  { name: 'Tauri', what: 'app framework', url: 'https://tauri.app' },
];

export const AboutPanel = () => {
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <Page title="About">
      <motion.section variants={item} className="surface relative overflow-hidden p-10 flex flex-col items-center text-center">
        <div className="absolute -top-32 w-[28rem] h-[28rem] rounded-full bg-mint/10 blur-3xl" />
        <img src={logo} alt="" className="relative w-28 h-28 animate-float drop-shadow-[0_20px_40px_rgba(61,245,176,0.3)]" />
        <h2 className="relative text-4xl font-semibold tracking-tight mt-6 accent-text">Frazer</h2>
        <p className="relative text-fg-muted mt-1 font-mono text-sm">Version {version || '…'}</p>
        <p className="relative text-fg-muted max-w-lg mt-5 text-sm leading-relaxed">
          A lightweight app to manage your wireless gaming headset, built as a bug-free replacement for Razer Synapse with
          a clean UI and fully customizable presets.
        </p>
        <p className="relative mt-6 flex items-center gap-1.5 text-sm">
          Made with <Heart size={14} className="text-coral fill-coral" /> by <span className="font-semibold">Ahmed Samak</span> · © 2026
        </p>
        <button onClick={() => openUrl(REPO_URL)} className="relative chip chip-active flex items-center gap-2 mt-6 !px-5 !py-2.5">
          <GithubMark /> View on GitHub
        </button>
      </motion.section>

      <Card>
        <h3 className="font-semibold mb-4">Thanks to</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CREDITS.map((c) => (
            <button
              key={c.name}
              onClick={() => openUrl(c.url)}
              className="text-left p-4 rounded-2xl border border-line bg-white/[0.02] hover:bg-white/[0.05] transition-colors flex items-center gap-3"
            >
              <div className="flex-1">
                <p className="font-semibold text-sm">{c.name}</p>
                <p className="text-xs text-fg-dim mt-0.5">{c.what}</p>
              </div>
              <ExternalLink size={14} className="text-fg-dim" />
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-dim mt-5">
          Frazer is an independent project and is not affiliated with or endorsed by Razer Inc.
        </p>
      </Card>
    </Page>
  );
};
