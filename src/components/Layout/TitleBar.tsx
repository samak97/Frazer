import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import logo from '../../assets/logo.svg';

const appWindow = getCurrentWindow();

const WindowButton = ({ onClick, label, danger, children }: { onClick: () => void; label: string; danger?: boolean; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className={`h-full w-12 flex items-center justify-center text-fg-dim transition-colors ${
      danger ? 'hover:bg-coral hover:text-white' : 'hover:bg-white/[0.06] hover:text-fg'
    }`}
  >
    {children}
  </button>
);

/** Frameless window chrome: drag area plus minimise / maximise / hide-to-tray. */
export const TitleBar = () => (
  <header data-tauri-drag-region className="relative z-20 h-titlebar flex items-center justify-between border-b border-line bg-ink-950/60 backdrop-blur-xl">
    <div data-tauri-drag-region className="flex items-center gap-2.5 pl-4">
      <img src={logo} alt="" className="w-5 h-5 pointer-events-none" />
      <span data-tauri-drag-region className="text-[13px] font-semibold tracking-wide">Frazer</span>
    </div>
    <div className="flex h-full">
      <WindowButton label="Minimise" onClick={() => appWindow.minimize()}>
        <Minus size={15} />
      </WindowButton>
      <WindowButton label="Maximise" onClick={() => appWindow.toggleMaximize()}>
        <Square size={12} />
      </WindowButton>
      <WindowButton label="Close to tray" danger onClick={() => appWindow.hide()}>
        <X size={16} />
      </WindowButton>
    </div>
  </header>
);
