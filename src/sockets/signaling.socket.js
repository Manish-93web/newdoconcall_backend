const ConsultationSession = require("../models/ConsultationSession");
const { CONSULTATION_STATES } = require("../config/constants");
const { scheduleMissedCallCheck, cancelMissedCallCheck } = require("../jobs/missedCallTimeout.job");
const { createLogger } = require("../utils/logger");

const log = createLogger("sockets:signaling");

function roomName(sessionRoomId) {
  return `consult:${sessionRoomId}`;
}

async function loadSessionForParticipant(sessionId, userId) {
  const session = await ConsultationSession.findById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const participant = session.participants.find((p) => p.user.toString() === userId);
  if (!participant) throw new Error("NOT_A_PARTICIPANT");

  return { session, participant };
}

function registerSignalingHandlers(io, socket) {
  socket.data.consultSessions = new Set();

  socket.on("consult:join", async ({ sessionId }, ack) => {
    try {
      const { session, participant } = await loadSessionForParticipant(sessionId, socket.user.id);
      if (session.state === CONSULTATION_STATES.ENDED) {
        return ack?.({ ok: false, error: "SESSION_ENDED" });
      }

      const room = roomName(session.sessionRoomId);
      const otherParticipant = session.participants.find((p) => p.user.toString() !== socket.user.id);

      const roomSockets = await io.in(room).fetchSockets();
      const isFirstToJoin = roomSockets.length === 0;

      participant.joinedAt = new Date();
      participant.socketId = socket.id;
      participant.leftAt = undefined;

      if (isFirstToJoin) {
        session.state = CONSULTATION_STATES.RINGING;
        scheduleMissedCallCheck(session._id, io);
      } else {
        session.state = CONSULTATION_STATES.CONNECTED;
        if (!session.startedAt) session.startedAt = new Date();
        cancelMissedCallCheck(session._id);
      }
      await session.save();

      await socket.join(room);
      socket.data.consultSessions.add(sessionId);

      if (isFirstToJoin) {
        if (otherParticipant?.user) {
          io.to(`user:${otherParticipant.user}`).emit("consult:incoming-call", {
            sessionId: session._id,
            fromUser: socket.user.id,
          });
        }
        ack?.({ ok: true, state: session.state, shouldCreateOffer: false });
      } else {
        socket.to(room).emit("consult:peer-joined", { peerSocketId: socket.id, userId: socket.user.id });
        io.to(room).emit("consult:state-changed", { sessionId: session._id, state: session.state });
        // The second-to-join peer initiates the SDP offer to the peer already waiting in the room.
        ack?.({ ok: true, state: session.state, shouldCreateOffer: true });
      }
    } catch (err) {
      log.error("consult:join failed", err.message);
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("consult:offer", async ({ sessionId, sdp }) => {
    const session = await ConsultationSession.findById(sessionId).select("sessionRoomId");
    if (!session) return;
    socket.to(roomName(session.sessionRoomId)).emit("consult:offer", { sdp, fromSocketId: socket.id });
  });

  socket.on("consult:answer", async ({ sessionId, sdp }) => {
    const session = await ConsultationSession.findById(sessionId).select("sessionRoomId");
    if (!session) return;
    socket.to(roomName(session.sessionRoomId)).emit("consult:answer", { sdp, fromSocketId: socket.id });
  });

  socket.on("consult:ice-candidate", async ({ sessionId, candidate }) => {
    const session = await ConsultationSession.findById(sessionId).select("sessionRoomId");
    if (!session) return;
    socket
      .to(roomName(session.sessionRoomId))
      .emit("consult:ice-candidate", { candidate, fromSocketId: socket.id });
  });

  socket.on("consult:media-state", async ({ sessionId, kind, enabled }) => {
    const session = await ConsultationSession.findById(sessionId).select("sessionRoomId");
    if (!session) return;
    socket
      .to(roomName(session.sessionRoomId))
      .emit("consult:media-state", { kind, enabled, fromSocketId: socket.id });
  });

  socket.on("consult:screen-share", async ({ sessionId, active }) => {
    const session = await ConsultationSession.findById(sessionId).select("sessionRoomId");
    if (!session) return;
    socket
      .to(roomName(session.sessionRoomId))
      .emit("consult:screen-share", { active, fromSocketId: socket.id });
  });

  socket.on("consult:chat-message", async ({ sessionId, message }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      const entry = { sender: socket.user.id, message, sentAt: new Date() };
      session.chatTranscript.push(entry);
      await session.save();
      io.to(roomName(session.sessionRoomId)).emit("consult:chat-message", entry);
    } catch (err) {
      log.error("consult:chat-message failed", err.message);
    }
  });

  socket.on("consult:file-shared", async ({ sessionId, fileId }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      session.sharedFiles.push({ uploadedBy: socket.user.id, fileRef: fileId });
      await session.save();
      io.to(roomName(session.sessionRoomId)).emit("consult:file-shared", {
        fileId,
        fromUserId: socket.user.id,
      });
    } catch (err) {
      log.error("consult:file-shared failed", err.message);
    }
  });

  socket.on("consult:hold", async ({ sessionId }) => setHoldState(sessionId, CONSULTATION_STATES.ON_HOLD));
  socket.on("consult:resume", async ({ sessionId }) => setHoldState(sessionId, CONSULTATION_STATES.CONNECTED));

  async function setHoldState(sessionId, state) {
    const session = await ConsultationSession.findById(sessionId);
    if (!session) return;
    session.state = state;
    await session.save();
    io.to(roomName(session.sessionRoomId)).emit("consult:state-changed", { sessionId, state });
  }

  socket.on("consult:end", async ({ sessionId, reason }) => {
    try {
      const session = await ConsultationSession.findById(sessionId);
      if (!session) return;

      session.state = CONSULTATION_STATES.ENDED;
      session.endedAt = new Date();
      session.endReason = reason || "ended_by_participant";
      if (session.startedAt) {
        session.durationSeconds = Math.round((session.endedAt - session.startedAt) / 1000);
      }
      await session.save();
      cancelMissedCallCheck(sessionId);

      const room = roomName(session.sessionRoomId);
      io.to(room).emit("consult:state-changed", { sessionId, state: session.state });

      const roomSockets = await io.in(room).fetchSockets();
      for (const s of roomSockets) {
        s.leave(room);
        s.data.consultSessions?.delete(sessionId);
      }
    } catch (err) {
      log.error("consult:end failed", err.message);
    }
  });

  socket.on("consult:leave", async ({ sessionId }) => {
    await handleLeave(sessionId);
  });

  socket.on("disconnect", async () => {
    for (const sessionId of socket.data.consultSessions || []) {
      await handleLeave(sessionId);
    }
  });

  async function handleLeave(sessionId) {
    try {
      const session = await ConsultationSession.findById(sessionId);
      if (!session) return;

      const participant = session.participants.find((p) => p.socketId === socket.id);
      if (participant) participant.leftAt = new Date();
      await session.save();

      const room = roomName(session.sessionRoomId);
      socket.leave(room);
      socket.data.consultSessions?.delete(sessionId);
      socket.to(room).emit("consult:peer-left", { peerSocketId: socket.id });
    } catch (err) {
      log.error("handleLeave failed", err.message);
    }
  }
}

module.exports = { registerSignalingHandlers };
