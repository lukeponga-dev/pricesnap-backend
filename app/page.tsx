"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface BackendStatus {
  status: string;
  service: string;
  version: string;
  nodeVersion?: string;
  environment: string;
  serverTime: string;
  uptimeSeconds: number;
}

interface EngineStatus {
  status: string;
  service: string;
  hasApiKey: boolean;
  engineVersion: string;
  model: string;
  visionModel?: string;
  evidenceProvider?: string;
  evidenceModel?: string;
  geminiLatencyMs: number | null;
  providerChecked: boolean;
}

interface ConnectionData {
  ok: boolean;
  timestamp: number;
  backend: BackendStatus;
  engine: EngineStatus;
}

interface LogEntry {
  id: string;
  time: string;
  type: "ping" | "connection" | "valuate" | "resale" | "system";
  endpoint: string;
  status: "success" | "error" | "pending";
  latencyMs?: number;
  message: string;
  details?: unknown;
}

interface ComparableItem {
  title: string;
  price: number;
  currency: string;
  source: string;
  url: string;
}

interface ValuationResult {
  ok: boolean;
  status: "success" | "insufficient_evidence" | "heuristic";
  item: {
    name: string;
    category: string;
    brand?: string;
    model?: string;
    attributes?: Record<string, string>;
  };
  condition: {
    grade: string;
    score: number;
    notes: string[];
  };
  valuation: {
    currency: string;
    estimatedValue: number | null;
    low: number | null;
    high: number | null;
  };
  confidence: {
    score: number;
    level: "low" | "medium" | "high";
  };
  comparables: ComparableItem[];
  generatedAt?: string;
  warnings?: string[];
  error?: string;
  code?: string;
}

interface SaleStrategy {
  currency: "NZD";
  suggestedListingPrice: number | null;
  targetSalePrice: number | null;
  minimumNegotiationPrice: number | null;
  basis: "evidence_derived" | "insufficient_evidence";
}

interface ListingDraft {
  title: string;
  description: string;
  provider: "openai" | "deterministic";
}

interface ResaleResult {
  ok: boolean;
  status: "success" | "insufficient_evidence" | "heuristic";
  valuation: ValuationResult;
  saleStrategy: SaleStrategy;
  listing: ListingDraft;
  negotiationGuidance: string[];
  listingChecklist: string[];
  error?: string;
  code?: string;
}

