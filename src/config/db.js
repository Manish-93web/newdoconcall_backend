const mongoose = require("mongoose");
const env = require("./env");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Some network paths (notably this sandbox) occasionally reset the initial TLS
// handshake to Atlas — retry a few times with backoff instead of crashing on boot.
async function connectDB(retries = 10, baseDelayMs = 1500) {
  mongoose.set("strictQuery", true);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 15000 });
      console.log(`[db] connected to MongoDB (${mongoose.connection.name})`);
      mongoose.connection.on("error", (err) => {
        console.error("[db] connection error", err.message);
      });
      return;
    } catch (err) {
      console.error(`[db] connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      // Failures on this network path tend to come in bursty windows rather than
      // independently at random, so back off (capped) instead of a fixed delay.
      await sleep(Math.min(baseDelayMs * attempt, 8000));
    }
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
