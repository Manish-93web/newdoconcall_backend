const { verifyAccessToken } = require("../services/auth/jwt.service");
const User = require("../models/User");

async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("UNAUTHENTICATED"));

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select("role status");
    if (!user || user.status === "suspended") return next(new Error("UNAUTHENTICATED"));

    socket.user = { id: user._id.toString(), role: user.role };
    return next();
  } catch (err) {
    return next(new Error("UNAUTHENTICATED"));
  }
}

module.exports = { socketAuth };
