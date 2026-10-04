const request = require('supertest');
const app = require('../../src/app');

let counter = 0;

// Registers a user through the real API and returns the token for authenticated calls
async function createUser(overrides = {}) {
  counter += 1;
  const body = {
    name: 'Test User',
    email: `user${counter}@example.com`,
    password: 'password123',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  return { token: res.body.token, user: res.body.user, credentials: body };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { createUser, bearer };
