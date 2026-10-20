export default function DocsPage() {
  return (
    <div>
      <header className="mb-16">
        <span className="font-mono text-[0.65rem] uppercase opacity-50 tracking-[0.1em]">v1.0.0 / System Console</span>
        <h1 className="text-[3.5rem] font-extrabold tracking-[-0.04em] mb-8 text-white">PriceSnap Backend</h1>
      </header>

      <section id="overview">
        <h2 className="text-2xl mt-12 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Overview</h2>
        <p className="leading-relaxed text-[#a1a1aa] mb-6">PriceSnap Backend is the server-side valuation engine powering the PriceSnap application. It analyses product images, identifies products, assesses visible condition, gathers real-world market evidence, filters comparable listings, and calculates structured resale-value estimates in <strong>New Zealand dollars (NZD)</strong>.</p>
      </section>

      <section id="architecture">
        <h2 className="text-2xl mt-12 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Architecture</h2>
        <p className="leading-relaxed text-[#a1a1aa] mb-6">PriceSnap is designed as a <strong>valuation system supported by AI</strong>, rather than an AI-generated pricing service.</p>
        <pre className="bg-[#18181b] p-6 rounded-lg overflow-x-auto border border-[#27272a] my-8 font-mono text-xs text-[#a1a1aa]"><code>Product Image -&gt; Identification -&gt; Condition -&gt; Evidence Filter -&gt; Pricing -&gt; Confidence</code></pre>
      </section>

      <section id="api">
        <h2 className="text-2xl mt-12 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">API Reference</h2>
        <p className="leading-relaxed text-[#a1a1aa] mb-6">The backend exposes thin REST endpoints for appraisal and connection health.</p>
        <pre className="bg-[#18181b] p-6 rounded-lg overflow-x-auto border border-[#27272a] my-8 font-mono text-xs text-[#a1a1aa]"><code>POST /api/valuate
POST /api/resale
GET /api/ping</code></pre>
      </section>

      <section id="pipeline">
        <h2 className="text-2xl mt-12 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Valuation Pipeline</h2>
        <p className="leading-relaxed text-[#a1a1aa] mb-6">Stages include: Product Identification, Condition Assessment, Search Query Generation, Grounded Market Search, Evidence Filtering, Deterministic Pricing, and Confidence Scoring.</p>
      </section>

      <section id="security">
        <h2 className="text-2xl mt-12 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Security</h2>
        <p className="leading-relaxed text-[#a1a1aa] mb-6">The backend enforces strict request validation, environment variable isolation for provider keys, and avoids logging of PII or sensitive Base64 payloads.</p>
      </section>

      <footer className="mt-20">
        <hr className="border-[#27272a] mb-6" />
        <p className="text-[0.75rem] text-[#a1a1aa]">&copy; PriceSnap. All rights reserved. Private project.</p>
      </footer>
    </div>
  );
}
