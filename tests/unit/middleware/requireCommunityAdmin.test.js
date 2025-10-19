const requireCommunityAdmin = require('../../../src/middleware/requireCommunityAdmin');

describe('requireCommunityAdmin Middleware', () => {
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

      requireCommunityAdmin(req, res, next);

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

      requireCommunityAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User not found',
        message: 'Session invalid or expired'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Authorization Checks', () => {
    it('should allow admin role to proceed', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'admin' };

      requireCommunityAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should allow moderator role to proceed', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'moderator' };

      requireCommunityAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should return 403 for trader role', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'trader' };

      requireCommunityAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        message: 'Community admin or moderator role required to access this resource',
        requiredRoles: ['admin', 'moderator'],
        currentRole: 'trader'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for viewer role', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'viewer' };

      requireCommunityAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        message: 'Community admin or moderator role required to access this resource',
        requiredRoles: ['admin', 'moderator'],
        currentRole: 'viewer'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if communityRole is not set', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = {}; // No communityRole field

      requireCommunityAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        message: 'Community admin or moderator role required to access this resource',
        requiredRoles: ['admin', 'moderator'],
        currentRole: 'none'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for unknown role', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'unknown' };

      requireCommunityAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        message: 'Community admin or moderator role required to access this resource',
        requiredRoles: ['admin', 'moderator'],
        currentRole: 'unknown'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle isAuthenticated being undefined', () => {
      req.isAuthenticated = undefined;

      requireCommunityAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle isAuthenticated throwing an error', () => {
      req.isAuthenticated = jest.fn().mockImplementation(() => {
        throw new Error('Auth error');
      });

      expect(() => {
        requireCommunityAdmin(req, res, next);
      }).toThrow('Auth error');
    });
  });
});
