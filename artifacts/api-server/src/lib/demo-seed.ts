import {
  activityTable,
  clubSettingsTable,
  db,
  equipmentItemsTable,
  newsTable,
  openingHoursTable,
  pricingRulesTable,
  reservationPlayersTable,
  reservationsTable,
  shopOrderItemsTable,
  shopOrdersTable,
  shopProductsTable,
  terrainsTable,
  tokenPackagesTable,
  tournamentRegistrationsTable,
  tournamentsTable,
  usersTable,
  type Tx,
} from "@workspace/db";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { env } from "../config/env";
import { supabaseAdmin } from "../config/supabase";
import {
  addDays,
  clubInstant,
  clubParts,
  formatClubDate,
  formatClubStamp,
  formatClubTime,
} from "./club-time";
import { DEMO_ACCOUNTS, DEMO_DOMAIN } from "./demo";
import { moveTokens } from "./ledger";
import { logger } from "./logger";
import { earnLoyalty, loyaltyFor } from "./loyalty";
import { fullName } from "./members";
import { notify } from "./notify";
import { priceFor, tokensFor } from "./pricing";
import { invalidateSettings, type ClubSettings } from "./settings";

/**
 * The demo club (DEMO_MODE): everything a visitor sees in the public demo, invented
 * and re-created from scratch every night so each prospect finds it clean.
 *
 * Dates are relative to the day of the reset: there are always matches tonight and
 * tomorrow, open matches to join, tournaments coming up. Every person has an
 * @example.com address (reserved for examples: nothing is ever delivered to it).
 */

/** Written in the audit trail by each reset: when it is missing, the base was never a demo. */
export const RESET_MARKER = "Demo data reset";

type User = typeof usersTable.$inferSelect;
type Court = typeof terrainsTable.$inferSelect;

const MEMBERS = [
  { key: "yasmine", firstName: "Yasmine", lastName: "Trabelsi", gender: "female" },
  { key: "karim", firstName: "Karim", lastName: "Haddad", gender: "male" },
  { key: "mehdi", firstName: "Mehdi", lastName: "Jaziri", gender: "male" },
  { key: "salma", firstName: "Salma", lastName: "Ben Amor", gender: "female" },
  { key: "omar", firstName: "Omar", lastName: "Gharbi", gender: "male" },
  { key: "ines", firstName: "Ines", lastName: "Chaabane", gender: "female" },
  { key: "walid", firstName: "Walid", lastName: "Mansouri", gender: "male" },
  { key: "nour", firstName: "Nour", lastName: "Ayari", gender: "female" },
] as const;
type MemberKey = (typeof MEMBERS)[number]["key"];

const COURTS = [
  {
    name: "Court Central",
    type: "indoor" as const,
    number: 1,
    description:
      "Notre terrain vitrine : parois panoramiques, gazon dernière génération et éclairage LED.",
    photos: ["/club-main-1920.webp"],
  },
  {
    name: "Court 2",
    type: "indoor" as const,
    number: 2,
    description: "Terrain couvert, jouable par tous les temps, idéal pour les matchs du soir.",
    photos: ["/club-indoor-1920.webp"],
  },
  {
    name: "Court 3",
    type: "outdoor" as const,
    number: 3,
    description: "Terrain extérieur éclairé, à l'air libre pour les beaux jours.",
    photos: ["/club-outdoor-1920.webp"],
  },
  {
    name: "Court 4",
    type: "outdoor" as const,
    number: 4,
    description: "Terrain extérieur éclairé, à côté de l'espace détente.",
    photos: ["/club-detail-1920.webp"],
  },
];

