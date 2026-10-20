export default function BenchmarkPage() {
  return (
    <div>
      <h1 className="text-[3.5rem] font-extrabold tracking-[-0.04em] mb-8 text-white">Benchmark Suite</h1>
      <p className="leading-relaxed text-[#a1a1aa] mb-6">Changes to valuation behavior should be measured against the established PriceSnap benchmark set.</p>
      <h2 className="text-2xl mt-8 mb-4 border-l-4 border-[#3f3f46] pl-4 text-white">Key Metrics</h2>
      <ul className="list-disc list-inside space-y-2 text-[#a1a1aa]">
        <li>Identification accuracy</li>
        <li>Absolute valuation error</li>
        <li>Percentage valuation error</li>
        <li>Comparable acceptance/rejection rates</li>
        <li>Price dispersion</li>
        <li>Confidence calibration</li>
        <li>Pipeline latency</li>
      </ul>
    </div>
  );
}
