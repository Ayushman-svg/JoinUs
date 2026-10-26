const { sanitizeError } = require('../src/utils/sanitizeLog');

describe('Crash isolation: sanitizeError', () => {
  it('redacts mongodb connection strings with user credentials', () => {
    const errorWithMongo = new Error('Connection failed to mongodb+srv://admin_user:super_secret_pw@cluster0.abc.mongodb.net/prod');
    const sanitized = sanitizeError(errorWithMongo);
    expect(sanitized).not.toContain('admin_user');
    expect(sanitized).not.toContain('super_secret_pw');
    expect(sanitized).toContain('mongodb+srv://***:***@');
  });

  it('redacts Authorization Bearer tokens', () => {
    const errorWithBearer = new Error('Failed with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NTY3ODkwIn0.signature_part');
    const sanitized = sanitizeError(errorWithBearer);
    expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(sanitized).toContain('Bearer ***');
  });

  it('redacts raw API keys, passwords, and secrets', () => {
    const text = 'Failed request with apiKey="abc123secretXYZ" and secret: "topSecretValue" and password=myPassword123';
    const sanitized = sanitizeError(text);
    expect(sanitized).not.toContain('abc123secretXYZ');
    expect(sanitized).not.toContain('topSecretValue');
    expect(sanitized).not.toContain('myPassword123');
    expect(sanitized).toContain('apiKey=***');
    expect(sanitized).toContain('secret=***');
    expect(sanitized).toContain('password=***');
  });

  it('preserves general error messages that contain no secrets', () => {
    const safeError = new Error('Database connection timed out after 5000ms');
    const sanitized = sanitizeError(safeError);
    expect(sanitized).toContain('Database connection timed out after 5000ms');
  });
});
