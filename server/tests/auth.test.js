const request = require('supertest');

const app = require('../src/app');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser, bearer } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('registration', () => {
  it('creates an account, normalizes the email and never exposes the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: ' Ada@Example.com ', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate emails and invalid input with consistent error bodies', async () => {
    await createUser({ email: 'dup@example.com' });

    const duplicate = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Someone', email: 'DUP@example.com', password: 'password123' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');

    const invalid = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'nope', password: 'short' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.error.details.map((d) => d.field).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);
  });
});

describe('login and session', () => {
  it('logs in with valid credentials and gives the same error for a wrong password or unknown email', async () => {
    const { credentials } = await createUser({ email: 'login@example.com' });

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'wrongpass1' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
  });

  it('protects /me with a bearer token', async () => {
    const { token, user } = await createUser();

    const missing = await request(app).get('/api/auth/me');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('UNAUTHORIZED');

    const garbage = await request(app).get('/api/auth/me').set(bearer('garbage'));
    expect(garbage.status).toBe(401);
    expect(garbage.body.error.code).toBe('INVALID_TOKEN');

    const valid = await request(app).get('/api/auth/me').set(bearer(token));
    expect(valid.status).toBe(200);
    expect(valid.body.user.email).toBe(user.email);
  });
});