export default function Home() {
  const [data, setData] = useState<ConnectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(15);
  const [activeTab, setActiveTab] = useState<"diagnostics" | "valuate" | "resale" | "android">("diagnostics");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<"all" | "ping" | "connection" | "valuate" | "resale">("all");

  // Ping Inspector state
  const [pingRunning, setPingRunning] = useState(false);
  const [pingResult, setPingResult] = useState<{ status: number; latency: number; payload: unknown } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Valuation test state
  const [testImageBase64, setTestImageBase64] = useState<string | null>(null);
  const [testMimeType, setTestMimeType] = useState("image/jpeg");
  const [testImagePreview, setTestImagePreview] = useState<string | null>(null);
  const [testItemName, setTestItemName] = useState<string>("Vintage 35mm Rangefinder Camera");
  const [valuating, setValuating] = useState(false);
  const [valuationResult, setValuationResult] = useState<ValuationResult | null>(null);
  const [valuationError, setValuationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resale Strategy state
  const [resaleMarketplace, setResaleMarketplace] = useState<string>("Trade Me");
  const [resaleNotes, setResaleNotes] = useState<string>("Includes original box, battery charger, and 50mm f/1.8 lens in mint condition.");
  const [resaleRunning, setResaleRunning] = useState(false);
  const [resaleResult, setResaleResult] = useState<ResaleResult | null>(null);
  const [resaleError, setResaleError] = useState<string | null>(null);
  const [checkedChecklist, setCheckedChecklist] = useState<Record<number, boolean>>({});

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "time">) => {
    const newEntry: LogEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 49)]);
  }, []);

  const checkConnection = useCallback(async (isManual = false) => {
    setLoading(true);
    setError(null);
    const start = performance.now();

    try {
      const res = await fetch("/api/connection", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const latency = Math.round(performance.now() - start);

      if (!res.ok && res.status !== 503) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json: ConnectionData = await res.json();
      setData(json);
      setLastUpdated(new Date());

      addLog({
        type: "connection",
        endpoint: "/api/connection",
        status: json.engine.hasApiKey ? "success" : "error",
        latencyMs: latency,
        message: json.engine.hasApiKey
          ? `Backend online; internal engine configured (${json.engine.evidenceProvider ?? "gemini"} evidence)`
          : `Backend online, internal engine not configured (API key missing)`,
        details: json,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect to /api/connection";
      setError(msg);
      addLog({
        type: "connection",
        endpoint: "/api/connection",
        status: "error",
        latencyMs: Math.round(performance.now() - start),
        message: msg,
      });
    } finally {
      setLoading(false);
      if (isManual) {
        setCountdown(15);
      }
    }
  }, [addLog]);

  useEffect(() => {
    let cancelled = false;
    const start = performance.now();

    async function initialFetch() {
      try {
        const res = await fetch("/api/connection", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const latency = Math.round(performance.now() - start);

        if (!res.ok && res.status !== 503) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const json: ConnectionData = await res.json();
        if (cancelled) return;
        setData(json);
        setLastUpdated(new Date());
        addLog({
          type: "connection",
          endpoint: "/api/connection",
          status: json.engine.hasApiKey ? "success" : "error",
          latencyMs: latency,
          message: json.engine.hasApiKey
            ? `Backend online; internal engine configured (${json.engine.evidenceProvider ?? "gemini"} evidence)`
            : `Backend online, internal engine not configured`,
          details: json,
        });
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to connect to /api/connection");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialFetch();

    return () => {
      cancelled = true;
    };
  }, [addLog]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          checkConnection();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, checkConnection]);

  const handlePingBackend = async () => {
    setPingRunning(true);
    const start = performance.now();
    try {
      const res = await fetch("/api/ping", { cache: "no-store" });
      const latency = Math.round(performance.now() - start);
      const payload = await res.json();
      setPingResult({ status: res.status, latency, payload });
      addLog({
        type: "ping",
        endpoint: "/api/ping",
        status: res.ok ? "success" : "error",
        latencyMs: latency,
        message: `GET /api/ping -> HTTP ${res.status} in ${latency}ms`,
        details: payload,
      });
    } catch (err: unknown) {
      const latency = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : "Ping failed";
      setPingResult({ status: 0, latency, payload: { error: msg } });
      addLog({
        type: "ping",
        endpoint: "/api/ping",
        status: "error",
        latencyMs: latency,
        message: `GET /api/ping failed: ${msg}`,
      });
    } finally {
      setPingRunning(false);
    }
  };

  const handleLoadSampleImage = (type: "camera" | "watch" | "lens" | "phone" | "console") => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 400, 400);
    bgGrad.addColorStop(0, "#1e293b");
    bgGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 400, 400);

    // Decorative grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 400; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 400);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(400, i);
      ctx.stroke();
    }

    if (type === "camera") {
      ctx.fillStyle = "#334155";
      ctx.roundRect(70, 130, 260, 170, 16);
      ctx.fill();

      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.roundRect(110, 100, 180, 40, [8, 8, 0, 0]);
      ctx.fill();

      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(90, 115, 20, 15);
      ctx.fillRect(280, 115, 30, 15);

      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(200, 215, 65, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#38bdf8";
      ctx.stroke();

      ctx.fillStyle = "#0369a1";
      ctx.beginPath();
      ctx.arc(200, 215, 45, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(185, 200, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("LEICA M6 • 35MM RANGEFINDER", 200, 340);
      setTestItemName("Leica M6 35mm Rangefinder Camera");
    } else if (type === "watch") {
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(200, 200, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#e2e8f0";
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(200, 200, 95, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(200, 200);
      ctx.lineTo(200, 130);
      ctx.moveTo(200, 200);
      ctx.lineTo(250, 200);
      ctx.stroke();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("OMEGA SPEEDMASTER CHRONO", 200, 340);
      setTestItemName("Omega Speedmaster Professional Chronograph");
    } else if (type === "phone") {
      ctx.fillStyle = "#1e293b";
      ctx.roundRect(130, 80, 140, 240, 24);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#6366f1";
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.roundRect(138, 92, 124, 216, 18);
      ctx.fill();

      ctx.fillStyle = "#334155";
      ctx.roundRect(180, 100, 40, 10, 5);
      ctx.fill();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("IPHONE 13 PRO • 256GB", 200, 355);
      setTestItemName("Apple iPhone 13 Pro 256GB");
    } else if (type === "console") {
      ctx.fillStyle = "#334155";
      ctx.roundRect(90, 140, 220, 120, 16);
      ctx.fill();
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(140, 200, 25, 0, Math.PI * 2);
      ctx.arc(260, 200, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("XBOX WIRELESS CONTROLLER", 200, 340);
      setTestItemName("Xbox Wireless Controller Robot White");
    } else {
      ctx.fillStyle = "#334155";
      ctx.roundRect(80, 100, 240, 200, 20);
      ctx.fill();
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(200, 180, 50, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("SONY 24-70MM F/2.8 GM", 200, 340);
      setTestItemName("Sony FE 24-70mm f/2.8 GM Lens");
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    setTestImageBase64(base64);
    setTestMimeType("image/jpeg");
    setTestImagePreview(dataUrl);
    setValuationResult(null);
    setValuationError(null);
    setResaleResult(null);
    setResaleError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setValuationError("Invalid MIME type. Must be JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > 3_000_000) {
      setValuationError(`File is ${(file.size / 1_000_000).toFixed(2)} MB. Maximum decoded limit is 3,000,000 bytes (3 MB).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setTestImageBase64(base64);
      setTestMimeType(file.type);
      setTestImagePreview(dataUrl);
      setTestItemName(file.name.replace(/\.[^/.]+$/, ""));
      setValuationResult(null);
      setValuationError(null);
      setResaleResult(null);
      setResaleError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRunValuation = async () => {
    if (!testImageBase64) {
      setValuationError("Please load a sample image or upload a photo first.");
      return;
    }

    setValuating(true);
    setValuationError(null);
    setValuationResult(null);
    const start = performance.now();

    try {
      addLog({
        type: "valuate",
        endpoint: "/api/valuate",
        status: "pending",
        message: `Analyzing image (${Math.round((testImageBase64.length * 3) / 4 / 1024)} KB) via PriceSnap engine...`,
      });

      const res = await fetch("/api/valuate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: testImageBase64,
          mimeType: testMimeType,
        }),
      });

      const latency = Math.round(performance.now() - start);
      const json = await res.json();

      if (!res.ok && res.status !== 503 && res.status !== 422) {
        throw new Error(json.error || `HTTP ${res.status}: ${json.code || "VALUATION_FAILED"}`);
      }

      setValuationResult(json);
      addLog({
        type: "valuate",
        endpoint: "/api/valuate",
        status: res.ok ? "success" : "error",
        latencyMs: latency,
        message: res.ok
          ? `Valuation completed: ${json.item?.name || "Item"} -> ${json.valuation?.currency} $${json.valuation?.estimatedValue ?? "No price"} (${json.status})`
          : `Valuation response HTTP ${res.status}: ${json.error || json.code}`,
        details: json,
      });
    } catch (err: unknown) {
      const latency = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : "Valuation request failed";
      setValuationError(msg);
      addLog({
        type: "valuate",
        endpoint: "/api/valuate",
        status: "error",
        latencyMs: latency,
        message: `Valuation failed: ${msg}`,
      });
    } finally {
      setValuating(false);
    }
  };

  const handleRunResale = async () => {
    if (!testImageBase64) {
      setResaleError("Please load a sample image or upload a photo first.");
      return;
    }

    setResaleRunning(true);
    setResaleError(null);
    setResaleResult(null);
    setCheckedChecklist({});
    const start = performance.now();

    try {
      addLog({
        type: "resale",
        endpoint: "/api/resale",
        status: "pending",
        message: `Generating resale plan for ${resaleMarketplace} with seller notes...`,
      });

      const res = await fetch("/api/resale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: testImageBase64,
          mimeType: testMimeType,
          preferences: {
            marketplace: resaleMarketplace.trim() || undefined,
            notes: resaleNotes.trim() || undefined,
          },
        }),
      });

      const latency = Math.round(performance.now() - start);
      const json = await res.json();

      if (!res.ok && res.status !== 503 && res.status !== 422) {
        throw new Error(json.error || `HTTP ${res.status}: ${json.code || "RESALE_FAILED"}`);
      }

      setResaleResult(json);
      addLog({
        type: "resale",
        endpoint: "/api/resale",
        status: res.ok ? "success" : "error",
        latencyMs: latency,
        message: res.ok
          ? `Resale plan generated: Listing NZ$ ${json.saleStrategy?.suggestedListingPrice ?? "N/A"} / Target NZ$ ${json.saleStrategy?.targetSalePrice ?? "N/A"}`
          : `Resale error HTTP ${res.status}: ${json.error || json.code}`,
        details: json,
      });
    } catch (err: unknown) {
      const latency = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : "Resale strategy request failed";
      setResaleError(msg);
      addLog({
        type: "resale",
        endpoint: "/api/resale",
        status: "error",
        latencyMs: latency,
        message: `Resale failed: ${msg}`,
      });
    } finally {
      setResaleRunning(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const isBackendHealthy = data?.backend.status === "online";
  const isEngineConfigured = data?.engine.status === "configured" && data?.engine.hasApiKey;
  const overallConnected = isBackendHealthy && isEngineConfigured;

  const filteredLogs = logs.filter((log) => {
    if (logFilter === "all") return true;
    return log.type === logFilter;
  });

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      {/* Top ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-48 bg-gradient-to-b from-cyan-500/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* Main Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-emerald-500 p-0.5 shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center font-bold text-lg text-white">
                PS
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-lg text-white">PriceSnap</span>
                <span className="text-[11px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  Backend & Console
                </span>
                <span className="text-[11px] font-mono text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded bg-slate-900/80">
                  v0.1.0
                </span>
                <a href="/docs" className="text-xs text-cyan-400 hover:text-cyan-300 ml-2 font-medium">Docs</a>
              </div>
              <p className="text-xs text-slate-400">Valuation Engine, Resale Agent & Client API</p>
            </div>
          </div>

          {/* Real-time Status Badge & Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border text-xs font-medium backdrop-blur-md transition-all ${
                loading
                  ? "bg-slate-900/90 border-slate-700 text-slate-300"
                  : overallConnected
                  ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-500/10"
                  : "bg-rose-950/50 border-rose-500/40 text-rose-300"
              }`}
            >
              <span className="relative flex h-2.5 w-2.5">
                {overallConnected && !loading && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    loading ? "bg-amber-400" : overallConnected ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                ></span>
              </span>
              <span>
                {loading
                  ? "Checking Connection..."
                  : overallConnected
                  ? "All Systems Operational"
                  : "Engine Needs Configuration"}
              </span>
              {data?.engine.evidenceProvider && (
                <span className="text-[10px] font-mono opacity-80 pl-1 border-l border-emerald-500/30">
                  {data.engine.evidenceProvider.toUpperCase()}
                </span>
              )}
            </div>

            {/* Auto refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
                autoRefresh
                  ? "bg-slate-900/80 border-slate-700 text-cyan-400 hover:border-slate-600"
                  : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400"
              }`}
              title="Toggle auto connection polling"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-cyan-400" : "bg-slate-600"}`} />
              Auto ({countdown}s)
            </button>

            <Link href="/docs" className="text-slate-400 hover:text-white transition-colors text-xs font-medium mr-4">Docs</Link>
            {/* Refresh Button */}
            <button
              onClick={() => checkConnection(true)}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 transition-all disabled:opacity-50"
              title="Refresh connection status now"
              id="refresh-connection-btn"
            >
              <svg
                className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        
        {/* Error Alert if backend unreachable */}
        {error && (
          <div className="bg-rose-950/70 border border-rose-600/60 rounded-xl p-4 flex items-start gap-3.5 backdrop-blur-md">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-rose-200">Connection Error Detected</h4>
              <p className="text-xs text-rose-300/90 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* TOPOLOGY & PIPELINE VISUALIZER */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800/60 gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
                End-to-End PriceSnap Architecture
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Client image submission through valuation, market search grounding, deterministic pricing, and resale copywriting.
              </p>
            </div>
            {lastUpdated && (
              <span className="text-xs font-mono text-slate-500">
                Last verified: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Interactive Topology Graph */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-6 items-center">
            {/* Node 1: Mobile Client */}
            <div className="relative p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col gap-2 group hover:border-slate-700 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                  Ready
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Android Client</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Retrofit / OkHttp</p>
              </div>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-900 flex justify-between">
                <span>POST /api/valuate</span>
                <span>≤ 3 MB</span>
              </div>
            </div>

            {/* Node 2: PriceSnap Backend */}
            <div className={`relative p-4 rounded-xl bg-slate-950/80 border transition-all ${
              isBackendHealthy ? "border-cyan-500/50 shadow-md shadow-cyan-500/5" : "border-rose-500/50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  isBackendHealthy
                    ? "bg-cyan-950/80 text-cyan-300 border-cyan-700/60"
                    : "bg-rose-950/80 text-rose-300 border-rose-700/60"
                }`}>
                  {isBackendHealthy ? "Online" : "Offline"}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Next.js API Routes</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Node {data?.backend.nodeVersion ?? "v22"}</p>
              </div>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-900 flex justify-between">
                <span>Strict Validation</span>
                <span>NZD Engine</span>
              </div>
            </div>

            {/* Node 3: Valuation Engine */}
            <div className={`relative p-4 rounded-xl bg-slate-950/80 border transition-all ${
              isEngineConfigured
                ? "border-indigo-500/50 shadow-md shadow-indigo-500/5"
                : "border-amber-500/50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  isEngineConfigured
                    ? "bg-indigo-950/80 text-indigo-300 border-indigo-700/60"
                    : "bg-amber-950/80 text-amber-300 border-amber-700/60"
                }`}>
                  {data?.engine.status ?? "Checking"}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Valuation Engine</h3>
                <p className="text-xs text-slate-400 font-mono truncate mt-0.5" title={data?.engine.model}>
                  {data?.engine.visionModel ?? "gemini-3.1-flash-lite"}
                </p>
              </div>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-900 flex justify-between">
                <span>{data?.engine.evidenceProvider === "openai" ? "OpenAI Search" : "Google Grounding"}</span>
                <span>{data?.engine.hasApiKey ? "Key ✓" : "Key Needed"}</span>
              </div>
            </div>

            {/* Node 4: Resale Strategy Agent */}
            <div className="relative p-4 rounded-xl bg-slate-950/80 border border-purple-800/40 hover:border-purple-600/60 transition-all flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-purple-950/80 border border-purple-800/50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                  POST /api/resale
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Resale Strategy Agent</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Pricing & Copy Planner</p>
              </div>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-900 flex justify-between">
                <span>Trade Me / FB / eBay</span>
                <span>Floor & Targets</span>
              </div>
            </div>
          </div>
        </section>

        {/* METRICS & STATUS CARDS */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Backend Liveness */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Backend Liveness</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                  /api/ping
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {data?.backend.status === "online" ? "Operational" : "Offline"}
                </span>
                <span className="text-xs text-slate-400">Node.js API</span>
              </div>
              <div className="space-y-1.5 pt-2 text-xs text-slate-400 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Service:</span>
                  <span className="text-slate-300">{data?.backend.service ?? "pricesnap-backend"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Uptime:</span>
                  <span className="text-slate-300">
                    {data?.backend.uptimeSeconds != null
                      ? `${Math.floor(data.backend.uptimeSeconds / 60)}m ${data.backend.uptimeSeconds % 60}s`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Environment:</span>
                  <span className="text-slate-300 capitalize">{data?.backend.environment ?? "production"}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handlePingBackend}
              disabled={pingRunning}
              className="mt-4 w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/40 text-xs font-medium text-cyan-300 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              id="test-ping-btn"
            >
              {pingRunning ? "Pinging..." : "Execute GET /api/ping"}
            </button>
          </div>

          {/* Card 2: AI Engine Configuration */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">AI Engine Models</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-800/40">
                  /api/connection
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {data?.engine.status ? data.engine.status.toUpperCase() : "CHECKING"}
                </span>
                <span className="text-xs font-mono text-cyan-400">
                  {data?.engine.evidenceProvider === "openai" ? "OpenAI Grounding" : "Gemini Grounding"}
                </span>
              </div>
              <div className="space-y-1.5 pt-2 text-xs text-slate-400 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Vision Model:</span>
                  <span className="text-slate-300 truncate max-w-[170px]" title={data?.engine.visionModel}>
                    {data?.engine.visionModel ?? "gemini-3.1-flash-lite"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Evidence Model:</span>
                  <span className="text-slate-300 truncate max-w-[170px]" title={data?.engine.evidenceModel}>
                    {data?.engine.evidenceModel ?? "gemini-3.5-flash-lite"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Gemini Key:</span>
                  <span className={data?.engine.hasApiKey ? "text-emerald-400" : "text-amber-400"}>
                    {data?.engine.hasApiKey ? "Configured ✓" : "Key Needed"}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => checkConnection(true)}
              className="mt-4 w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/40 text-xs font-medium text-indigo-300 flex items-center justify-center gap-2 transition-all"
              id="test-internal-btn"
            >
              Verify Engine Health
            </button>
          </div>

          {/* Card 3: Resale Strategy & Contract */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resale Agent Status</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                  /api/resale
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">Active Planner</span>
                <span className="text-xs text-slate-400">NZD Standard</span>
              </div>
              <div className="space-y-1.5 pt-2 text-xs text-slate-400 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Copy Provider:</span>
                  <span className="text-slate-300">Deterministic / OpenAI</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Price Targets:</span>
                  <span className="text-emerald-400">List, Target, Floor</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Max Payload:</span>
                  <span className="text-slate-300">3 MB / 120s max</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab("resale")}
              className="mt-4 w-full py-2 px-3 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 border border-purple-800/60 hover:border-purple-500/60 text-xs font-medium text-purple-200 flex items-center justify-center gap-2 transition-all"
            >
              Open Resale Strategy Studio
            </button>
          </div>
        </section>

        {/* INTERACTIVE WORKSPACE TABS */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
          {/* Tabs bar */}
          <div className="flex border-b border-slate-800/80 px-6 pt-4 gap-2 bg-slate-950/40 overflow-x-auto">
            <button
              onClick={() => setActiveTab("diagnostics")}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === "diagnostics"
                  ? "border-cyan-400 text-cyan-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Diagnostics & Ping Inspector
            </button>
            <button
              onClick={() => setActiveTab("valuate")}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === "valuate"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              Live Valuation (/api/valuate)
            </button>
            <button
              onClick={() => setActiveTab("resale")}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === "resale"
                  ? "border-purple-400 text-purple-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Resale Strategy Studio (/api/resale)
              <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase">New</span>
            </button>
            <button
              onClick={() => setActiveTab("android")}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === "android"
                  ? "border-indigo-400 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              Android Integration & API Guide
            </button>
          </div>

          <div className="p-6">
            {/* TAB 1: DIAGNOSTICS & PING INSPECTOR */}
            {activeTab === "diagnostics" && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Live Liveness & Metadata Inspector</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Verify local routing and internal engine configuration in real time.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={handlePingBackend}
                      disabled={pingRunning}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition-all disabled:opacity-50"
                    >
                      {pingRunning ? "Pinging..." : "Test GET /api/ping"}
                    </button>
                    <button
                      onClick={() => checkConnection(true)}
                      disabled={loading}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all disabled:opacity-50"
                    >
                      Test GET /api/connection
                    </button>
                  </div>
                </div>

                {/* Response Visualizer */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Local Ping Output */}
                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-cyan-400">GET /api/ping</span>
                        {pingResult && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                              pingResult.status === 200
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-rose-950 text-rose-300 border border-rose-800"
                            }`}
                          >
                            HTTP {pingResult.status} ({pingResult.latency}ms)
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(pingResult?.payload || { status: "ready" }, null, 2),
                            "ping-payload"
                          )
                        }
                        className="text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        {copiedSnippet === "ping-payload" ? "Copied!" : "Copy JSON"}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-900/60 p-3 rounded-lg overflow-x-auto max-h-56">
                      {JSON.stringify(
                        pingResult?.payload ?? {
                          status: "ok",
                          service: "pricesnap-backend",
                          timestamp: data?.timestamp ?? 0,
                          hint: "Click 'Test GET /api/ping' to send request",
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>

                  {/* Full System Connection State */}
                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-indigo-400">GET /api/connection</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                          Live Snapshot
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(data, null, 2), "connection-payload")}
                        className="text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        {copiedSnippet === "connection-payload" ? "Copied!" : "Copy JSON"}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-900/60 p-3 rounded-lg overflow-x-auto max-h-56">
                      {data ? JSON.stringify(data, null, 2) : "Loading connection details..."}
                    </pre>
                  </div>
                </div>

                {/* Session Event Log */}
                <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Connection & API Event Log
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Filter badges */}
                      <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
                        {(["all", "valuate", "resale", "ping", "connection"] as const).map((filter) => (
                          <button
                            key={filter}
                            onClick={() => setLogFilter(filter)}
                            className={`px-2 py-0.5 rounded capitalize transition-colors ${
                              logFilter === filter
                                ? "bg-slate-800 text-white font-semibold"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setLogs([])}
                        className="text-xs text-slate-500 hover:text-slate-300"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {filteredLogs.length === 0 ? (
                    <div className="text-xs text-slate-500 font-mono py-6 text-center">
                      No events matching current filter recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {filteredLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs font-mono"
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <span className="text-slate-500 text-[11px] shrink-0">{log.time}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase shrink-0 ${
                                log.type === "resale"
                                  ? "bg-purple-950 text-purple-400 border border-purple-800/60"
                                  : log.type === "valuate"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                                  : log.type === "ping"
                                  ? "bg-cyan-950 text-cyan-400 border border-cyan-800/60"
                                  : "bg-indigo-950 text-indigo-400 border border-indigo-800/60"
                              }`}
                            >
                              {log.endpoint}
                            </span>
                            <span className="text-slate-300 truncate">{log.message}</span>
                          </div>
                          {log.latencyMs != null && (
                            <span className="text-slate-500 text-[11px] shrink-0 ml-3">{log.latencyMs}ms</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: LIVE VALUATION SMOKE TEST */}
            {activeTab === "valuate" && (
              <div className="space-y-6">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-sm font-semibold text-white">Live Item Valuation Pipeline Test</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Send an image payload to <code className="text-cyan-400 font-mono">POST /api/valuate</code> to execute item identification, condition assessment, verified secondhand market evidence search, and deterministic pricing.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Input Selection */}
                  <div className="space-y-4">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Step 1: Choose or Upload Test Image
                    </label>

                    {/* Preset buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleLoadSampleImage("camera")}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-xs font-medium text-slate-200 transition-all flex items-center gap-1.5"
                      >
                        📷 Vintage Camera
                      </button>
                      <button
                        onClick={() => handleLoadSampleImage("watch")}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-xs font-medium text-slate-200 transition-all flex items-center gap-1.5"
                      >
                        ⌚ Chronograph Watch
                      </button>
                      <button
                        onClick={() => handleLoadSampleImage("phone")}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-xs font-medium text-slate-200 transition-all flex items-center gap-1.5"
                      >
                        📱 iPhone 13 Pro
                      </button>
                      <button
                        onClick={() => handleLoadSampleImage("console")}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-xs font-medium text-slate-200 transition-all flex items-center gap-1.5"
                      >
                        🎮 Xbox Controller
                      </button>
                      <button
                        onClick={() => handleLoadSampleImage("lens")}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-xs font-medium text-slate-200 transition-all flex items-center gap-1.5"
                      >
                        🔍 Camera Lens
                      </button>
                    </div>

                    {/* Or File Upload */}
                    <div className="relative border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-5 text-center transition-all bg-slate-950/40">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept="image/jpeg,image/png,image/webp"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center justify-center gap-2">
                        <svg className="w-7 h-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <div className="text-xs text-slate-300 font-medium">
                          Click to upload an item image, or drag and drop
                        </div>
                        <div className="text-[11px] text-slate-500">
                          JPEG, PNG, or WebP (max 3 MB decoded limit)
                        </div>
                      </div>
                    </div>

                    {/* Image Preview & Details */}
                    {testImagePreview && (
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                        <div className="w-16 h-16 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={testImagePreview}
                            alt="Test preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{testItemName}</div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {testMimeType} • ~{Math.round((testImageBase64?.length ?? 0) * 0.75 / 1024)} KB payload
                          </div>
                          <div className="text-[10px] text-emerald-400 font-medium mt-1">Ready for valuation</div>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Trigger button */}
                    <button
                      onClick={handleRunValuation}
                      disabled={!testImageBase64 || valuating}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {valuating ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                          </svg>
                          Processing Pipeline (Vision & Market Grounding)...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                          </svg>
                          Execute Valuation (POST /api/valuate)
                        </>
                      )}
                    </button>

                    {valuationError && (
                      <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300">
                        {valuationError}
                      </div>
                    )}
                  </div>

                  {/* Right: Results Display */}
                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Valuation Response
                        </span>
                        {valuationResult && (
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                              valuationResult.status === "success"
                                ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                : valuationResult.status === "heuristic"
                                ? "bg-amber-950 text-amber-300 border-amber-800"
                                : "bg-slate-900 text-slate-400 border-slate-700"
                            }`}
                          >
                            {valuationResult.status}
                          </span>
                        )}
                      </div>

                      {valuating && (
                        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                          <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                          <div className="text-xs font-medium">Identifying item and querying secondhand market...</div>
                          <div className="text-[11px] font-mono text-slate-500">Searching Trade Me & verified marketplace listings</div>
                        </div>
                      )}

                      {!valuating && valuationResult && (
                        <div className="space-y-4">
                          {/* Item Identity */}
                          <div>
                            <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider">
                              {valuationResult.item.category || "Item"}
                            </span>
                            <h4 className="text-base font-bold text-white mt-0.5">{valuationResult.item.name}</h4>
                            {(valuationResult.item.brand || valuationResult.item.model) && (
                              <p className="text-xs text-slate-400">
                                {[valuationResult.item.brand, valuationResult.item.model].filter(Boolean).join(" • ")}
                              </p>
                            )}
                            {valuationResult.item.attributes && Object.entries(valuationResult.item.attributes).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {Object.entries(valuationResult.item.attributes).map(([key, val]) => (
                                  <span key={key} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                    <span className="text-slate-500 capitalize">{key}:</span> {val}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Price Range */}
                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                                Estimated Market Value
                              </span>
                              <div className="text-xl font-extrabold text-emerald-400">
                                {valuationResult.valuation.estimatedValue !== null
                                  ? `${valuationResult.valuation.currency} $${valuationResult.valuation.estimatedValue.toFixed(2)}`
                                  : "Not enough market evidence"}
                              </div>
                            </div>
                            {valuationResult.valuation.low !== null && valuationResult.valuation.high !== null && (
                              <div className="text-right text-xs font-mono text-slate-400">
                                <div>Range: {valuationResult.valuation.currency} ${valuationResult.valuation.low} – ${valuationResult.valuation.high}</div>
                                <div className="text-[10px] text-slate-500 capitalize">
                                  Confidence: {valuationResult.confidence.level} ({Math.round(valuationResult.confidence.score * 100)}%)
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Condition & Comparables Quick Stats */}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                              <span className="text-slate-500 text-[10px] font-mono block">Condition Grade</span>
                              <span className="font-semibold text-white">{valuationResult.condition.grade}</span>
                              <span className="text-slate-400 text-[10px] block">Score: {valuationResult.condition.score}/100</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                              <span className="text-slate-500 text-[10px] font-mono block">Grounding Evidence</span>
                              <span className="font-semibold text-white">
                                {valuationResult.comparables.length} Verified Sources
                              </span>
                              <span className="text-slate-400 text-[10px] block">Market Listings</span>
                            </div>
                          </div>

                          {/* Comparables list */}
                          {valuationResult.comparables.length > 0 && (
                            <div>
                              <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1.5">
                                Verified Comparable Listings
                              </span>
                              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                {valuationResult.comparables.map((comp, idx) => (
                                  <a
                                    key={idx}
                                    href={comp.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-2 rounded bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 text-xs transition-colors"
                                  >
                                    <span className="text-slate-300 truncate max-w-[220px]">{comp.title}</span>
                                    <span className="font-mono font-semibold text-emerald-400 shrink-0">
                                      {comp.currency} ${comp.price}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {!valuating && !valuationResult && (
                        <div className="py-12 text-center text-slate-500 text-xs">
                          Select a sample above or upload an item photo to run a live valuation test.
                        </div>
                      )}
                    </div>

                    {valuationResult && (
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(valuationResult, null, 2), "valuation-json")}
                        className="mt-4 w-full py-1.5 text-center text-xs text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg hover:bg-slate-900 transition-colors"
                      >
                        {copiedSnippet === "valuation-json" ? "Copied to Clipboard!" : "Copy Raw JSON Output"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RESALE STRATEGY STUDIO */}
            {activeTab === "resale" && (
              <div className="space-y-6">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">Resale Strategy & Listing Studio</h3>
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase">
                        POST /api/resale
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Derive evidence-grounded seller strategies from item photos: suggested listing price with bargaining room, expected close target, walk-away negotiation floor, and ready-to-publish listing copy.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column: Image & Seller Preferences */}
                  <div className="space-y-4">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Step 1: Item Photo & Seller Preferences
                    </label>

                    {/* Presets */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleLoadSampleImage("phone")}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-all"
                      >
                        📱 iPhone 13 Pro
                      </button>
                      <button
                        onClick={() => handleLoadSampleImage("console")}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-all"
                      >
                        🎮 Xbox Controller
                      </button>
                      <button
                        onClick={() => handleLoadSampleImage("camera")}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-all"
                      >
                        📷 Vintage Camera
                      </button>
                    </div>

                    {/* Image Preview */}
                    {testImagePreview ? (
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                        <div className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={testImagePreview} alt="Test item" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{testItemName}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {testMimeType} • ~{Math.round((testImageBase64?.length ?? 0) * 0.75 / 1024)} KB
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
                        Choose a sample above or switch to the Valuation tab to upload an image.
                      </div>
                    )}

                    {/* Target Marketplace */}
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase">
                        Target Resale Marketplace
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {["Trade Me", "Facebook Marketplace", "eBay", "Custom"].map((mkt) => (
                          <button
                            key={mkt}
                            type="button"
                            onClick={() => setResaleMarketplace(mkt === "Custom" ? "" : mkt)}
                            className={`p-2 rounded-lg text-xs font-medium border text-center transition-all ${
                              resaleMarketplace === mkt || (mkt === "Custom" && !["Trade Me", "Facebook Marketplace", "eBay"].includes(resaleMarketplace))
                                ? "bg-purple-950 border-purple-500 text-purple-200"
                                : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {mkt}
                          </button>
                        ))}
                      </div>
                      {!["Trade Me", "Facebook Marketplace", "eBay"].includes(resaleMarketplace) && (
                        <input
                          type="text"
                          value={resaleMarketplace}
                          onChange={(e) => setResaleMarketplace(e.target.value)}
                          placeholder="Enter marketplace name (e.g. Gumtree, Mercari)"
                          className="mt-2 w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                          maxLength={80}
                        />
                      )}
                    </div>

                    {/* Seller Notes / Condition Inclusions */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[11px] font-mono text-slate-400 uppercase">
                          Included Accessories & Condition Notes
                        </label>
                        <span className="text-[10px] font-mono text-slate-500">{resaleNotes.length}/500</span>
                      </div>
                      <textarea
                        value={resaleNotes}
                        onChange={(e) => setResaleNotes(e.target.value)}
                        placeholder="e.g. Includes original box, charger, warranty receipt. Minor scratch on bottom bezel only."
                        rows={3}
                        maxLength={500}
                        className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono resize-none"
                      />
                    </div>

                    {/* Run Resale Button */}
                    <button
                      onClick={handleRunResale}
                      disabled={!testImageBase64 || resaleRunning}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-purple-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {resaleRunning ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                          </svg>
                          Calculating Strategy & Drafting Copy...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          Generate Resale Plan (POST /api/resale)
                        </>
                      )}
                    </button>

                    {resaleError && (
                      <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300">
                        {resaleError}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Strategic Output */}
                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Resale Strategy Dashboard
                        </span>
                        {resaleResult && (
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                              resaleResult.saleStrategy.basis === "evidence_derived"
                                ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                : "bg-amber-950 text-amber-300 border-amber-800"
                            }`}
                          >
                            {resaleResult.saleStrategy.basis.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      {resaleRunning && (
                        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                          <div className="text-xs font-medium">Running valuation pipeline & synthesizing seller strategy...</div>
                          <div className="text-[11px] font-mono text-slate-500">Drafting copy for {resaleMarketplace}</div>
                        </div>
                      )}

                      {!resaleRunning && resaleResult && (
                        <div className="space-y-4">
                          {/* 3 Price Target Badges */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-emerald-900/60 text-center">
                              <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400 block">
                                Suggested Listing
                              </span>
                              <div className="text-base font-extrabold text-emerald-400 mt-0.5">
                                {resaleResult.saleStrategy.suggestedListingPrice !== null
                                  ? `NZ$ ${resaleResult.saleStrategy.suggestedListingPrice}`
                                  : "Research Needed"}
                              </div>
                              <span className="text-[9px] text-slate-500 block mt-0.5">Leaves room to negotiate</span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-900 border border-cyan-900/60 text-center">
                              <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400 block">
                                Target Close
                              </span>
                              <div className="text-base font-extrabold text-cyan-400 mt-0.5">
                                {resaleResult.saleStrategy.targetSalePrice !== null
                                  ? `NZ$ ${resaleResult.saleStrategy.targetSalePrice}`
                                  : "N/A"}
                              </div>
                              <span className="text-[9px] text-slate-500 block mt-0.5">Expected sale price</span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-900 border border-amber-900/60 text-center">
                              <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400 block">
                                Walk-Away Floor
                              </span>
                              <div className="text-base font-extrabold text-amber-400 mt-0.5">
                                {resaleResult.saleStrategy.minimumNegotiationPrice !== null
                                  ? `NZ$ ${resaleResult.saleStrategy.minimumNegotiationPrice}`
                                  : "N/A"}
                              </div>
                              <span className="text-[9px] text-slate-500 block mt-0.5">Do not sell below</span>
                            </div>
                          </div>

                          {/* Listing Draft Card */}
                          <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-semibold">
                                Marketplace Listing Draft ({resaleResult.listing.provider})
                              </span>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    `${resaleResult.listing.title}\n\n${resaleResult.listing.description}`,
                                    "listing-copy"
                                  )
                                }
                                className="text-[10px] text-purple-300 hover:text-purple-100 flex items-center gap-1"
                              >
                                {copiedSnippet === "listing-copy" ? "Copied!" : "Copy Full Listing"}
                              </button>
                            </div>
                            <div className="text-xs font-bold text-white bg-slate-950 p-2 rounded border border-slate-800">
                              {resaleResult.listing.title}
                            </div>
                            <div className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800 leading-relaxed max-h-28 overflow-y-auto font-sans">
                              {resaleResult.listing.description}
                            </div>
                          </div>

                          {/* Negotiation Guidance */}
                          {resaleResult.negotiationGuidance?.length > 0 && (
                            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 block mb-1.5">
                                Strategic Negotiation Guidance
                              </span>
                              <ul className="space-y-1 text-xs text-slate-300">
                                {resaleResult.negotiationGuidance.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5">
                                    <span className="text-cyan-400 text-xs leading-tight">•</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Pre-Listing Checklist */}
                          {resaleResult.listingChecklist?.length > 0 && (
                            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1.5">
                                Pre-Listing Verification Checklist
                              </span>
                              <div className="space-y-1 text-xs">
                                {resaleResult.listingChecklist.map((task, idx) => (
                                  <label
                                    key={idx}
                                    className="flex items-start gap-2 cursor-pointer text-slate-300 hover:text-slate-100"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(checkedChecklist[idx])}
                                      onChange={(e) =>
                                        setCheckedChecklist((prev) => ({ ...prev, [idx]: e.target.checked }))
                                      }
                                      className="rounded bg-slate-800 border-slate-700 text-purple-600 focus:ring-0 mt-0.5"
                                    />
                                    <span className={checkedChecklist[idx] ? "line-through text-slate-500" : ""}>
                                      {task}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {!resaleRunning && !resaleResult && (
                        <div className="py-16 text-center text-slate-500 text-xs">
                          Select an item photo, configure marketplace & seller notes, and click Generate Resale Plan.
                        </div>
                      )}
                    </div>

                    {resaleResult && (
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(resaleResult, null, 2), "resale-json")}
                        className="mt-4 w-full py-1.5 text-center text-xs text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg hover:bg-slate-900 transition-colors"
                      >
                        {copiedSnippet === "resale-json" ? "Copied to Clipboard!" : "Copy Raw Resale JSON"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: ANDROID & API INTEGRATION GUIDE */}
            {activeTab === "android" && (
              <div className="space-y-6">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-sm font-semibold text-white">Android Integration & API Reference</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your mobile or client application to PriceSnap backend endpoints using Retrofit, OkHttp, or standard HTTP JSON requests.
                  </p>
                </div>

                {/* API Endpoint Table */}
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Endpoint</th>
                        <th className="px-4 py-2.5 font-semibold">Method</th>
                        <th className="px-4 py-2.5 font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="px-4 py-3 text-cyan-400 font-bold">/api/valuate</td>
                        <td className="px-4 py-3 text-emerald-400">POST</td>
                        <td className="px-4 py-3 text-slate-300">Item identification, visual condition, and NZD market valuation.</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-purple-400 font-bold">/api/resale</td>
                        <td className="px-4 py-3 text-emerald-400">POST</td>
                        <td className="px-4 py-3 text-slate-300">Strategic resale pricing targets, negotiation floor, and listing draft.</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-cyan-400 font-bold">/api/connection</td>
                        <td className="px-4 py-3 text-emerald-400">GET</td>
                        <td className="px-4 py-3 text-slate-300">System health check, engine status, and configured AI models.</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-cyan-400 font-bold">/api/ping</td>
                        <td className="px-4 py-3 text-emerald-400">GET</td>
                        <td className="px-4 py-3 text-slate-300">Low-latency heartbeat liveness check.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Kotlin Integration Snippets */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300">1. Kotlin Data Transfer Objects (Retrofit)</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `data class ValuateRequest(
    val imageBase64: String,
    val mimeType: String = "image/jpeg"
)

data class ResaleRequest(
    val imageBase64: String,
    val mimeType: String = "image/jpeg",
    val preferences: ResalePreferences? = null
)

data class ResalePreferences(
    val marketplace: String? = null,
    val notes: String? = null
)

data class SaleStrategy(
    val currency: String,
    val suggestedListingPrice: Double?,
    val targetSalePrice: Double?,
    val minimumNegotiationPrice: Double?,
    val basis: String
)

data class ResaleResponse(
    val ok: Boolean,
    val status: String,
    val valuation: AppraisalResponse,
    val saleStrategy: SaleStrategy,
    val listing: ListingDraft,
    val negotiationGuidance: List<String>,
    val listingChecklist: List<String>
)`,
                            "kotlin-code"
                          )
                        }
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        {copiedSnippet === "kotlin-code" ? "Copied!" : "Copy Kotlin"}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto max-h-64">
{`data class ResaleRequest(
    val imageBase64: String,
    val mimeType: String = "image/jpeg",
    val preferences: ResalePreferences? = null
)

data class ResalePreferences(
    val marketplace: String? = "Trade Me",
    val notes: String? = null
)

data class SaleStrategy(
    val currency: String,
    val suggestedListingPrice: Double?,
    val targetSalePrice: Double?,
    val minimumNegotiationPrice: Double?,
    val basis: String
)`}
                    </pre>
                  </div>

                  {/* cURL Commands */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300">2. CLI Smoke Test (cURL)</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `# Resale Strategy Test
curl -X POST http://localhost:3000/api/resale \\
  -H "Content-Type: application/json" \\
  -d '{
    "imageBase64": "...",
    "mimeType": "image/jpeg",
    "preferences": {
      "marketplace": "Trade Me",
      "notes": "Includes box and charger"
    }
  }'`,
                            "curl-code"
                          )
                        }
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        {copiedSnippet === "curl-code" ? "Copied!" : "Copy cURL"}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto">
{`# 1. Valuate Endpoint
curl -X POST http://localhost:3000/api/valuate \\
  -H "Content-Type: application/json" \\
  -d '{"imageBase64":"<BASE64_IMAGE>","mimeType":"image/jpeg"}'

# 2. Resale Strategy Endpoint
curl -X POST http://localhost:3000/api/resale \\
  -H "Content-Type: application/json" \\
  -d '{"imageBase64":"<BASE64_IMAGE>","mimeType":"image/jpeg","preferences":{"marketplace":"Trade Me","notes":"Includes box"}}'`}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 bg-slate-950/40 py-6 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>PriceSnap Compatibility Backend • Connected to shared PriceSnap AI Engine</p>
          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px] flex-wrap justify-center">
            <span>GET /api/ping</span>
            <span>•</span>
            <span>GET /api/connection</span>
            <span>•</span>
            <span>POST /api/valuate</span>
            <span>•</span>
            <span>POST /api/resale</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
