import type { Request } from "express";
import { db, activityTable } from "@workspace/db";
import { optionalUser, type DbUser } from "./auth";
import { logger } from "./logger";
import { fullName } from "./members";

type ActivityType = (typeof activityTable.$inferInsert)["type"];

/**
 * Audit trail of staff actions (Admin → activity feed): who did what, and to whom.
 * `about` is the member concerned; without it the entry is filed under the admin.
 * Never fails the action it records: a refused entry is logged and the request goes on.
 */
export async function logActivity(
  req: Request,
  type: ActivityType,
  message: string,
  about?: DbUser | null,
) {
  const admin = optionalUser(req);
  const subject = about ?? admin;
  try {
    await db.insert(activityTable).values({
      type,
      message: admin ? `${message} (by ${admin.email})` : message,
      userId: subject?.id ?? null,
      userName: subject ? fullName(subject) : null,
    });
  } catch (err) {
    logger.error({ err, type }, "activity log entry refused");
  }
}
