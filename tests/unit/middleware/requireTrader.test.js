const requireTrader = require('../../../src/middleware/requireTrader');

describe('requireTrader Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      isAuthenticated: jest.fn(),
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('Authentication Checks', () => {
    it('should return 401 if user is not authenticated', () => {
      req.isAuthenticated.mockReturnValue(false);

      requireTrader(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Please login to access this resource'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if user is authenticated but not in session', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = null;

      requireTrader(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User not found',
        message: 'Session invalid or expired'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Account Status Checks', () => {
    it('should allow active account', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'active' }, communityRole: 'trader' };

      requireTrader(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should allow account without accountStatus field', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'trader' }; // No accountStatus field

      requireTrader(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should return 403 for suspended account', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'suspended' }, communityRole: 'trader' };

      requireTrader(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Account restricted',
        message: 'Account is suspended',
        accountStatus: 'suspended'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for banned account', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'banned' }, communityRole: 'trader' };

      requireTrader(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Account restricted',
        message: 'Account is banned',
        accountStatus: 'banned'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for pending_verification account', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'pending_verification' }, communityRole: 'trader' };

      requireTrader(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Account restricted',
        message: 'Account is pending_verification',
        accountStatus: 'pending_verification'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Role-Agnostic Access', () => {
    it('should allow trader role', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'active' }, communityRole: 'trader' };

      requireTrader(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow viewer role', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'active' }, communityRole: 'viewer' };

      requireTrader(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow admin role (admins can also trade)', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'active' }, communityRole: 'admin' };

      requireTrader(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow moderator role (moderators can also trade)', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'active' }, communityRole: 'moderator' };

      requireTrader(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow user without communityRole field', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: { status: 'active' } }; // No communityRole field

      requireTrader(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle isAuthenticated being undefined', () => {
      req.isAuthenticated = undefined;

      requireTrader(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle isAuthenticated throwing an error', () => {
      req.isAuthenticated = jest.fn().mockImplementation(() => {
        throw new Error('Auth error');
      });

      expect(() => {
        requireTrader(req, res, next);
      }).toThrow('Auth error');
    });

    it('should allow empty accountStatus string (treated as no status)', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { accountStatus: '', communityRole: 'trader' };

      requireTrader(req, res, next);

      // Empty string is falsy, so the check `user.accountStatus && ...` allows it through
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