const ARTICLES = [
  {
    name: "Raquette Carbone Pro",
    category: "racket",
    price: 349,
    stock: 4,
    imageUrl: "/shop/raquette-carbone.webp",
    description:
      "Cadre 100 % carbone, forme diamant et équilibre en tête : de la puissance pour les joueurs confirmés. Livrée avec sa dragonne.",
  },
  {
    name: "Raquette Contrôle",
    category: "racket",
    price: 279,
    stock: 6,
    imageUrl: "/shop/raquette-controle.webp",
    description:
      "Forme ronde et large zone de frappe : de la précision et du confort, idéale pour progresser sans se faire mal au bras.",
  },
  {
    name: "Raquette Initiation",
    category: "racket",
    price: 149,
    stock: 8,
    imageUrl: "/shop/chaussures-kit.webp",
    description:
      "Légère et tolérante, pour démarrer le padel dans de bonnes conditions. Le premier achat que nous conseillons aux débutants.",
  },
  {
    name: "Pack Duo : 2 raquettes",
    category: "racket",
    price: 520,
    stock: 3,
    imageUrl: "/shop/raquettes-couleur.webp",
    description:
      "Deux raquettes polyvalentes à prix réduit, pour jouer en couple ou entre amis. Surgrips offerts.",
  },
  {
    name: "Tube de 3 balles",
    category: "balls",
    price: 18,
    stock: 40,
    imageUrl: "/shop/balles-tube.webp",
    description:
      "Balles pressurisées homologuées, rebond régulier sur gazon synthétique. Le tube est scellé pour garder la pression.",
  },
  {
    name: "Seau de 24 balles d'entraînement",
    category: "balls",
    price: 120,
    stock: 5,
    imageUrl: "/shop/balles-seau.webp",
    description:
      "Pour les séances de paniers et les cours : 24 balles d'entraînement dans leur seau de transport.",
  },
];

const NEWS = [
  {
    daysAgo: 20,
    title: "Cours d'initiation tous les samedis matin",
    category: "Cours",
    imageUrl: "/club-detail-1920.webp",
    excerpt:
      "Vous débutez ? Nos coachs vous accueillent chaque samedi à 10 h pour 90 minutes d'initiation, raquettes fournies.",
    content:
      "Le padel s'apprend vite, surtout bien accompagné. Chaque samedi à 10 h, nos coachs animent une séance d'initiation de 90 minutes : prise de raquette, service, jeu avec les vitres et premiers échanges.\n\nLes raquettes et les balles sont fournies. Venez seul, en couple ou entre amis : nous formons les groupes sur place, par niveau.\n\nLes places sont limitées à 8 joueurs par séance. Réservez à l'accueil ou par téléphone.",
  },
  {
    daysAgo: 11,
    title: "Deux terrains outdoor désormais éclairés",
    category: "Terrains",
    imageUrl: "/club-outdoor-1920.webp",
    excerpt:
      "Les courts 3 et 4 passent à l'éclairage LED : jouez dehors jusqu'à la fermeture, sans éblouissement.",
    content:
      "Bonne nouvelle pour les amateurs de matchs en plein air : les courts 3 et 4 sont maintenant équipés de projecteurs LED.\n\nLa lumière est uniforme sur toute la surface et orientée pour ne pas éblouir au moment du smash. Vous pouvez réserver ces terrains jusqu'au dernier créneau de la soirée.\n\nLes créneaux du soir partent vite : pensez à réserver quelques jours à l'avance.",
  },
  {
    daysAgo: 5,
    title: "Open du Club : les inscriptions sont ouvertes",
    category: "Tournois",
    imageUrl: "/club-main-1920.webp",
    excerpt:
      "16 équipes, deux jours de matchs et 800 TND pour les vainqueurs. Inscrivez votre binôme depuis la page Tournois.",
    content:
      "L'Open du Club revient. Au programme : phases de poules le samedi, tableau final et consolante le dimanche, pour que chaque équipe joue au moins trois matchs.\n\nLe tournoi est limité à 16 équipes. L'inscription se fait depuis la page Tournois du site, en quelques secondes.\n\nÀ gagner : 800 TND pour les vainqueurs, 400 TND pour les finalistes et des lots offerts par nos partenaires.",
  },
  {
    daysAgo: 1,
    title: "Réservez votre terrain en ligne, à toute heure",
    category: "Club",
    imageUrl: "/hero-court.webp",
    excerpt:
      "Plus besoin d'appeler : choisissez votre créneau, réservez votre place ou le terrain complet et invitez vos amis par un simple lien.",
    content:
      "Le club passe à la réservation en ligne. Depuis le site, vous voyez tous les terrains et tous les créneaux de la semaine, en direct.\n\nComment ça marche ? Rechargez vos tokens à l'accueil, choisissez un créneau libre, puis réservez seulement votre place ou le terrain complet. Un lien suffit pour inviter vos partenaires.\n\nVous préférez le téléphone ? Rien ne change : appelez le club, nous réservons pour vous et vous réglez sur place.",
  },
];

