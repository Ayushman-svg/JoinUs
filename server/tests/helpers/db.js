const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Registers the models so their unique indexes can be built
require('../../src/models/User');
require('../../src/models/Meeting');

let mongod;

// Starts a throwaway in-memory MongoDB (the binary is downloaded on first run)
async function connectTestDB() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), {
    dbName: 'joinus_test',
    serverSelectionTimeoutMS: 10000,
    // Workaround for a handshake bug in mongodb driver 7.6 inside Jest
    // (mongodb-memory-server issue #1026): hand the driver the os module explicitly
    runtimeAdapters: { os },
  });
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

// Empties every collection but keeps the indexes
async function clearTestDB() {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
  );
}

async function disconnectTestDB() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

module.exports = { connectTestDB, clearTestDB, disconnectTestDB };