import { Server } from "socket.io";
import http from "http";
import express from "express";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, createCluster } from "redis";
import { setActiveSocketConnections } from "../observability/metrics.js";
import { logger, serializeError } from "../observability/logger.js";
import { getCorsOrigins } from "./deployment-config.js";

const app = express();
const server = http.createServer(app);
const redisClients = [];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = getCorsOrigins();
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  },
});

export async function configureRedisAdapter() {
  const clusterNodes = process.env.REDIS_CLUSTER_NODES
    ?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const redisUrl = process.env.REDIS_URL;

  if (!clusterNodes?.length && !redisUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Set REDIS_URL or REDIS_CLUSTER_NODES in production");
    }
    return;
  }

  const pubClient = clusterNodes?.length
    ? createCluster({ rootNodes: clusterNodes.map((url) => ({ url })) })
    : createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  const clients = [pubClient, subClient];
  for (const client of clients) {
    client.on("error", (error) =>
      logger.error("redis_client_error", { error: serializeError(error) })
    );
  }

  try {
    await Promise.all(clients.map((client) => client.connect()));
    io.adapter(createAdapter(pubClient, subClient));
    redisClients.push(...clients);
  } catch (error) {
    await Promise.allSettled(
      clients.map((client) => (client.isOpen ? client.quit() : Promise.resolve()))
    );
    throw error;
  }
}

export async function closeRedisClients() {
  await Promise.all(
    redisClients.map((client) => (client.isOpen ? client.quit() : Promise.resolve()))
  );
}

async function broadcastOnlineUsers() {
  const sockets = await io.fetchSockets();
  const userIds = [...new Set(sockets.map((socket) => socket.data.userId).filter(Boolean))];
  io.emit("getOnlineUsers", userIds);
}

io.on("connection", async (socket) => {
  logger.info("socket_connected", { socketId: socket.id });

  const userId = socket.handshake.query.userId;
  if (typeof userId === "string" && userId.length > 0) {
    socket.data.userId = userId;
    await socket.join(userId);
  }
  setActiveSocketConnections(io.engine.clientsCount);
  void broadcastOnlineUsers().catch((error) =>
    logger.error("socket_online_users_broadcast_failed", { error: serializeError(error) })
  );

  socket.on("disconnect", () => {
    logger.info("socket_disconnected", { socketId: socket.id });
    setActiveSocketConnections(io.engine.clientsCount);
    void broadcastOnlineUsers().catch((error) =>
      logger.error("socket_online_users_broadcast_failed", { error: serializeError(error) })
    );
  });
});

export { io, app, server };
