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

  // Full-mesh join: the newcomer creates one RTCPeerConnection + offer per peer already
  // in the room (returned here as `peers`); each existing peer just reacts to
  // `consult:peer-joined` by creating an empty PC for that one id and waiting for an
  // offer targeted at them (see part 3 of the useConsultCall.ts rework). This one-sided
  // "newcomer always offers" convention avoids two peers racing to offer each other.
  socket.on("consult:join", async ({ sessionId }, ack) => {
    try {
      const { session, participant } = await loadSessionForParticipant(sessionId, socket.user.id);
      if (session.state === CONSULTATION_STATES.ENDED) {
        return ack?.({ ok: false, error: "SESSION_ENDED" });
      }

      const room = roomName(session.sessionRoomId);
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
        // Only the originally-booked other side (patient/doctor) gets rung — a specialist
        // invited later joins straight into an already-connected room (the `else` branch),
        // never re-triggering a ring.
        const originalOther = session.participants.find(
          (p) => p.role !== "specialist" && p.user.toString() !== socket.user.id
        );
        if (originalOther?.user) {
          io.to(`user:${originalOther.user}`).emit("consult:incoming-call", {
            sessionId: session._id,
            fromUser: socket.user.id,
          });
        }
        ack?.({ ok: true, state: session.state, peers: [] });
      } else {
        const peers = roomSockets.map((s) => ({ peerSocketId: s.id, userId: s.user.id }));
        socket.to(room).emit("consult:peer-joined", { peerSocketId: socket.id, userId: socket.user.id });
        io.to(room).emit("consult:state-changed", { sessionId: session._id, state: session.state });
        ack?.({ ok: true, state: session.state, peers });
      }
    } catch (err) {
      log.error("consult:join failed", err.message);
      ack?.({ ok: false, error: err.message });
    }
  });

  // Point-to-point SDP/ICE relay, one specific peer at a time — required once a room can
  // hold 3+ sockets (a room-wide broadcast would deliver an offer meant for one peer to
  // every peer, who'd each answer against the wrong remote description). `targetPeerId`'s
  // room membership is checked before relaying so a client can't use it to inject a fake
  // offer into an arbitrary unrelated socket outside this session.
  async function relayToPeer(sessionId, targetPeerId, event, payload) {
    const session = await ConsultationSession.findById(sessionId).select("sessionRoomId");
    if (!session) return;
    const room = roomName(session.sessionRoomId);
    const targetSocket = io.sockets.sockets.get(targetPeerId);
    if (!targetSocket || !targetSocket.rooms.has(room)) return;
    io.to(targetPeerId).emit(event, { ...payload, fromSocketId: socket.id });
  }

  socket.on("consult:offer", ({ sessionId, sdp, targetPeerId }) =>
    relayToPeer(sessionId, targetPeerId, "consult:offer", { sdp })
  );

  socket.on("consult:answer", ({ sessionId, sdp, targetPeerId }) =>
    relayToPeer(sessionId, targetPeerId, "consult:answer", { sdp })
  );

  socket.on("consult:ice-candidate", ({ sessionId, candidate, targetPeerId }) =>
    relayToPeer(sessionId, targetPeerId, "consult:ice-candidate", { candidate })
  );

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
