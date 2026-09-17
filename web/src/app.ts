// Simple app configuration for Praise.Army
export enum Mode {
  DEV = "development",
  PROD = "production",
}

// Determine mode from import.meta.env
interface WithEnvMode {
  readonly env: {
    readonly MODE: Mode;
  };
}

export const mode = (import.meta as unknown as WithEnvMode).env.MODE as Mode;

// API URL - detect based on environment
export const API_URL = (() => {
  if (typeof window === "undefined") return "http://localhost:3000/api";
  if (mode === Mode.PROD) {
    return `${window.location.origin}/api`;
  }
  // Development: assume API runs on localhost:3000
  return "http://localhost:3000/api";
})();

// WebSocket API URL
export const WS_API_URL = (() => {
  if (typeof window === "undefined") return "ws://localhost:3000";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (mode === Mode.PROD) {
    return `${protocol}//${window.location.host}`;
  }
  return `${protocol}//localhost:3000`;
})();
