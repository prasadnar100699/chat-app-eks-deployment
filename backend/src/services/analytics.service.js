import Activity from "../models/activity.model.js";
import { logger } from "../observability/logger.js";

export async function recordUserActivity(userId, eventType = "authenticated_request") {
  if (!userId) return;

  const now = new Date();
  const activityDate = now.toISOString().slice(0, 10);

  try {
    await Activity.updateOne(
      { userId, activityDate },
      {
        $set: { lastSeenAt: now },
        $addToSet: { eventTypes: eventType },
        $setOnInsert: { userId, activityDate },
      },
      { upsert: true },
    );
  } catch (error) {
    // Analytics is best-effort: telemetry failure must not break chat requests.
    logger.warn("analytics_activity_write_failed", {
      errorName: error?.name || "Error",
    });
  }
}
