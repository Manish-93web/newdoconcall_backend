const { Server } = require("socket.io");
const env = require("../config/env");
const { socketAuth } = require("./socketAuth");
const { registerSignalingHandlers } = require("./signaling.socket");
const { createLogger } = require("../utils/logger");

const log = createLogger("sockets");

function attachSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.socketCorsOrigins, methods: ["GET", "POST"], credentials: true },
  });

  io.use(socketAuth);

  io.on("connection", (socket) => {
    log.debug(`Socket connected: ${socket.id} (user ${socket.user.id})`);

    // Every authenticated socket auto-joins its personal room so the rest of the app
    // (notifications, incoming-call pings) can push to a user without knowing their socket id.
    socket.join(`user:${socket.user.id}`);

    registerSignalingHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      log.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

module.exports = { attachSockets };
