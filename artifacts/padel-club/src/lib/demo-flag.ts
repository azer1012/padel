/** Build-time flag (VITE_DEMO=true). Production builds compile every demo branch away. */
export const DEMO = import.meta.env.VITE_DEMO === "true";
