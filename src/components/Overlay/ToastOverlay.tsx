import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import logo from '../../assets/logo.svg';

type Toast = { id: number; name: string | null; source: 'button' | 'restore' };

/** Content of the always-on-top "toast" window. The backend shows/hides the window itself. */
export const ToastOverlay = () => {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    let id = 0;
    let timer: ReturnType<typeof setTimeout>;
    const unlisten = listen<Omit<Toast, 'id'>>('overlay-toast', (e) => {
      clearTimeout(timer);
      setToast({ ...e.payload, id: ++id });
      timer = setTimeout(() => setToast(null), 1500);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="h-screen w-screen flex items-end justify-end p-2 overflow-hidden">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="w-full rounded-2xl border border-white/10 bg-ink-900/95 px-4 py-3 flex items-center gap-3 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
          >
            <div className="relative w-11 h-11 shrink-0">
              <img src={logo} alt="" className="w-11 h-11" />
              {toast.source === 'restore' && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full accent-gradient text-ink-950 flex items-center justify-center">
                  <RotateCcw size={11} />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-fg-dim uppercase tracking-wider">
                {toast.source === 'button' ? 'EQ preset' : 'Headset reconnected · EQ restored'}
              </p>
              <p className="font-semibold text-[15px] truncate accent-text">{toast.name ?? 'Custom'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
