import { randomUUID } from "node:crypto";
import {
  beginRequest,
  finishRequest,
  normalizeRoute,
  recordHttpRequest,
} from "../observability/metrics.js";
import { logger } from "../observability/logger.js";

export function requestMetricsMiddleware(req, res, next) {
  const started = process.hrtime.bigint();
  const requestId = req.get("x-request-id")?.slice(0, 128) || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  // Avoid accepting arbitrary user-provided strings as metric labels.
  beginRequest();

  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    const route = req.path === "/metrics" ? "/metrics" : normalizeRoute(req);

    if (req.path !== "/metrics") {
      recordHttpRequest({
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationSeconds,
      });
    }

    finishRequest();
    logger.info("http_request_completed", {
      requestId,
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: Math.round(durationSeconds * 1000 * 100) / 100,
    });
  });

  next();
}
