import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./lib/pwa";
import { DEMO } from "./lib/demo-flag";
import { supabase } from "./lib/supabase";

async function start() {
  // Demo builds only (VITE_DEMO=true): an in-memory club replaces the API and auth.
  // In production builds DEMO is the literal `false` and this import is dropped.
  if (DEMO) (await import("./lib/demo")).installDemo(supabase);
  createRoot(document.getElementById("root")!).render(<App />);
  registerServiceWorker();
}

void start();
