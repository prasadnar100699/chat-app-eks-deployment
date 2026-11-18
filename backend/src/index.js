import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import { timingSafeEqual } from "node:crypto";

import { connectDB } from "./lib/db.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { app, closeRedisClients, configureRedisAdapter, io, server } from "./lib/socket.js";
import mongoose from "mongoose";
import { requestMetricsMiddleware } from "./middleware/request-metrics.middleware.js";
import { renderPrometheusMetrics } from "./observability/metrics.js";
import { logger, serializeError } from "./observability/logger.js";
import { getCorsOrigins } from "./lib/deployment-config.js";

dotenv.config();

const PORT = process.env.PORT || 5001;

app.use(express.json({ limit: "10mb" }));
app.use(requestMetricsMiddleware);
app.use(cookieParser());
app.use(
  cors({
    origin: getCorsOrigins(),
    credentials: true,
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "chatapp-backend" });
});

app.get("/ready", (_req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? "ready" : "not_ready",
    checks: { mongodb: databaseReady ? "connected" : "disconnected" },
  });
});

app.get("/metrics", (req, res) => {
  const configuredToken = process.env.METRICS_TOKEN;

  // In production, fail closed unless a token is configured. Keep the
  // endpoint internal via Kubernetes Service/NetworkPolicy as well.
  if (process.env.NODE_ENV === "production" && !configuredToken) {
    return res.status(404).end();
  }

  if (configuredToken) {
    const suppliedToken = req.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const expected = Buffer.from(configuredToken);
    const supplied = Buffer.from(suppliedToken);
    const tokenMatches =
      expected.length === supplied.length && timingSafeEqual(expected, supplied);
    if (!tokenMatches) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
  return res.status(200).send(renderPrometheusMetrics());
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server_shutdown_started", { signal });

  let shutdownFailed = false;
  try {
    await new Promise((resolve, reject) => {
      io.close((error) => (error ? reject(error) : resolve()));
    });
  } catch (error) {
    shutdownFailed = true;
    logger.error("socket_server_shutdown_failed", { error: serializeError(error) });
  }

  const results = await Promise.allSettled([mongoose.disconnect(), closeRedisClients()]);
  for (const result of results) {
    if (result.status === "rejected") {
      shutdownFailed = true;
      logger.error("application_resource_shutdown_failed", {
        error: serializeError(result.reason),
      });
    }
  }

  process.exitCode = shutdownFailed ? 1 : 0;
  logger.info("server_shutdown_complete", { signal, failed: shutdownFailed });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function startServer() {
  try {
    await configureRedisAdapter();
    server.listen(PORT, () => {
      logger.info("server_started", { port: Number(PORT) || PORT });
      connectDB();
    });
  } catch (error) {
    logger.error("server_start_failed", { error: serializeError(error) });
    process.exitCode = 1;
  }
}

void startServer();
