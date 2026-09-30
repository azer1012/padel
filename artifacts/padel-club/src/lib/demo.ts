/**
 * DEMO MODE — only active when built with VITE_DEMO=true.
 *
 * Serves a realistic, in-memory club for every /api/* call and fakes Supabase
 * auth, so the real UI runs without the API server or a Supabase project.
 * Used for design reviews and for showing the product to club owners.
 * Production builds never enable it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEMO = import.meta.env.VITE_DEMO === "true";

type Player = { id: number; userId: number | null; name: string; paymentType: "token" | "cash"; paymentStatus: "paid" | "pending" };
type Booking = { id: number; terrainId: number; start: Date; end: Date; mode: "full_court" | "own_spot"; isPublic: boolean; desc: string | null; players: Player[]; creator: string; createdAt: string; status: "confirmed" | "cancelled" };

const ME_ID = 1;
const NAMES = ["Sami Arfaoui", "Yosra Mejri", "Karim Belhadj", "Ines Tlili", "Nour Kallel", "Rami Trabelsi", "Leila Hammami", "Omar Sassi", "Hedi Zouari", "Salma Bouazizi", "Amine Riahi", "Mehdi Laabidi"];
const TIMES = [[8, 0], [9, 30], [11, 0], [12, 30], [14, 0], [15, 30], [17, 0], [18, 30], [20, 0], [21, 30]];
const DESCS = ["Match amical, niveau 3", "Niveau 4 à 5, compétitif", "Débutants bienvenus", "Mixte, bonne ambiance", null];

const terrains = [
  { id: 1, name: "Court Central", type: "indoor", description: "Panoramique, vitres intégrales" },
  { id: 2, name: "Court 2", type: "indoor", description: null },
  { id: 3, name: "Court 3", type: "indoor", description: null },
  { id: 4, name: "Court 4", type: "outdoor", description: null },
  { id: 5, name: "Court 5", type: "outdoor", description: null },
  { id: 6, name: "Court Lac", type: "outdoor", description: "Vue sur le lac" },
].map((t) => ({ ...t, isActive: true, pricePerPerson: 25, capacity: 4, openingTime: "08:00", closingTime: "23:00", photos: [], createdAt: "2026-01-10T10:00:00Z" }));

const me = { id: ME_ID, supabaseAuthId: "demo-user", email: "yasmine@demo.tn", firstName: "Yasmine", lastName: "Ben Ali", phone: "+216 22 123 456", role: "admin", avatarUrl: null, tokenBalance: 9, language: "fr", createdAt: "2026-02-01T10:00:00Z" };
let balance = 9;
let nextId = 1000;
const bookings = new Map<string, Booking>();
const seededDays = new Set<string>();
const txs: any[] = [
  { id: 3, userId: ME_ID, type: "debit", amount: 1, balanceAfter: 9, description: "Open match · Court 4", createdAt: new Date(Date.now() - 86400e3).toISOString() },
  { id: 2, userId: ME_ID, type: "debit", amount: 4, balanceAfter: 10, description: "Réservation · Court Central", createdAt: new Date(Date.now() - 3 * 86400e3).toISOString() },
  { id: 1, userId: ME_ID, type: "credit", amount: 14, balanceAfter: 14, description: "Recharge accueil · 350 TND", createdAt: new Date(Date.now() - 5 * 86400e3).toISOString() },
];
const notifications = [
  { id: 1, userId: ME_ID, type: "reservation_reminder", title: "Match dans 2 h", message: "Court Central à 18:30. Pensez à vos balles !", isRead: false, createdAt: new Date(Date.now() - 20 * 60e3).toISOString() },
  { id: 2, userId: ME_ID, type: "tokens_added", title: "14 tokens ajoutés", message: "Votre recharge à l'accueil est disponible.", isRead: false, createdAt: new Date(Date.now() - 5 * 86400e3).toISOString() },
  { id: 3, userId: ME_ID, type: "announcement", title: "Tournoi de printemps", message: "Les inscriptions sont ouvertes.", isRead: true, createdAt: new Date(Date.now() - 7 * 86400e3).toISOString() },
];
const tournaments = [
  { id: 1, name: "Open de Printemps", description: "Tournoi en double, poules puis tableau final. Tous niveaux à partir de 3.", status: "open", startDate: addDaysIso(9), endDate: addDaysIso(10), maxTeams: 16, registeredTeams: 11, prizeInfo: "Raquettes pour les vainqueurs + 20 tokens", imageUrl: null, createdAt: addDaysIso(-10) },
  { id: 2, name: "Night Padel Cup", description: "Format court, matchs en nocturne sur les terrains outdoor.", status: "upcoming", startDate: addDaysIso(24), endDate: null, maxTeams: 12, registeredTeams: 0, prizeInfo: null, imageUrl: null, createdAt: addDaysIso(-4) },
  { id: 3, name: "Coupe d'Hiver", description: "Merci aux 24 équipes pour cette belle édition !", status: "completed", startDate: addDaysIso(-40), endDate: addDaysIso(-39), maxTeams: 24, registeredTeams: 24, prizeInfo: null, imageUrl: null, createdAt: addDaysIso(-70) },
];
const news = [
  { id: 1, title: "Deux nouveaux terrains panoramiques", excerpt: "Le Court Central et le Court Lac ont été entièrement rénovés.", content: "Vitres intégrales, nouvel éclairage LED et gazon neuf.\n\nLes deux terrains sont ouverts à la réservation dès aujourd'hui, en indoor comme en outdoor.", imageUrl: "/terrain-indoor.webp", isPublished: true, publishedAt: addDaysIso(-2), category: "Club", createdAt: addDaysIso(-2) },
  { id: 2, title: "Les open matches arrivent", excerpt: "Plus besoin de trouver trois partenaires pour jouer.", content: "Réservez votre place, cochez « open match », et les joueurs du club peuvent vous rejoindre pour 1 token.", imageUrl: null, isPublished: true, publishedAt: addDaysIso(-6), category: "Nouveauté", createdAt: addDaysIso(-6) },
  { id: 3, title: "Inscriptions Open de Printemps", excerpt: "16 équipes, deux jours de padel.", content: "Inscrivez votre équipe depuis la page Tournois.", imageUrl: "/tournament.webp", isPublished: true, publishedAt: addDaysIso(-9), category: "Tournoi", createdAt: addDaysIso(-9) },
];
const users = [me, ...NAMES.slice(0, 9).map((n, i) => ({ id: i + 2, supabaseAuthId: `u${i}`, email: `${n.split(" ")[0].toLowerCase()}@mail.tn`, firstName: n.split(" ")[0], lastName: n.split(" ")[1], phone: null, role: "player", avatarUrl: null, tokenBalance: (i * 7) % 13, language: "fr", createdAt: addDaysIso(-30 - i) }))];

function addDaysIso(n: number) { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); return d.toISOString(); }
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const key = (terrainId: number, start: Date) => `${terrainId}|${start.toISOString()}`;
const hash = (n: number) => { let x = Math.imul(n, 2654435761) >>> 0; x = (x ^ (x >>> 13)) >>> 0; return x % 100; };

function slotsFor(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return TIMES.map(([h, mi]) => { const s = new Date(y, m - 1, d, h, mi); return { start: s, end: new Date(s.getTime() + 90 * 60e3) }; });
}

function seed(day: string) {
  if (seededDays.has(day)) return;
  seededDays.add(day);
  const dayNum = Math.floor(new Date(day + "T12:00:00").getTime() / 86400e3);
  const isToday = day === dayKey(new Date());
  terrains.forEach((t) => slotsFor(day).forEach(({ start, end }, si) => {
    const r = hash(dayNum * 97 + t.id * 13 + si * 7);
    const evening = si >= 6;
    const busyChance = evening ? 62 : 30;
    if (r >= busyChance) return;
    const own = r % 3 === 0;
    const filled = own ? 1 + (r % 3) : 4;
    const players: Player[] = Array.from({ length: filled }, (_, k) => ({ id: nextId++, userId: 100 + k, name: NAMES[(r + k * 3 + t.id) % NAMES.length], paymentType: k % 3 ? "token" : "cash", paymentStatus: k % 4 === 3 ? "pending" : "paid" }));
    bookings.set(key(t.id, start), { id: nextId++, terrainId: t.id, start, end, mode: own ? "own_spot" : "full_court", isPublic: own && r % 2 === 0, desc: own ? DESCS[r % DESCS.length] : null, players, creator: players[0].name, createdAt: new Date().toISOString(), status: "confirmed" });
  }));
  if (isToday) {
    // My match tonight on the central court
    const mine = slotsFor(day)[7];
    bookings.set(key(1, mine.start), { id: 501, terrainId: 1, start: mine.start, end: mine.end, mode: "full_court", isPublic: false, desc: null,
      players: [{ id: 9001, userId: ME_ID, name: "Yasmine Ben Ali", paymentType: "token", paymentStatus: "paid" }, { id: 9002, userId: 102, name: "Karim Belhadj", paymentType: "token", paymentStatus: "paid" }, { id: 9003, userId: 103, name: "Ines Tlili", paymentType: "cash", paymentStatus: "pending" }, { id: 9004, userId: 104, name: "Omar Sassi", paymentType: "token", paymentStatus: "paid" }],
      creator: "Yasmine Ben Ali", createdAt: new Date().toISOString(), status: "confirmed" });
  }
}

function calendarSlot(t: (typeof terrains)[number], start: Date, end: Date) {
  const b = bookings.get(key(t.id, start));
  const past = end.getTime() < Date.now();
  const live = b && b.status === "confirmed" ? b : null;
  const total = 4, filled = live ? live.players.length : 0;
  return {
    startTime: start.toISOString(), endTime: end.toISOString(),
    status: past ? "past" : !live ? "available" : filled >= total || live.mode === "full_court" ? "full" : "partial",
    reservationId: live?.id ?? null, bookingMode: live?.mode ?? null, totalSpots: total, filledSpots: live?.mode === "full_court" ? 4 : filled,
    openSpots: live ? (live.mode === "full_court" ? 0 : total - filled) : total, isPublic: live?.isPublic ?? false, publicDescription: live?.desc ?? null,
    players: live?.players ?? [], creatorName: live?.creator ?? null,
  };
}

const terrainOf = (id: number) => terrains.find((t) => t.id === id)!;
const byId = (id: number) => Array.from(bookings.values()).find((b) => b.id === id);
const asReservation = (b: Booking) => ({ id: b.id, terrainId: b.terrainId, userId: ME_ID, startTime: b.start.toISOString(), endTime: b.end.toISOString(), status: b.status,
  tokensCharged: b.mode === "full_court" ? 4 : 1, bookingType: "online", notes: null, terrain: terrainOf(b.terrainId), createdAt: b.createdAt });
const mineList = () => { for (let i = -3; i < 14; i++) seed(dayKey(new Date(Date.now() + i * 86400e3))); return Array.from(bookings.values()).filter((b) => b.players.some((p) => p.userId === ME_ID)); };
function charge(n: number, description: string, credit = false) {
  balance += credit ? n : -n; me.tokenBalance = balance;
  txs.unshift({ id: nextId++, userId: ME_ID, type: credit ? "credit" : "debit", amount: n, balanceAfter: balance, description, createdAt: new Date().toISOString() });
}

type Handler = (m: RegExpMatchArray, url: URL, body: any, method: string) => [number, any];
const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/api\/users\/me$/, () => [200, me]],
  ["PATCH", /^\/api\/users\/me$/, (_m, _u, b) => { Object.assign(me, b); return [200, me]; }],
  ["POST", /^\/api\/users\/sync$/, () => [200, me]],
  ["GET", /^\/api\/users$/, () => [200, { data: users, total: users.length, page: 1, limit: 50 }]],
  ["GET", /^\/api\/tokens\/balance$/, () => [200, { userId: ME_ID, balance, pendingExpiry: 2, nextExpiryDate: addDaysIso(12) }]],
  ["GET", /^\/api\/tokens\/transactions$/, () => [200, { data: txs, total: txs.length, page: 1, limit: 30 }]],
  ["GET", /^\/api\/tokens\/admin\/transactions$/, () => [200, { data: txs.map((t) => ({ ...t, user: me })), total: txs.length, page: 1, limit: 25 }]],
  ["POST", /^\/api\/tokens\/admin\/adjust$/, (_m, _u, b) => { if (b.userId === ME_ID) charge(b.amount, b.description, b.type !== "debit"); return [200, txs[0]]; }],
  ["GET", /^\/api\/terrains$/, () => [200, terrains]],
  ["GET", /^\/api\/calendar$/, (_m, u) => {
    const day = u.searchParams.get("date")!; seed(day);
    return [200, { date: day, terrains: terrains.map((t) => ({ terrain: t, slots: slotsFor(day).map(({ start, end }) => calendarSlot(t, start, end)) })) }];
  }],
  ["GET", /^\/api\/open-matches$/, () => {
    for (let i = 0; i < 4; i++) seed(dayKey(new Date(Date.now() + i * 86400e3)));
    const list = Array.from(bookings.values()).filter((b) => b.status === "confirmed" && b.isPublic && b.mode === "own_spot" && b.players.length < 4 && b.start.getTime() > Date.now() && !b.players.some((p) => p.userId === ME_ID))
      .sort((a, b) => +a.start - +b.start).slice(0, 12);
    return [200, list.map((b) => ({ reservationId: b.id, terrain: terrainOf(b.terrainId), startTime: b.start.toISOString(), endTime: b.end.toISOString(), totalSpots: 4, filledSpots: b.players.length, openSpots: 4 - b.players.length, publicDescription: b.desc, players: b.players.map((p) => ({ name: p.name, paymentStatus: p.paymentStatus })) }))];
  }],
  ["GET", /^\/api\/reservations\/upcoming$/, () => [200, mineList().filter((b) => b.status === "confirmed" && b.end.getTime() > Date.now()).sort((a, b) => +a.start - +b.start).map(asReservation)]],
  ["GET", /^\/api\/reservations$/, () => { const l = mineList().map(asReservation); return [200, { data: l, total: l.length, page: 1, limit: 30 }]; }],
  ["POST", /^\/api\/reservations$/, (_m, _u, b) => {
    const start = new Date(b.startTime); const cost = b.bookingMode === "own_spot" ? 1 : 4;
    if (balance < cost) return [400, { error: "Solde de tokens insuffisant" }];
    const booking: Booking = { id: nextId++, terrainId: b.terrainId, start, end: new Date(start.getTime() + 90 * 60e3), mode: b.bookingMode ?? "full_court", isPublic: !!b.isPublic, desc: b.publicDescription ?? null,
      players: [{ id: nextId++, userId: ME_ID, name: "Yasmine Ben Ali", paymentType: "token", paymentStatus: "paid" }], creator: "Yasmine Ben Ali", createdAt: new Date().toISOString(), status: "confirmed" };
    bookings.set(key(b.terrainId, start), booking); charge(cost, `Réservation · ${terrainOf(b.terrainId).name}`);
    return [201, asReservation(booking)];
  }],
  ["POST", /^\/api\/reservations\/(\d+)\/cancel$/, (m) => { const b = byId(+m[1]); if (!b) return [404, { error: "Introuvable" }]; b.status = "cancelled"; charge(b.mode === "full_court" ? 4 : 1, "Remboursement annulation", true); return [200, asReservation(b)]; }],
  ["POST", /^\/api\/reservations\/(\d+)\/join$/, (m) => { const b = byId(+m[1]); if (!b) return [404, { error: "Introuvable" }]; if (balance < 1) return [400, { error: "Solde insuffisant" }];
    b.players.push({ id: nextId++, userId: ME_ID, name: "Yasmine Ben Ali", paymentType: "token", paymentStatus: "paid" }); charge(1, `Open match · ${terrainOf(b.terrainId).name}`); return [200, { message: "ok" }]; }],
  ["POST", /^\/api\/reservations\/(\d+)\/leave$/, (m) => { const b = byId(+m[1]); if (!b) return [404, { error: "Introuvable" }]; b.players = b.players.filter((p) => p.userId !== ME_ID); charge(1, "Remboursement", true); return [200, { message: "ok" }]; }],
  ["POST", /^\/api\/reservations\/(\d+)\/invite$/, (m) => [200, { invite: { id: 1, inviteToken: "demo-invite", reservationId: +m[1] }, inviteUrl: `${location.origin}${location.pathname.replace(/\/$/, "")}/join/demo-invite` }]],
  ["POST", /^\/api\/reservations\/(\d+)\/open-match$/, (m) => { const b = byId(+m[1]); if (b) b.isPublic = true; return [200, { message: "ok" }]; }],
  ["DELETE", /^\/api\/reservations\/(\d+)\/open-match$/, (m) => { const b = byId(+m[1]); if (b) b.isPublic = false; return [200, { message: "ok" }]; }],
  ["PATCH", /^\/api\/reservations\/(\d+)\/players\/(\d+)$/, (m, _u, body) => { const b = byId(+m[1]); const p = b?.players.find((x) => x.id === +m[2]); if (p) p.paymentStatus = body.paymentStatus; return [200, p]; }],
  ["GET", /^\/api\/invites\/[^/]+$/, () => { for (let i = 0; i < 3; i++) seed(dayKey(new Date(Date.now() + i * 86400e3))); const b = Array.from(bookings.values()).find((x) => x.mode === "own_spot" && x.players.length < 4 && x.start.getTime() > Date.now());
    return b ? [200, { invite: { id: 1, status: "pending", expiresAt: addDaysIso(1), invitedBy: b.creator.split(" ")[0] }, reservation: { id: b.id, terrainName: terrainOf(b.terrainId).name, startTime: b.start.toISOString(), endTime: b.end.toISOString(), totalSpots: 4, filledSpots: b.players.length, openSpots: 4 - b.players.length } }] : [404, { error: "Invitation expirée" }]; }],
  ["POST", /^\/api\/invites\/[^/]+\/accept$/, () => { charge(1, "Invitation acceptée"); return [200, { message: "ok" }]; }],
  ["GET", /^\/api\/tournaments$/, () => [200, tournaments]],
  ["POST", /^\/api\/tournaments\/(\d+)\/register$/, (m) => { const t = tournaments.find((x) => x.id === +m[1]); if (t) t.registeredTeams = (t.registeredTeams ?? 0) + 1; return [201, { id: nextId++, tournamentId: +m[1], userId: ME_ID, teamName: null, createdAt: new Date().toISOString() }]; }],
  ["GET", /^\/api\/news$/, () => [200, { data: news, total: news.length, page: 1, limit: 30 }]],
  ["GET", /^\/api\/notifications$/, () => [200, notifications]],
  ["POST", /^\/api\/notifications\/read-all$/, () => { notifications.forEach((n) => (n.isRead = true)); return [200, { updated: notifications.length }]; }],
  ["GET", /^\/api\/dashboard\/stats$/, () => [200, { totalReservationsToday: 31, totalReservationsThisMonth: 612, activeUsers: 284, totalTokensIssued: 5120, occupancyRateToday: 78, upcomingReservations: 9, revenueEquivalentToday: 2750 }]],
  ["GET", /^\/api\/dashboard\/activity$/, () => [200, [
    { id: 1, type: "reservation_created", message: "Karim Belhadj a réservé Court 2 à 20:00", userName: "Karim", createdAt: new Date(Date.now() - 6 * 60e3).toISOString() },
    { id: 2, type: "token_credited", message: "Salma Bouazizi a reçu 8 tokens", userName: "Salma", createdAt: new Date(Date.now() - 45 * 60e3).toISOString() },
    { id: 3, type: "user_registered", message: "Nouveau membre : Hedi Zouari", userName: "Hedi", createdAt: new Date(Date.now() - 2 * 3600e3).toISOString() },
    { id: 4, type: "reservation_cancelled", message: "Omar Sassi a annulé Court 5 à 17:00", userName: "Omar", createdAt: new Date(Date.now() - 4 * 3600e3).toISOString() },
  ]]],
  ["GET", /^\/api\/dashboard\/occupancy$/, () => [200, Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 86400e3); const r = [58, 64, 71, 69, 83, 91, 78][i]; return { date: dayKey(d), totalSlots: 60, bookedSlots: Math.round(r * 0.6), occupancyRate: r }; })]],
  ["GET", /^\/api\/dashboard\/peak-hours$/, () => [200, []]],
];

function installFetch() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.origin);
    const i = url.pathname.indexOf("/api/");
    if (i === -1) return real(input, init);
    const path = url.pathname.slice(i);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let body: any = undefined;
    try { body = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
    for (const [m, re, h] of routes) {
      const match = path.match(re);
      if (match && m === method) {
        const [status, data] = h(match, url, body, method);
        return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      }
    }
    return new Response(JSON.stringify(method === "GET" ? [] : { message: "ok" }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

function installAuth(supabase: SupabaseClient) {
  const KEY = "padel-demo-session";
  const listeners = new Set<(e: string, s: any) => void>();
  const make = () => ({ access_token: "demo", refresh_token: "demo", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "demo-user", email: me.email, role: "authenticated", aud: "authenticated", app_metadata: {}, user_metadata: { first_name: me.firstName, last_name: me.lastName }, created_at: me.createdAt } });
  let session: any = localStorage.getItem(KEY) ? make() : null;
  const emit = (e: string) => listeners.forEach((l) => l(e, session));
  const signIn = async () => { session = make(); localStorage.setItem(KEY, "1"); setTimeout(() => emit("SIGNED_IN")); return { data: { session, user: session.user }, error: null }; };
  const auth = supabase.auth as any;
  auth.getSession = async () => ({ data: { session }, error: null });
  auth.getUser = async () => ({ data: { user: session?.user ?? null }, error: null });
  auth.onAuthStateChange = (cb: (e: string, s: any) => void) => { listeners.add(cb); setTimeout(() => cb("INITIAL_SESSION", session)); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; };
  auth.signInWithPassword = signIn;
  auth.signUp = signIn;
  auth.signInWithOAuth = async () => { await signIn(); return { data: {}, error: null }; };
  auth.resetPasswordForEmail = async () => ({ data: {}, error: null });
  auth.signOut = async () => { session = null; localStorage.removeItem(KEY); emit("SIGNED_OUT"); return { error: null }; };
}

export function installDemo(supabase: SupabaseClient) {
  if (!DEMO || typeof window === "undefined") return;
  installFetch();
  installAuth(supabase);
}
