export default function ModelsPage() {
  return (
    <div>
      <h1 className="text-[3.5rem] font-extrabold tracking-[-0.04em] mb-8 text-white">AI Models</h1>
      <p className="leading-relaxed text-[#a1a1aa] mb-6">PriceSnap utilizes specialized AI models for different tasks, configurable via environment variables.</p>
      
      <h2 className="text-2xl mt-8 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Model Configuration</h2>
      <p className="text-[#a1a1aa] mb-4">Models are managed in <code className="bg-[#18181b] px-1 py-0.5 rounded">lib/valuation-engine/ai/client.ts</code>. You can override defaults by setting the following environment variables:</p>
      
      <pre className="bg-[#18181b] p-6 rounded-lg overflow-x-auto border border-[#27272a] my-8 font-mono text-xs text-[#a1a1aa]">
{`GEMINI_VISION_MODEL   # Identification (default: gemini-3.1-flash-lite)
GEMINI_EVIDENCE_MODEL # Market search (default: gemini-3.5-flash-lite)
GEMINI_MODEL          # General fallback (default: gemini-3.5-flash-lite)`}
      </pre>

      <h2 className="text-2xl mt-12 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Guidelines for Updating</h2>
      <ul className="list-decimal list-inside space-y-2 text-[#a1a1aa]">
        <li><strong>Vision Model</strong>: Must support multimodal input for accurate item identification.</li>
        <li><strong>Evidence Model</strong>: Should be capable of grounded search and structured output.</li>
        <li><strong>Testing</strong>: After updating any model, verify the change by running the benchmark suite against existing valuation cases to ensure identification accuracy and pricing consistency.</li>
        <li><strong>Cost/Performance</strong>: Prefer &quot;flash&quot; or &quot;lite&quot; models to maintain pipeline latency and manage API costs.</li>
      </ul>
    </div>
  );
}