/** Phone numbers that cannot exist: Tunisian numbers never start with 0. */
const fakePhone = (n: number) => `+216 00 100 ${String(200 + n).padStart(3, "0")}`;

// ─── Safety ──────────────────────────────────────────────────────────────────

/**
 * Why this database must not be wiped, or null when it may. A real club's base has
 * members who booked, paid or ordered, or courts without the demo's mark: the reset
 * refuses it whatever DEMO_MODE says. Only `force` (the first reset of a base that
 * held hand-made demo content) goes past it.
 */
export async function refusalReason(q: Pick<Tx, "execute"> = db): Promise<string | null> {
  const { rows } = await q.execute<{ marker: boolean; members: boolean; courts: boolean }>(sql`
    select
      exists (select 1 from activity where message = ${RESET_MARKER} and user_id is null) as marker,
      exists (
        select 1 from users u
        where u.email not ilike ${`%@${DEMO_DOMAIN}`}
          and (exists (select 1 from reservations r where r.user_id = u.id)
            or exists (select 1 from reservation_players p where p.user_id = u.id)
            or exists (select 1 from token_transactions t where t.user_id = u.id)
            or exists (select 1 from shop_orders o where o.user_id = u.id)
            or exists (select 1 from tournament_registrations g where g.user_id = u.id))
      ) as members,
      exists (select 1 from terrains) as courts`);
  const [r] = rows;
  if (r.members) return "real members have bookings, tokens or orders in this database";
  if (!r.marker && r.courts) return "this database has courts but was never a demo";
  return null;
}

// ─── When ────────────────────────────────────────────────────────────────────

/** The last reset hour (club time) at or before `now`: a reset older than that is due. */
export function lastResetSlot(now = new Date()) {
  const today = clubParts(now).date;
  const at = clubInstant(today, env.demoResetHour * 60);
  return at <= now ? at : clubInstant(addDays(today, -1), env.demoResetHour * 60);
}

export async function lastReset(): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${activityTable.createdAt})` })
    .from(activityTable)
    .where(and(eq(activityTable.message, RESET_MARKER), isNull(activityTable.userId)));
  return row?.at ? new Date(row.at) : null;
}

/** What a reset created (for the logs and the cron's answer). */
type DemoCounts = Awaited<ReturnType<typeof seed>>["counts"];
let running: Promise<DemoCounts> | null = null;

/** Resets when the nightly reset is due (at start-up and from the job scheduler). */
export async function resetDemoIfDue(now = new Date()) {
  if (!env.demoMode) return false;
  const last = await lastReset();
  if (last && last >= lastResetSlot(now)) return false;
  await resetDemo();
  return true;
}

// ─── Supabase Auth ───────────────────────────────────────────────────────────

/**
 * The two shared accounts exist in Supabase Auth, confirmed, unbanned, with the demo
 * password (a visitor may have changed it). Returns their auth ids by e-mail. Best
 * effort: a failure is logged and the data reset still happens.
 */
async function prepareAuthAccounts() {
  const ids = new Map<string, string>();
  if (!env.demoPassword) {
    logger.warn("DEMO_PASSWORD is not set: the demo accounts can't be prepared");
    return ids;
  }
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    for (const a of Object.values(DEMO_ACCOUNTS)) {
      const attrs = {
        password: env.demoPassword,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: {
          first_name: a.firstName,
          last_name: a.lastName,
          phone: a.phone,
          gender: a.gender,
        },
      };
      const found = data.users.find((u) => u.email?.toLowerCase() === a.email);
      const r = found
        ? await supabaseAdmin.auth.admin.updateUserById(found.id, { ...attrs, email: a.email })
        : await supabaseAdmin.auth.admin.createUser({ email: a.email, ...attrs });
      if (r.error) throw r.error;
      ids.set(a.email, r.data.user.id);
    }
  } catch (err) {
    logger.error({ err }, "demo accounts could not be prepared in Supabase Auth");
  }
  return ids;
}

// ─── Reset ───────────────────────────────────────────────────────────────────

/**
 * Wipes the club's data and creates the demo club again. One at a time (advisory
 * lock), and never on a base that holds a real club (refusalReason) unless forced.
 */
export async function resetDemo(opts: { force?: boolean } = {}) {
  if (!env.demoMode) throw new Error("resetDemo: DEMO_MODE is off");
  if (running) return running;
  running = (async () => {
    const refusal = await refusalReason();
    if (refusal && !opts.force) throw new Error(`demo reset refused: ${refusal}`);
    const authIds = await prepareAuthAccounts();
    const summary = await db.transaction(async (tx: Tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('padel-demo-reset'))`);
      const again = await refusalReason(tx);
      if (again && !opts.force) throw new Error(`demo reset refused: ${again}`);
      return seed(tx, authIds);
    });
    invalidateSettings();
    await afterSeed(summary);
    logger.info(summary.counts, "demo data reset");
    return summary.counts;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Every table of the club except the members, emptied in one statement. */
