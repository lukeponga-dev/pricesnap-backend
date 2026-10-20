export default function SetupPage() {
  return (
    <div>
      <h1 className="text-[3.5rem] font-extrabold tracking-[-0.04em] mb-8 text-white">Environment Setup</h1>
      <p className="leading-relaxed text-[#a1a1aa] mb-6">Configure server-side credentials in <code className="bg-[#18181b] px-1 py-0.5 rounded">.env.local</code>.</p>
      
      <pre className="bg-[#18181b] p-6 rounded-lg overflow-x-auto border border-[#27272a] my-8 font-mono text-xs text-[#a1a1aa]">
{`GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key`}
      </pre>

      <h2 className="text-2xl mt-12 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Installation</h2>
      <pre className="bg-[#18181b] p-6 rounded-lg overflow-x-auto border border-[#27272a] my-8 font-mono text-xs text-[#a1a1aa]">
{`npm install
npm run dev`}
      </pre>
    </div>
  );
}
