/**
 * Unit: auth — hash, JWT, middleware (không cần HTTP server)
 */
describe('server/auth', () => {
  let auth;

  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-jest-only';
    process.env.JWT_EXPIRES_IN = '1h';
    auth = require('../../server/auth');
  });

  it('hashPassword và verifyPassword khớp', () => {
    const h = auth.hashPassword('mySecretPass99');
    expect(h).toBeTruthy();
    expect(h).not.toBe('mySecretPass99');
    expect(auth.verifyPassword('mySecretPass99', h)).toBe(true);
    expect(auth.verifyPassword('wrong', h)).toBe(false);
  });

  it('signToken và verifyToken round-trip', () => {
    const token = auth.signToken({
      id: 42,
      email: 'u@test.com',
      role: 'pm',
      displayName: 'User Name',
    });
    const payload = auth.verifyToken(token);
    expect(payload.sub).toBe(42);
    expect(payload.email).toBe('u@test.com');
    expect(payload.role).toBe('pm');
    expect(payload.name).toBe('User Name');
  });

  it('verifyToken ném lỗi với token sai', () => {
    expect(() => auth.verifyToken('not.a.jwt')).toThrow();
  });

  describe('authMiddleware', () => {
    it('401 khi không có Authorization', () => {
      const req = { headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      auth.authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('401 khi Bearer không hợp lệ', () => {
      const req = { headers: { authorization: 'Bearer garbage' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      auth.authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('gọi next và gắn req.user khi token hợp lệ', () => {
      const token = auth.signToken({
        id: 1,
        email: 'a@b.com',
        role: 'director',
        displayName: 'D',
      });
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = { status: jest.fn(), json: jest.fn() };
      const next = jest.fn();
      auth.authMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user.sub).toBe(1);
      expect(req.user.role).toBe('director');
    });
  });

  describe('requireRole', () => {
    it('403 khi role không khớp', () => {
      const mw = auth.requireRole('director', 'admin');
      const req = { user: { role: 'pm' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('next khi role khớp', () => {
      const mw = auth.requireRole('director');
      const req = { user: { role: 'director' } };
      const res = { status: jest.fn(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
