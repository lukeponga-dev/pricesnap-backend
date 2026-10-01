import { ApiError } from "../api/errors";

let cachedRate: number | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 86_400_000; 
const API_KEY = "ce7e98b47244a9fb2a7068a7";

export async function getUsdToNzdRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate && (now - lastFetch < CACHE_TTL)) {
    return cachedRate;
  }

  try {
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`);
    if (!response.ok) throw new Error(`Exchange rate API failure: ${response.status}`);
    
    const data = await response.json();
    const rate = data.conversion_rates?.NZD;
    
    if (!rate || typeof rate !== "number") throw new Error("Invalid rate data");
    
    cachedRate = rate;
    lastFetch = now;
    return rate;
  } catch (error) {
    console.error("Currency fetch failed, using fallback 1.65", error);
    return 1.65;
  }
}
