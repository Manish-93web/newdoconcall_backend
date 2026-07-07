const http = require("http");
const env = require("./src/config/env");
const { connectDB } = require("./src/config/db");
const app = require("./app");
const { startAppointmentReminderJob } = require("./src/jobs/appointmentReminders.job");
const { startRefillReminderJob } = require("./src/jobs/refillReminders.job");
const { attachSockets } = require("./src/sockets");

const server = http.createServer(app);
const io = attachSockets(server);
app.set("io", io);

async function start() {
  await connectDB();
  startAppointmentReminderJob();
  startRefillReminderJob();
  server.listen(env.port, () => {
    console.log(`[server] DoconCall API listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error("[server] Failed to start", err);
  process.exit(1);
});

module.exports = server;
