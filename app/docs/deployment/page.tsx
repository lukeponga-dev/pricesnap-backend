export default function DeploymentPage() {
  return (
    <div>
      <h1 className="text-[3.5rem] font-extrabold tracking-[-0.04em] mb-8 text-white">Deployment Guide</h1>
      <p className="leading-relaxed text-[#a1a1aa] mb-6">PriceSnap is designed for deployment on Vercel.</p>
      
      <h2 className="text-2xl mt-8 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Production Steps</h2>
      <ul className="list-decimal list-inside space-y-2 text-[#a1a1aa]">
        <li>Configure production secrets in Vercel environment settings.</li>
        <li>Ensure `npm run build` succeeds.</li>
        <li>Deploy via Vercel CLI or linked repository.</li>
      </ul>

      <h2 className="text-2xl mt-12 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Architecture Flow</h2>
      <pre className="bg-[#18181b] p-6 rounded-lg overflow-x-auto border border-[#27272a] my-8 font-mono text-xs text-[#a1a1aa]">
{`Client -> Vercel (HTTPS) -> PriceSnap API -> Valuation Engine`}
      </pre>
    </div>
  );
}
