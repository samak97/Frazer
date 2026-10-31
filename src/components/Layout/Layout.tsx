import React from 'react';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { SynapseBanner } from './Notices';

export const Layout = ({ children }: { children: React.ReactNode }) => (
  <div className="relative flex flex-col h-screen w-screen bg-ink-950 text-fg overflow-hidden">
    {/* Slow-moving aurora behind everything. */}
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-1/3 -left-1/4 w-[70vw] h-[70vw] rounded-full bg-cyan/10 blur-[120px] animate-aurora" />
      <div className="absolute -bottom-1/3 -right-1/4 w-[60vw] h-[60vw] rounded-full bg-mint/10 blur-[120px] animate-aurora [animation-delay:-9s]" />
    </div>

    <TitleBar />
    <div className="relative flex flex-1 min-h-0">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 pt-6">
        <div className="max-w-6xl mx-auto">
          <SynapseBanner />
          {children}
        </div>
      </main>
    </div>
  </div>
);
