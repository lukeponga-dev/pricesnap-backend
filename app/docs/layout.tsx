import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: "PriceSnap | Documentation",
  description: "Technical documentation and guides for PriceSnap.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#09090b] text-[#f4f4f5]">
      <aside className="w-[280px] border-r border-[#27272a] p-8 overflow-y-auto hidden md:flex flex-col gap-8 flex-shrink-0">
        <div>
          <h2 className="text-[0.65rem] uppercase tracking-[0.15em] text-[#a1a1aa] mb-4">[01] Documentation</h2>
          <nav className="space-y-2">
            <Link href="/docs#overview" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">Overview</Link>
            <Link href="/docs#architecture" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">Architecture</Link>
            <Link href="/docs#pipeline" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">Valuation Pipeline</Link>
            <Link href="/docs#api" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">API Reference</Link>
            <Link href="/docs#security" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">Security</Link>
            <Link href="/docs/models" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">AI Models</Link>
          </nav>
        </div>
        <div>
          <h2 className="text-[0.65rem] uppercase tracking-[0.15em] text-[#a1a1aa] mb-4">[02] Resources</h2>
          <nav className="space-y-2">
            <Link href="/docs/benchmark" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">Benchmark Suite</Link>
            <Link href="/docs/setup" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">Environment Setup</Link>
            <Link href="/docs/deployment" className="block text-[#a1a1aa] text-sm py-2 hover:text-white transition-colors">Deployment Guide</Link>
          </nav>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8 md:p-16">
        <div className="max-w-[800px] mx-auto">
          <Link href="/" className="text-sm text-[#a1a1aa] hover:text-white mb-8 block transition-colors">&larr; Back to Dashboard</Link>
          {children}
        </div>
      </main>
    </div>
  );
}
