// Runs before any test file loads, so src/config/env.js validates these values.
// They deliberately override .env so tests can never touch a real database.
process.env.NODE_ENV = 'test';
process.env.PORT = '5000';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/joinus_test'; // never connected to
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
