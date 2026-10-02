const http = require('http');

const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');

// Plain http server so Socket.io can attach to it later
const server = http.createServer(app);

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  server.listen(env.port, () => {
    console.log(`JoinUs server running on port ${env.port} (${env.nodeEnv})`);
  });
}

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  // Force exit if connections refuse to close
  setTimeout(() => process.exit(1), 10000).unref();

  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();