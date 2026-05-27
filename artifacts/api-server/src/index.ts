import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { env } from "./config/env";

const rawPort = env.port ?? "3001";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Startup migration: fix legacy full_court bookings ───────────────────────
// Before multi-player support, all bookings defaulted to bookingMode='full_court'.
// Legacy single-player bookings (tokensCharged < 4, manual/phone, no player rows)
// should be own_spot so they show open spots and can be joined.
async function runStartupMigrations() {
  try {
    await db.execute(sql`
      UPDATE reservations
      SET booking_mode = 'own_spot'
      WHERE booking_mode = 'full_court'
        AND tokens_charged < 4
        AND booking_type IN ('manual', 'phone', 'online')
        AND NOT EXISTS (
          SELECT 1 FROM reservation_players
          WHERE reservation_players.reservation_id = reservations.id
        )
    `);
    logger.info("Startup migration: legacy full_court → own_spot complete");
  } catch (err) {
    logger.warn({ err }, "Startup migration: legacy bookingMode fix skipped (non-fatal)");
  }
}

runStartupMigrations().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
});
