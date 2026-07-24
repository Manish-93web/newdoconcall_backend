const ConsultationSession = require("../models/ConsultationSession");
const { CONSULTATION_STATES } = require("../config/constants");
const { scheduleMissedCallCheck, cancelMissedCallCheck } = require("../jobs/missedCallTimeout.job");
const { createLogger } = require("../utils/logger");
const { sanitizeText } = require("../utils/sanitize");

const log = createLogger("sockets:signaling");

function roomName(sessionRoomId) {
  return `consult:${sessionRoomId}`;
}

// In-memory only (never persisted) — a late joiner asks for this once via
// consult:whiteboard-request-state. Fine at this app's single-Node-process scale; would
// need a shared store (Redis) only if this process were ever horizontally scaled.
const whiteboardBySession = new Map();

function getWhiteboard(sessionId) {
  let board = whiteboardBySession.get(sessionId);
  if (!board) {
    board = { objects: [], locked: false };
    whiteboardBySession.set(sessionId, board);
  }
  return board;
}

// The host is always the originally-booked treating doctor (role "doctor" in
// participants — an invited mid-call doctor is role "specialist" and never a host).
// Backs every host-only control below (kick, force-mute, hold-peer).
function isHost(session, userId) {
  return session.participants.some((p) => p.role === "doctor" && p.user.toString() === userId);
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
    // The caller must itself be a member of this room — sockets only join a room via a
    // successful consult:join (which already checked participant membership), so this is
    // a cheap, sufficient check against an authenticated-but-uninvolved user relaying fake
    // signaling into someone else's call just by knowing its sessionId/targetPeerId.
    if (!socket.rooms.has(room)) return;
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
    const room = roomName(session.sessionRoomId);
    // socket.to(room).emit() broadcasts to a room regardless of whether the sender is
    // itself a member — this check is what actually keeps an uninvolved authenticated
    // user from injecting fake status broadcasts into someone else's call.
    if (!socket.rooms.has(room)) return;
    socket.to(room).emit("consult:media-state", { kind, enabled, fromSocketId: socket.id });
  });

  socket.on("consult:screen-share", async ({ sessionId, active }) => {
    const session = await ConsultationSession.findById(sessionId).select("sessionRoomId");
    if (!session) return;
    const room = roomName(session.sessionRoomId);
    if (!socket.rooms.has(room)) return;
    socket.to(room).emit("consult:screen-share", { active, fromSocketId: socket.id });
  });

  // `targetUserId` makes this a private 1:1 message within a multi-party call — delivered
  // only to the sender and that one recipient (their personal `user:<id>` room, already
  // used for consult:incoming-call, not the shared call room) rather than broadcast to
  // everyone. Stored with `to` so getChatHistory can filter it out for everyone else.
  socket.on("consult:chat-message", async ({ sessionId, message, targetUserId }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      // Chat is persisted (chatTranscript) and, unlike whiteboard/reaction payloads, is
      // freeform text a future surface (export, admin audit view) could one day render as
      // raw HTML — sanitize before storing, same opt-in convention as utils/sanitize.js's
      // other freeform-text fields (article bodies, bios, review comments).
      const entry = { sender: socket.user.id, message: sanitizeText(message), sentAt: new Date(), to: targetUserId || null };
      session.chatTranscript.push(entry);
      await session.save();

      if (targetUserId) {
        io.to(`user:${targetUserId}`).emit("consult:chat-message", entry);
        socket.emit("consult:chat-message", entry);
      } else {
        io.to(roomName(session.sessionRoomId)).emit("consult:chat-message", entry);
      }
    } catch (err) {
      log.error("consult:chat-message failed", err.message);
    }
  });

  // Ephemeral emoji reaction floating over the video area — not persisted, purely a
  // real-time overlay animation for everyone in the room.
  socket.on("consult:reaction", async ({ sessionId, emoji }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      io.to(roomName(session.sessionRoomId)).emit("consult:reaction", {
        emoji,
        fromUserId: socket.user.id,
        at: Date.now(),
      });
    } catch (err) {
      log.error("consult:reaction failed", err.message);
    }
  });

  // Any participant pushes a URL (e.g. a YouTube link or a direct video/image) that opens
  // for the whole room — signaling-only relay, no server-side state kept.
  socket.on("consult:shared-video", async ({ sessionId, url, action }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      io.to(roomName(session.sessionRoomId)).emit("consult:shared-video", {
        url: action === "open" ? url : null,
        action,
        fromUserId: socket.user.id,
      });
    } catch (err) {
      log.error("consult:shared-video failed", err.message);
    }
  });

  // Whiteboard: full-state sync, not incremental ops — every change broadcasts the whole
  // (client-throttled) object list, so a late joiner is always one consult:whiteboard-request-state
  // away from being in sync, with no risk of diverging from missed incremental patches.
  // The wire format (`objects`) is a plain array of fabric.js-shaped descriptors
  // ({type, ...}); mobile only ever emits/renders the "path" subset of it (see
  // useConsultCall.ts on both platforms) but the relay itself is format-agnostic.
  socket.on("consult:whiteboard-update", async ({ sessionId, objects }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      const board = getWhiteboard(sessionId);
      if (board.locked && !isHost(session, socket.user.id)) return;
      board.objects = objects;
      socket.to(roomName(session.sessionRoomId)).emit("consult:whiteboard-update", { objects });
    } catch (err) {
      log.error("consult:whiteboard-update failed", err.message);
    }
  });

  socket.on("consult:whiteboard-request-state", async ({ sessionId }, ack) => {
    try {
      await loadSessionForParticipant(sessionId, socket.user.id);
      const board = getWhiteboard(sessionId);
      ack?.({ ok: true, objects: board.objects, locked: board.locked });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("consult:whiteboard-clear", async ({ sessionId }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      const board = getWhiteboard(sessionId);
      if (board.locked && !isHost(session, socket.user.id)) return;
      board.objects = [];
      io.to(roomName(session.sessionRoomId)).emit("consult:whiteboard-update", { objects: [] });
    } catch (err) {
      log.error("consult:whiteboard-clear failed", err.message);
    }
  });

  // Host-only: locks the whiteboard to view-only for everyone else (e.g. once the doctor
  // has finished annotating and wants to talk through it without further edits).
  socket.on("consult:whiteboard-lock", async ({ sessionId, locked }) => {
    try {
      const session = await ConsultationSession.findById(sessionId).select("sessionRoomId participants");
      if (!session || !isHost(session, socket.user.id)) return;
      const board = getWhiteboard(sessionId);
      board.locked = !!locked;
      io.to(roomName(session.sessionRoomId)).emit("consult:whiteboard-lock-changed", { locked: board.locked });
    } catch (err) {
      log.error("consult:whiteboard-lock failed", err.message);
    }
  });

  // Local (client-side, non-persisted) recording, gated behind explicit consent from every
  // other participant — required before consult:recording-started may be announced, so the
  // room-wide "recording" indicator can never appear without everyone having agreed. The
  // consent tally itself lives on the requester's client (see useConsultCall.ts); the server
  // is just a relay for the request/response/status broadcasts.
  socket.on("consult:recording-request", async ({ sessionId }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      socket.to(roomName(session.sessionRoomId)).emit("consult:recording-request", { fromUserId: socket.user.id });
    } catch (err) {
      log.error("consult:recording-request failed", err.message);
    }
  });

  socket.on("consult:recording-consent", async ({ sessionId, granted }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      socket
        .to(roomName(session.sessionRoomId))
        .emit("consult:recording-consent", { fromUserId: socket.user.id, granted });
    } catch (err) {
      log.error("consult:recording-consent failed", err.message);
    }
  });

  socket.on("consult:recording-started", async ({ sessionId }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      io.to(roomName(session.sessionRoomId)).emit("consult:recording-started", { fromUserId: socket.user.id });
    } catch (err) {
      log.error("consult:recording-started failed", err.message);
    }
  });

  socket.on("consult:recording-stopped", async ({ sessionId }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      io.to(roomName(session.sessionRoomId)).emit("consult:recording-stopped", { fromUserId: socket.user.id });
    } catch (err) {
      log.error("consult:recording-stopped failed", err.message);
    }
  });

  // Ephemeral — not persisted, a simple room-wide indicator (mirrors consult:reaction).
  socket.on("consult:raise-hand", async ({ sessionId, raised }) => {
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      io.to(roomName(session.sessionRoomId)).emit("consult:raise-hand", {
        fromUserId: socket.user.id,
        raised: !!raised,
      });
    } catch (err) {
      log.error("consult:raise-hand failed", err.message);
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
    try {
      const { session } = await loadSessionForParticipant(sessionId, socket.user.id);
      session.state = state;
      await session.save();
      io.to(roomName(session.sessionRoomId)).emit("consult:state-changed", { sessionId, state });
    } catch (err) {
      log.error("consult:hold/resume failed", err.message);
    }
  }

  // --- Host-only participant controls (meaningful now that a room can hold 3+ people) ---

  // Forcibly removes one participant: the server drops their socket from the room and
  // tells their client directly so it can tear down its own UI/PCs, then broadcasts the
  // usual peer-left so everyone else's tile disappears exactly like a normal departure.
  socket.on("consult:kick", async ({ sessionId, targetPeerId }) => {
    try {
      const session = await ConsultationSession.findById(sessionId);
      if (!session || !isHost(session, socket.user.id)) return;

      const room = roomName(session.sessionRoomId);
      const targetSocket = io.sockets.sockets.get(targetPeerId);
      if (!targetSocket || !targetSocket.rooms.has(room)) return;

      const participant = session.participants.find((p) => p.socketId === targetPeerId);
      if (participant) participant.leftAt = new Date();
      await session.save();

      targetSocket.leave(room);
      targetSocket.data.consultSessions?.delete(sessionId);
      io.to(targetPeerId).emit("consult:kicked", { sessionId });
      socket.to(room).emit("consult:peer-left", { peerSocketId: targetPeerId });
    } catch (err) {
      log.error("consult:kick failed", err.message);
    }
  });

  // Host asks a specific participant's own device to mute/unmute or hide/show their own
  // camera — relayed directly to that one client, which applies it to its own local track
  // (there's no way to remotely touch someone else's hardware) and then broadcasts the
  // resulting consult:media-state exactly as if they'd toggled it themselves.
  socket.on("consult:force-media", async ({ sessionId, targetPeerId, kind, enabled }) => {
    try {
      const session = await ConsultationSession.findById(sessionId).select("sessionRoomId participants");
      if (!session || !isHost(session, socket.user.id)) return;
      const room = roomName(session.sessionRoomId);
      const targetSocket = io.sockets.sockets.get(targetPeerId);
      if (!targetSocket || !targetSocket.rooms.has(room)) return;
      io.to(targetPeerId).emit("consult:force-media", { kind, enabled });
    } catch (err) {
      log.error("consult:force-media failed", err.message);
    }
  });

  // Host convenience: mute/hide every OTHER connected peer in one action, rather than one
  // at a time — same underlying consult:force-media relay, just fanned out to the whole
  // room instead of a single targetPeerId.
  socket.on("consult:force-media-all", async ({ sessionId, kind, enabled }) => {
    try {
      const session = await ConsultationSession.findById(sessionId).select("sessionRoomId participants");
      if (!session || !isHost(session, socket.user.id)) return;
      const room = roomName(session.sessionRoomId);
      const roomSockets = await io.in(room).fetchSockets();
      for (const s of roomSockets) {
        if (s.id === socket.id) continue;
        io.to(s.id).emit("consult:force-media", { kind, enabled });
      }
    } catch (err) {
      log.error("consult:force-media-all failed", err.message);
    }
  });

  // Per-peer hold (distinct from consult:hold above, which pauses the whole session) —
  // e.g. the host holds an invited specialist while speaking privately with the patient.
  // A room-wide broadcast (including back to the host and the held peer themselves) is
  // enough; no separate targeted message needed.
  socket.on("consult:hold-peer", async ({ sessionId, targetPeerId }) => setPeerHold(sessionId, targetPeerId, true));
  socket.on("consult:resume-peer", async ({ sessionId, targetPeerId }) => setPeerHold(sessionId, targetPeerId, false));

  async function setPeerHold(sessionId, targetPeerId, onHold) {
    try {
      const session = await ConsultationSession.findById(sessionId).select("sessionRoomId participants");
      if (!session || !isHost(session, socket.user.id)) return;
      const room = roomName(session.sessionRoomId);
      io.to(room).emit("consult:peer-hold-changed", { peerSocketId: targetPeerId, onHold });
    } catch (err) {
      log.error("consult:hold-peer failed", err.message);
    }
  }

  // "Hang up" ends the whole consultation for everyone only when called by one of the two
  // original participants (doctor/patient) — a consult is fundamentally between them, so
  // either leaving does end it for both, matching the original 1:1 behavior. An invited
  // specialist hanging up should only leave (same as consult:leave); without this check they
  // could unilaterally terminate the doctor's and patient's session too.
  socket.on("consult:end", async ({ sessionId, reason }) => {
    try {
      const session = await ConsultationSession.findById(sessionId);
      if (!session) return;

      // Also covers a caller who isn't a participant of this session at all (falling
      // through to the full end-for-everyone branch below would have let anyone holding a
      // valid sessionId terminate someone else's consult without ever having joined it).
      const participant = session.participants.find((p) => p.user.toString() === socket.user.id);
      if (!participant || participant.role === "specialist") {
        return handleLeave(sessionId);
      }

      session.state = CONSULTATION_STATES.ENDED;
      session.endedAt = new Date();
      session.endReason = reason || "ended_by_participant";
      if (session.startedAt) {
        session.durationSeconds = Math.round((session.endedAt - session.startedAt) / 1000);
      }
      await session.save();
      cancelMissedCallCheck(sessionId);
      whiteboardBySession.delete(sessionId);

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