async function wipe(tx: Tx) {
  const { rows } = await tx.execute<{ name: string }>(sql`
    select tablename as name from pg_tables
    where schemaname = 'public' and tablename <> 'users'`);
  if (rows.length)
    await tx.execute(
      sql.raw(
        `truncate table ${rows.map((r) => `public."${r.name.replace(/"/g, '""')}"`).join(", ")} restart identity cascade`,
      ),
    );
  // The shared accounts stay (their Supabase identity), everybody else goes: the
  // invented members are created again below, real sign-ups are never kept
  await tx.delete(usersTable).where(
    notInArray(
      usersTable.email,
      Object.values(DEMO_ACCOUNTS).map((a) => a.email),
    ),
  );
}

async function seed(tx: Tx, authIds: Map<string, string>) {
  await wipe(tx);
  const today = clubParts(new Date()).date;
  const at = (days: number, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return clubInstant(addDays(today, days), h * 60 + m);
  };

  // ── Rules of the club ─────────────────────────────────────────────────────
  const [settings] = (await tx
    .insert(clubSettingsTable)
    .values({ id: 1, loyaltyEnabled: true, loyaltySpendTokens: 1, loyaltyRewardTokens: 0.1 })
    .returning()) as ClubSettings[];
  await tx.insert(openingHoursTable).values(
    Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      openTime: "08:00",
      closeTime: "23:00",
    })),
  );
  const packs = await tx
    .insert(tokenPackagesTable)
    .values([
      { name: "Pack 10", tokens: 10, price: 200, sortOrder: 1 },
      { name: "Pack 20", tokens: 20, price: 380, sortOrder: 2 },
      { name: "Pack 50", tokens: 50, price: 900, sortOrder: 3 },
    ])
    .returning();
  const courts = await tx
    .insert(terrainsTable)
    .values(COURTS.map((c, i) => ({ ...c, sortOrder: i + 1 })))
    .returning();
  const rules = await tx
    .insert(pricingRulesTable)
    .values({
      name: "Heures pleines",
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "18:30",
      endTime: "24:00",
      tokensPerSpot: 2,
      pricePerPerson: 30,
      isPeak: true,
      priority: 1,
    })
    .returning();
  await tx.insert(equipmentItemsTable).values([
    {
      name: "Raquette de location",
      category: "racket",
      price: 5,
      stock: 10,
      description: "Raquette polyvalente, rendue à l'accueil après le match.",
    },
    {
      name: "Tube de balles neuves",
      category: "balls",
      price: 15,
      stock: 20,
      description: "Trois balles neuves pour votre match.",
    },
  ]);

  // ── People ────────────────────────────────────────────────────────────────
  const accounts = {} as Record<keyof typeof DEMO_ACCOUNTS, User>;
  for (const [key, a] of Object.entries(DEMO_ACCOUNTS) as [
    keyof typeof DEMO_ACCOUNTS,
    (typeof DEMO_ACCOUNTS)[keyof typeof DEMO_ACCOUNTS],
  ][]) {
    const profile = {
      firstName: a.firstName,
      lastName: a.lastName,
      phone: a.phone,
      gender: a.gender,
      role: a.role,
      avatarUrl: null,
      tokenBalance: 0,
      loyaltyBalance: 0,
      language: "fr" as const,
      emailNotifications: true,
      pushNotifications: false,
      updatedAt: new Date(),
    };
    const [existing] = await tx.select().from(usersTable).where(eq(usersTable.email, a.email));
    const authId = authIds.get(a.email);
    [accounts[key]] = existing
      ? await tx
          .update(usersTable)
          .set({ ...profile, ...(authId ? { supabaseAuthId: authId } : {}) })
          .where(eq(usersTable.id, existing.id))
          .returning()
      : await tx
          .insert(usersTable)
          .values({ ...profile, email: a.email, supabaseAuthId: authId ?? `demo-account-${key}` })
          .returning();
  }
  const { player: sami, admin: desk } = accounts;
  const people = {} as Record<MemberKey, User>;
  for (const [i, m] of MEMBERS.entries()) {
    [people[m.key]] = await tx
      .insert(usersTable)
      .values({
        supabaseAuthId: `demo-member-${m.key}`,
        email: `${m.key}@${DEMO_DOMAIN}`,
        firstName: m.firstName,
        lastName: m.lastName,
        gender: m.gender,
        phone: fakePhone(i + 1),
        pushNotifications: false,
      })
      .returning();
  }

  // ── Tokens sold at the desk ───────────────────────────────────────────────
  const sell = async (who: User, pack: (typeof packs)[number]) => {
    const description = `${pack.name} (${pack.tokens} tokens)`;
    await moveTokens(tx, {
      userId: who.id,
      delta: pack.tokens,
      type: "credit",
      adminId: desk.id,
      description,
      cashAmount: pack.price,
      packageId: pack.id,
    });
    await tx.insert(activityTable).values({
      type: "token_credited",
      message: `${pack.tokens} token(s) added to ${who.email}: ${description} (by ${desk.email})`,
      userId: who.id,
      userName: fullName(who),
    });
  };
  const [pack10, pack20] = packs;
  await sell(sami, pack20);
  for (const key of ["yasmine", "karim", "salma", "walid", "nour"] as const)
    await sell(people[key], pack20);
  for (const key of ["mehdi", "omar", "ines"] as const) await sell(people[key], pack10);

  // ── Bookings: last week, tonight, tomorrow, open matches to join ─────────
  const court = (n: number) => courts.find((c) => c.number === n) as Court;
  const minutes = settings.bookingDurationMinutes;
  /** Sami's booking of tomorrow, for the notification sent after the reset. */
  const tomorrow: { value: { court: Court; start: Date; tokens: number; isPeak: boolean } | null } =
    { value: null };
  const book = async (o: {
    by: User | null;
    court: Court;
    day: number;
    time: string;
    mode?: "full_court" | "own_spot";
    publicNote?: string;
    friends?: User[];
    joiners?: User[];
    guest?: { name: string; phone: string };
  }) => {
    const start = at(o.day, o.time);
    const mode = o.mode ?? "full_court";
    const price = priceFor(rules, settings, o.court, start);
    const tokens = o.by ? tokensFor(price, mode) : 0;
    const stamp = `${o.court.name} · ${formatClubStamp(start)}`;
    const [r] = await tx
      .insert(reservationsTable)
      .values({
        terrainId: o.court.id,
        userId: o.by?.id ?? null,
        guestName: o.guest?.name ?? null,
        guestPhone: o.guest?.phone ?? null,
        startTime: start,
        endTime: new Date(start.getTime() + minutes * 60_000),
        tokensCharged: tokens,
        bookingType: o.guest ? "phone" : "online",
        bookingMode: mode,
        totalSpots: settings.maxPlayers,
        isPublic: !!o.publicNote,
        publicDescription: o.publicNote ?? null,
      })
      .returning();
    const pay = async (who: User, spent: number, description: string) => {
      await moveTokens(tx, {
        userId: who.id,
        delta: -spent,
        type: "debit",
        reservationId: r.id,
        description,
      });
      const earned = loyaltyFor(settings, spent);
      await tx.insert(reservationPlayersTable).values({
        reservationId: r.id,
        userId: who.id,
        paymentType: "token",
        paymentStatus: "paid",
        tokensCharged: spent,
        loyaltyEarned: earned,
      });
      await earnLoyalty(tx, { userId: who.id, earned, reservationId: r.id });
    };
    if (o.by)
      await pay(o.by, tokens, `${mode === "own_spot" ? "Own spot" : "Full court"} · ${stamp}`);
    for (const f of o.friends ?? [])
      await tx.insert(reservationPlayersTable).values({
        reservationId: r.id,
        userId: f.id,
        paymentType: "invited_free",
        paymentStatus: "paid",
        tokensCharged: 0,
      });
    for (const j of o.joiners ?? []) await pay(j, price.tokensPerSpot, `Joined match · ${stamp}`);
    await tx.insert(activityTable).values({
      type: "reservation_created",
      message: `${stamp} (${mode === "own_spot" ? "own spot" : "full court"}${o.guest ? `, by ${fullName(desk)}` : ""})`,
      userId: o.by?.id ?? null,
      userName: o.by ? fullName(o.by) : (o.guest?.name ?? "Guest"),
    });
    if (o.by?.id === sami.id && o.day === 1)
      tomorrow.value = { court: o.court, start, tokens, isPeak: price.isPeak };
    return r;
  };

  // Sami (the demo player): a match last week, one tomorrow evening with two friends
  await book({
    by: sami,
    court: court(1),
    day: -6,
    time: "11:00",
    friends: [people.karim, people.mehdi],
  });
  await book({
    by: sami,
    court: court(1),
    day: 1,
    time: "18:30",
    friends: [people.karim, people.walid],
  });
  // The planning of today and tomorrow
  await book({ by: people.salma, court: court(1), day: 0, time: "09:30", friends: [people.nour] });
  await book({
    by: people.karim,
    court: court(2),
    day: 0,
    time: "17:00",
    friends: [people.mehdi, people.omar],
  });
  await book({ by: people.walid, court: court(4), day: 0, time: "18:30" });
  await book({
    by: null,
    court: court(1),
    day: 0,
    time: "20:00",
    guest: { name: "Hichem B. (téléphone)", phone: fakePhone(9) },
  });
  await book({ by: people.nour, court: court(3), day: 1, time: "11:00" });
  // Open matches: spots to take
  await book({
    by: people.yasmine,
    court: court(3),
    day: 1,
    time: "20:00",
    mode: "own_spot",
    publicNote: "Niveau intermédiaire, bonne ambiance. Il manque deux joueurs !",
    joiners: [people.ines],
  });
  await book({
    by: people.omar,
    court: court(2),
    day: 2,
    time: "17:00",
    mode: "own_spot",
    publicNote: "Débutants bienvenus, on joue pour s'amuser.",
  });
  await book({
    by: people.salma,
    court: court(4),
    day: 3,
    time: "09:30",
    mode: "own_spot",
    publicNote: "Match du matin avant le travail, niveau confirmé.",
    joiners: [people.nour, people.walid],
  });

  // ── Tournaments ───────────────────────────────────────────────────────────
  const [open, night] = await tx
    .insert(tournamentsTable)
    .values([
      {
        name: "Open du Club",
        status: "open",
        startDate: at(9, "09:00"),
        endDate: at(10, "19:00"),
        maxTeams: 16,
        imageUrl: "/club-outdoor-1920.webp",
        prizeInfo: "1er : 800 TND · 2e : 400 TND · lots partenaires",
        description:
          "Le grand rendez-vous de la saison : deux jours de matchs en double, phases de poules le samedi et tableau final le dimanche. Ouvert à tous les niveaux, avec un tableau consolante pour que chaque équipe joue au moins trois matchs.",
      },
      {
        name: "Night Padel Cup",
        status: "open",
        startDate: at(16, "19:00"),
        endDate: at(16, "23:30"),
        maxTeams: 12,
        imageUrl: "/hero-court.webp",
        prizeInfo: "Trophée + 2 raquettes pour l'équipe gagnante",
        description:
          "Une soirée, quatre terrains, des matchs courts au tie-break. Musique, boissons fraîches et finale sous les projecteurs à 23 h.",
      },
      {
        name: "Tournoi Mixte",
        status: "upcoming",
        startDate: at(30, "09:00"),
        endDate: at(31, "18:00"),
        maxTeams: 16,
        imageUrl: "/club-indoor-1920.webp",
        prizeInfo: "Bons d'achat et packs de tokens",
        description:
          "Équipes mixtes uniquement. Les inscriptions ouvrent bientôt : formez votre binôme dès maintenant.",
      },
      {
        name: "Tournoi des Amis",
        status: "completed",
        startDate: at(-12, "09:00"),
        endDate: at(-11, "18:00"),
        maxTeams: 16,
        imageUrl: "/club-main-1920.webp",
        prizeInfo: "Vainqueurs : Karim & Mehdi",
        description:
          "Seize équipes, deux jours de jeu et une finale en trois sets. Merci à tous les participants, rendez-vous à l'Open du Club.",
      },
    ])
    .returning();
  const teams: [typeof open, User, string][] = [
    [open, people.karim, "Karim & Mehdi"],
    [open, people.yasmine, "Yasmine & Ines"],
    [open, people.salma, "Salma & Nour"],
    [open, people.walid, "Walid & Omar"],
    [night, people.mehdi, "Les Smasheurs"],
    [night, people.nour, "Team Bandeja"],
  ];
  for (const [t, who, teamName] of teams)
    await tx
      .insert(tournamentRegistrationsTable)
      .values({ tournamentId: t.id, userId: who.id, teamName });
  for (const t of [open, night])
    await tx
      .update(tournamentsTable)
      .set({ registeredTeams: teams.filter(([x]) => x.id === t.id).length })
      .where(eq(tournamentsTable.id, t.id));

  // ── News ──────────────────────────────────────────────────────────────────
  for (const n of NEWS) {
    const { daysAgo, ...article } = n;
    const when = at(-daysAgo, "10:00");
    await tx
      .insert(newsTable)
      .values({ ...article, isPublished: true, publishedAt: when, createdAt: when });
  }

  // ── Shop: the catalogue, one order to call, one confirmed ─────────────────
  const products = await tx
    .insert(shopProductsTable)
    .values(ARTICLES.map((a, i) => ({ ...a, sortOrder: i + 1 })))
    .returning();
  const product = (name: string) => products.find((p) => p.name === name)!;
  const order = async (
    who: User,
    status: "pending" | "confirmed",
    method: "pickup" | "delivery",
    lines: [string, number][],
  ) => {
    const items = lines.map(([name, quantity]) => ({ p: product(name), quantity }));
    const total = Math.round(items.reduce((s, l) => s + l.p.price * l.quantity, 0) * 100) / 100;
    const [o] = await tx
      .insert(shopOrdersTable)
      .values({
        userId: who.id,
        status,
        total,
        currency: settings.currency,
        deliveryMethod: method,
        contactName: fullName(who),
        contactPhone: who.phone ?? fakePhone(0),
        address: method === "delivery" ? "12 rue des Jasmins" : null,
        city: method === "delivery" ? "Tunis" : null,
        handledBy: status === "confirmed" ? desk.id : null,
      })
      .returning();
    await tx.insert(shopOrderItemsTable).values(
      items.map((l) => ({
        orderId: o.id,
        productId: l.p.id,
        productName: l.p.name,
        unitPrice: l.p.price,
        quantity: l.quantity,
      })),
    );
    for (const l of items)
      await tx
        .update(shopProductsTable)
        .set({ stock: sql`${shopProductsTable.stock} - ${l.quantity}` })
        .where(eq(shopProductsTable.id, l.p.id));
  };
  await order(people.yasmine, "pending", "pickup", [
    ["Raquette Contrôle", 1],
    ["Tube de 3 balles", 2],
  ]);
  await order(people.karim, "confirmed", "delivery", [["Raquette Carbone Pro", 1]]);

  await tx.insert(activityTable).values({ type: "settings_updated", message: RESET_MARKER });

  const [{ n: reservations }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(reservationsTable);
  return {
    samiId: sami.id,
    samiTomorrow: tomorrow.value,
    counts: {
      courts: courts.length,
      members: MEMBERS.length + Object.keys(DEMO_ACCOUNTS).length,
      reservations,
      tournaments: 4,
      news: NEWS.length,
      articles: products.length,
    },
  };
}

/** The demo player's bell has something in it: sent after the data is committed. */
async function afterSeed(s: Awaited<ReturnType<typeof seed>>) {
  const [sami] = await db.select().from(usersTable).where(eq(usersTable.id, s.samiId));
  if (!sami) return;
  await notify(sami, { kind: "welcome", firstName: sami.firstName }, "welcome");
  const next = s.samiTomorrow;
  if (next)
    await notify(
      sami,
      {
        kind: "booking_confirmed",
        terrain: next.court.name,
        date: formatClubDate(next.start, "fr"),
        time: formatClubTime(next.start),
        tokens: next.tokens,
        mode: "full_court",
        isPeak: next.isPeak,
        equipment: [],
      },
      "demo-booking",
    );
}
