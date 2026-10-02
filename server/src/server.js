const http = require('http');

const env = require('./config/env');
const app = require('./app');

// Plain http server so Socket.io can attach to it later
const server = http.createServer(app);

server.listen(env.port, () => {
  console.log(`JoinUs server running on port ${env.port} (${env.nodeEnv})`);
});