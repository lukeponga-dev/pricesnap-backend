"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  type: "ping" | "connection" | "valuate" | "system";
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

export default function Home() {
  const [data, setData] = useState<ConnectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(15);
  const [activeTab, setActiveTab] = useState<"diagnostics" | "valuate" | "android">("diagnostics");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Ping Inspector state
  const [pingRunning, setPingRunning] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{ status: number; latency: number; payload: unknown } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Valuation test state
  const [testImageBase64, setTestImageBase64] = useState<string | null>(null);
  const [testMimeType, setTestMimeType] = useState<string>("image/jpeg");
  const [testImagePreview, setTestImagePreview] = useState<string | null>(null);
  const [valuating, setValuating] = useState<boolean>(false);
  const [valuationResult, setValuationResult] = useState<ValuationResult | null>(null);
  const [valuationError, setValuationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          ? `Backend online; internal engine configured (provider not tested)`
          : `Backend online, internal engine not configured (Gemini key missing)`,
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

  // Initial load via fetch on mount
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
            ? `Backend online; internal engine configured (provider not tested)`
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

  // Auto-refresh timer
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

  // Quick Ping backend action
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

  // Generate a sample synthetic item image on client canvas
  const handleLoadSampleImage = (type: "camera" | "watch" | "lens") => {
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
      // Draw vintage camera graphic
      ctx.fillStyle = "#334155";
      ctx.roundRect(70, 130, 260, 170, 16);
      ctx.fill();

      // Top housing
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.roundRect(110, 100, 180, 40, [8, 8, 0, 0]);
      ctx.fill();

      // Shutter button & dial
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(90, 115, 20, 15);
      ctx.fillRect(280, 115, 30, 15);

      // Lens outer ring
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(200, 215, 65, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#38bdf8";
      ctx.stroke();

      // Lens inner reflections
      ctx.fillStyle = "#0369a1";
      ctx.beginPath();
      ctx.arc(200, 215, 45, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(185, 200, 14, 0, Math.PI * 2);
      ctx.fill();

      // Label text
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PRICESNAP TEST • 35MM CAMERA", 200, 340);
    } else if (type === "watch") {
      // Draw chronograph watch
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

      // Markers & hands
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(200, 200);
      ctx.lineTo(200, 130);
      ctx.moveTo(200, 200);
      ctx.lineTo(250, 200);
      ctx.stroke();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("CHRONOGRAPH WATCH SAMPLE", 200, 340);
    } else {
      // Audio gear
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
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("STUDIO AUDIO HARDWARE", 200, 340);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    setTestImageBase64(base64);
    setTestMimeType("image/jpeg");
    setTestImagePreview(dataUrl);
    setValuationResult(null);
    setValuationError(null);
  };

  // Handle local file upload
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
      setValuationResult(null);
      setValuationError(null);
    };
    reader.readAsDataURL(file);
  };

  // Run live valuation smoke test via POST /api/valuate
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
        message: `Analysing image (${Math.round((testImageBase64.length * 3) / 4 / 1024)} KB) to PriceSnap engine...`,
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

      if (!res.ok && res.status !== 503) {
        throw new Error(json.error || `HTTP ${res.status}: ${json.code || "VALUATION_FAILED"}`);
      }

      setValuationResult(json);
      addLog({
        type: "valuate",
        endpoint: "/api/valuate",
        status: "success",
        latencyMs: latency,
        message: `Valuation completed: ${json.item?.name || "Item recognized"} -> NZD $${json.valuation?.estimatedValue ?? "Insufficient evidence"}`,
        details: json,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Valuation request failed";
      setValuationError(msg);
      addLog({
        type: "valuate",
        endpoint: "/api/valuate",
        status: "error",
        latencyMs: Math.round(performance.now() - start),
        message: `POST /api/valuate error: ${msg}`,
      });
    } finally {
      setValuating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  const isEngineConfigured = data?.engine.hasApiKey && data.engine.status === "configured";
  const isBackendHealthy = data?.backend.status === "online";
  const overallConnected = isBackendHealthy && (isEngineConfigured || data?.engine.hasApiKey);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[160px]" />
      </div>

      {/* Top Navigation / Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 p-[1px] shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-lg text-white">PriceSnap</span>
                <span className="text-xs uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  Backend Service
                </span>
                <span className="text-xs font-mono text-slate-400 border border-slate-800 px-1.5 py-0.2 rounded bg-slate-900/80">
                  v0.1.0
                </span>
              </div>
              <p className="text-xs text-slate-400">Android Internal Valuation API</p>
            </div>
          </div>

          {/* Real-time Status Badge & Controls */}
          <div className="flex items-center gap-3">
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
                  ? "All Systems Connected"
                  : "Connection Degraded"}
              </span>
              {data?.engine.geminiLatencyMs != null && (
                <span className="text-[11px] font-mono opacity-80 pl-1 border-l border-emerald-500/30">
                  ⚡ {data.engine.geminiLatencyMs}ms RTT
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
                strokeLinecap="round"
                strokeLinejoin="round"
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

        {/* CONNECTION TOPOLOGY VISUALIZER */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800/60 gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
                End-to-End Connection Pipeline
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Visualizing data flow from Android clients through this compatibility proxy to the AI valuation engine
              </p>
            </div>
            {lastUpdated && (
              <span className="text-xs font-mono text-slate-500">
                Last checked: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Interactive Topology Graph */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-6 items-center">
            {/* Node 1: Android Client */}
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
                <p className="text-xs text-slate-400 font-mono mt-0.5">POST /api/valuate</p>
              </div>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-900 flex justify-between">
                <span>Base64 JPEG/PNG</span>
                <span>≤ 3 MB</span>
              </div>
            </div>

            {/* Arrow 1 */}
            <div className="hidden md:flex flex-col items-center justify-center text-center">
              <div className="text-[10px] font-mono text-cyan-400 mb-1">JSON Payload</div>
              <div className="w-full flex items-center">
                <div className="h-[2px] flex-1 bg-gradient-to-r from-emerald-500/40 to-cyan-500/40 relative">
                  <div className="absolute right-0 -top-1 w-2 h-2 border-t-2 border-r-2 border-cyan-400 transform rotate-45"></div>
                </div>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-1">HTTPS / 120s</div>
            </div>

            {/* Node 2: PriceSnap Backend (This Service) */}
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
                <h3 className="text-sm font-semibold text-white">PriceSnap Backend</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Internal Valuation API</p>
              </div>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-900 flex justify-between">
                <span>Next.js 16</span>
                <span>Node {data?.backend.nodeVersion ?? "v20+"}</span>
              </div>
            </div>

            {/* Node 3: Internal PriceSnap AI Engine */}
            <div className={`relative p-4 rounded-xl bg-slate-950/80 border transition-all ${
              isEngineConfigured
                ? "border-emerald-500/50 shadow-md shadow-emerald-500/5"
                : data?.engine.hasApiKey
                ? "border-amber-500/50"
                : "border-rose-500/50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  isEngineConfigured
                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                    : "bg-amber-950/80 text-amber-300 border-amber-700/60"
                }`}>
                  {data?.engine.status || "Checking"}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Valuation Engine</h3>
                <p className="text-xs text-slate-400 font-mono truncate mt-0.5" title={data?.engine.model}>
                  {data?.engine.model ?? "Gemini"}
                </p>
              </div>
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-900 flex justify-between">
                <span>{data?.engine.engineVersion ? `v${data.engine.engineVersion}` : "internal-1.0.0"}</span>
                <span>{data?.engine.hasApiKey ? "Gemini Key ✓" : "Key Needed"}</span>
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
              {pingRunning ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  Testing Ping...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Execute GET /api/ping
                </>
              )}
            </button>
          </div>

          {/* Card 2: Internal Engine */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Internal AI Engine (configuration only)</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-800/40">
                  /api/connection
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {data?.engine.status ? data.engine.status.toUpperCase() : "CHECKING"}
                </span>
                <span className="text-xs font-mono text-cyan-400">
                  {data?.engine.geminiLatencyMs != null ? `${data.engine.geminiLatencyMs}ms` : "--"}
                </span>
              </div>
              <div className="space-y-1.5 pt-2 text-xs text-slate-400 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Service:</span>
                  <span className="text-slate-300">{data?.engine.service ?? "pricesnap-api"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Gemini Key:</span>
                  <span className={data?.engine.hasApiKey ? "text-emerald-400" : "text-amber-400"}>
                    {data?.engine.hasApiKey ? "Configured ✓" : "Missing / Not set"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Engine Ver:</span>
                  <span className="text-slate-300">{data?.engine.engineVersion ?? "internal-1.0.0"}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => checkConnection(true)}
              className="mt-4 w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/40 text-xs font-medium text-indigo-300 flex items-center justify-center gap-2 transition-all"
              id="test-internal-btn"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Check Engine Configuration
            </button>
          </div>

          {/* Card 3: Android API Contract */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Android Contract</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                  /api/valuate
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">NZD Currency</span>
                <span className="text-xs text-slate-400">0–100 Scale</span>
              </div>
              <div className="space-y-1.5 pt-2 text-xs text-slate-400 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Max Payload:</span>
                  <span className="text-slate-300">3,000,000 bytes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">MIME Types:</span>
                  <span className="text-slate-300">JPEG, PNG, WebP</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Max Duration:</span>
                  <span className="text-slate-300">120 seconds</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab("android")}
              className="mt-4 w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/40 text-xs font-medium text-emerald-300 flex items-center justify-center gap-2 transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              View Client Integration Code
            </button>
          </div>
        </section>

        {/* INTERACTIVE WORKSPACE TABS */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
          {/* Tabs bar */}
          <div className="flex border-b border-slate-800/80 px-6 pt-4 gap-2 bg-slate-950/40">
            <button
              onClick={() => setActiveTab("diagnostics")}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
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
              Connection Diagnostics & Ping Inspector
            </button>
            <button
              onClick={() => setActiveTab("valuate")}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === "valuate"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              Live Valuation Smoke Test
            </button>
            <button
              onClick={() => setActiveTab("android")}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === "android"
                  ? "border-indigo-400 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              Android Integration Guide
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
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      Connection Event Log
                    </h4>
                    <button
                      onClick={() => setLogs([])}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Clear Log
                    </button>
                  </div>
                  {logs.length === 0 ? (
                    <div className="text-xs text-slate-500 font-mono py-4 text-center">
                      No events recorded yet in this session.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs font-mono"
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <span className="text-slate-500 text-[11px] shrink-0">{log.time}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase shrink-0 ${
                                log.status === "success"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                                  : log.status === "pending"
                                  ? "bg-amber-950 text-amber-400 border border-amber-800/60"
                                  : "bg-rose-950 text-rose-400 border border-rose-800/60"
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
                      Send a real photo payload to <code className="text-cyan-400 font-mono">POST /api/valuate</code> to test Gemini recognition, Google Search grounding, global valuation, and Android response mapping.
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
                        onClick={() => handleLoadSampleImage("lens")}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-xs font-medium text-slate-200 transition-all flex items-center gap-1.5"
                      >
                        🎙️ Audio Hardware
                      </button>
                    </div>

                    {/* Upload Dropzone */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-800 hover:border-cyan-500/50 rounded-xl p-6 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition-all"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <svg
                        className="w-8 h-8 text-slate-500 mx-auto mb-2"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <p className="text-xs font-medium text-slate-300">Click to upload photo or drag & drop</p>
                      <p className="text-[11px] text-slate-500 mt-1">JPEG, PNG, or WebP up to 3,000,000 bytes</p>
                    </div>

                    {/* Image preview */}
                    {testImagePreview && (
                      <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-950 border border-slate-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={testImagePreview}
                          alt="Test item preview"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-700"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">Image ready for valuation</p>
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                            MIME: {testMimeType} • Size: {testImageBase64 ? Math.round((testImageBase64.length * 3) / 4 / 1024) : 0} KB
                          </p>
                        </div>
                        <button
                          onClick={handleRunValuation}
                          disabled={valuating}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                          id="submit-valuation-btn"
                        >
                          {valuating ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                              </svg>
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                              Valuate Photo
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {valuationError && (
                      <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 font-mono">
                        Error: {valuationError}
                      </div>
                    )}
                  </div>

                  {/* Right: Valuation Results */}
                  <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Valuation Output (Android DTO)
                        </span>
                        {valuationResult && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              valuationResult.status === "success"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : "bg-amber-950 text-amber-400 border border-amber-800"
                            }`}
                          >
                            {valuationResult.status}
                          </span>
                        )}
                      </div>

                      {valuating ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-xs text-slate-300 font-medium">Forwarding to Gemini Engine...</p>
                          <p className="text-[11px] text-slate-500">Searching market comparables & assessing condition</p>
                        </div>
                      ) : valuationResult ? (
                        <div className="space-y-4">
                          {/* Item card */}
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
                                   ? `${valuationResult.valuation.currency} ${valuationResult.valuation.estimatedValue.toFixed(2)}`
                                   : "Not enough market evidence"}
                               </div>
                            </div>
                            {valuationResult.valuation.low !== null && valuationResult.valuation.high !== null && (
                               <div className="text-right text-xs font-mono text-slate-400">
                                 <div>Range: {valuationResult.valuation.currency} {valuationResult.valuation.low} – {valuationResult.valuation.high}</div>
                                 <div className="text-[10px] text-slate-500 capitalize">
                                   Confidence: {valuationResult.confidence.level}
                                 </div>
                               </div>
                            )}
                          </div>

                          {/* Condition & Comparables */}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                              <span className="text-slate-500 text-[10px] font-mono block">Condition Grade</span>
                              <span className="font-semibold text-white">{valuationResult.condition.grade}</span>
                              <span className="text-slate-400 text-[10px] block">
                                Score: {valuationResult.condition.score}/100
                              </span>
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
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                              <span className="text-[10px] font-mono uppercase text-slate-500">Market Listings</span>
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
                                 {comp.currency} {comp.price}
                               </span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
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

            {/* TAB 3: ANDROID CLIENT INTEGRATION */}
            {activeTab === "android" && (
              <div className="space-y-6">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-sm font-semibold text-white">Android Retrofit / OkHttp Integration Guide</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your Android application to this backend instance using Kotlin and Retrofit.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Kotlin DTO */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300">1. Kotlin Data Transfer Objects</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `data class ValuateRequest(
    val imageBase64: String,
    val mimeType: String = "image/jpeg"
)

data class AppraisalResponse(
    val ok: Boolean,
    val status: String,
    val item: ItemDetails,
    val condition: ConditionDetails,
    val valuation: Valuation,
    val confidence: ConfidenceDetails,
    val comparables: List<ComparableItem>
)

data class Valuation(
    val currency: String,
    val estimatedValue: Double?,
    val low: Double?,
    val high: Double?
)`,
                            "kotlin-dto"
                          )
                        }
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        {copiedSnippet === "kotlin-dto" ? "Copied!" : "Copy Kotlin"}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto">
{`data class ValuateRequest(
    val imageBase64: String,
    val mimeType: String = "image/jpeg"
)

data class Valuation(
    val currency: String,
    val estimatedValue: Double?,
    val low: Double?,
    val high: Double?
)`}
                    </pre>
                  </div>

                  {/* cURL command */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300">2. CLI Smoke Test (cURL)</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `curl -X POST http://localhost:3000/api/valuate \\
  -H "Content-Type: application/json" \\
  -d '{"imageBase64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","mimeType":"image/png"}'`,
                            "curl-cmd"
                          )
                        }
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        {copiedSnippet === "curl-cmd" ? "Copied!" : "Copy cURL"}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto">
{`curl -X POST http://localhost:3000/api/valuate \\
  -H "Content-Type: application/json" \\
  -d '{"imageBase64":"<BASE64_JPEG_OR_PNG>","mimeType":"image/jpeg"}'`}
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
          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span>GET /api/ping</span>
            <span>•</span>
            <span>GET /api/connection</span>
            <span>•</span>
            <span>POST /api/valuate</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

