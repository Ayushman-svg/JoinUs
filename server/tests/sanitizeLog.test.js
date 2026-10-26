const { sanitizeError } = require('../src/utils/sanitizeLog');
const { errorHandler } = require('../src/middleware/errorHandler');

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

  it('redacts Mongo connection strings and Bearer tokens in error messages logged by errorHandler', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error(
      'Failed connecting to mongodb+srv://admin_user:secret_password@cluster0.abc.mongodb.net/prod with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NTY3ODkwIn0.signature'
    );
    const req = {};
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    errorHandler(err, req, res, next);

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls[0][0];
    expect(logged).not.toContain('admin_user');
    expect(logged).not.toContain('secret_password');
    expect(logged).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(logged).toContain('mongodb+srv://***:***@');
    expect(logged).toContain('Bearer ***');

    errorSpy.mockRestore();
  });
});
