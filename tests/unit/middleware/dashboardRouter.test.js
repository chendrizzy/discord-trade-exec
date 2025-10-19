const { dashboardRouter, baseDashboardRouter } = require('../../../src/middleware/dashboardRouter');

describe('Dashboard Router Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      isAuthenticated: jest.fn(),
      user: null,
      path: '',
      url: '',
      originalUrl: ''
    };
    res = {
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('dashboardRouter', () => {
    describe('Authentication', () => {
      it('should redirect unauthenticated users to Discord OAuth', () => {
        req.isAuthenticated.mockReturnValue(false);
        req.originalUrl = '/dashboard/community';

        dashboardRouter(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith(
          '/auth/discord?returnTo=%2Fdashboard%2Fcommunity'
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 401 if user is authenticated but not in session', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = null;

        dashboardRouter(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'User not found in session' });
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Community Host Routing', () => {
      it('should allow admin to access community dashboard', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'admin' };
        req.path = '/dashboard/community';

        dashboardRouter(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.redirect).not.toHaveBeenCalled();
      });

      it('should allow moderator to access community dashboard', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'moderator' };
        req.path = '/dashboard/community';

        dashboardRouter(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.redirect).not.toHaveBeenCalled();
      });

      it('should redirect admin from trader dashboard to community dashboard', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'admin' };
        req.path = '/dashboard/trader';
        req.url = '/dashboard/trader?view=overview';

        dashboardRouter(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/dashboard/community?view=overview');
        expect(next).not.toHaveBeenCalled();
      });

      it('should redirect moderator from trader dashboard to community dashboard', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'moderator' };
        req.path = '/dashboard/trader';
        req.url = '/dashboard/trader';

        dashboardRouter(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/dashboard/community');
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Trader Routing', () => {
      it('should allow trader to access trader dashboard', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'trader' };
        req.path = '/dashboard/trader';

        dashboardRouter(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.redirect).not.toHaveBeenCalled();
      });

      it('should allow viewer to access trader dashboard', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'viewer' };
        req.path = '/dashboard/trader';

        dashboardRouter(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.redirect).not.toHaveBeenCalled();
      });

      it('should redirect trader from community dashboard to trader dashboard', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'trader' };
        req.path = '/dashboard/community';
        req.url = '/dashboard/community?tab=signals';

        dashboardRouter(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/dashboard/trader?tab=signals');
        expect(next).not.toHaveBeenCalled();
      });

      it('should redirect viewer from community dashboard to trader dashboard', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'viewer' };
        req.path = '/dashboard/community';
        req.url = '/dashboard/community';

        dashboardRouter(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/dashboard/trader');
        expect(next).not.toHaveBeenCalled();
      });

      it('should default to trader role if communityRole is not set', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = {}; // No communityRole field
        req.path = '/dashboard/trader';

        dashboardRouter(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.redirect).not.toHaveBeenCalled();
      });
    });

    describe('Query Parameter Preservation', () => {
      it('should preserve query parameters during redirect (admin → community)', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'admin' };
        req.path = '/dashboard/trader';
        req.url = '/dashboard/trader?tab=overview&filter=active';

        dashboardRouter(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/dashboard/community?tab=overview&filter=active');
      });

      it('should preserve query parameters during redirect (trader → trader)', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'trader' };
        req.path = '/dashboard/community';
        req.url = '/dashboard/community?view=analytics';

        dashboardRouter(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/dashboard/trader?view=analytics');
      });

      it('should handle redirect without query parameters', () => {
        req.isAuthenticated.mockReturnValue(true);
        req.user = { communityRole: 'admin' };
        req.path = '/dashboard/trader';
        req.url = '/dashboard/trader';

        dashboardRouter(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/dashboard/community');
      });
    });
  });

  describe('baseDashboardRouter', () => {
    it('should redirect unauthenticated users to Discord OAuth', () => {
      req.isAuthenticated.mockReturnValue(false);
      req.originalUrl = '/dashboard';

      baseDashboardRouter(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/auth/discord?returnTo=%2Fdashboard');
    });

    it('should return 401 if user is authenticated but not in session', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = null;

      baseDashboardRouter(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found in session' });
    });

    it('should redirect admin to community dashboard', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'admin' };
      req.url = '/dashboard';

      baseDashboardRouter(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/dashboard/community');
    });

    it('should redirect moderator to community dashboard', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'moderator' };
      req.url = '/dashboard';

      baseDashboardRouter(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/dashboard/community');
    });

    it('should redirect trader to trader dashboard', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'trader' };
      req.url = '/dashboard';

      baseDashboardRouter(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/dashboard/trader');
    });

    it('should redirect viewer to trader dashboard', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'viewer' };
      req.url = '/dashboard';

      baseDashboardRouter(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/dashboard/trader');
    });

    it('should preserve query parameters during redirect (admin)', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'admin' };
      req.url = '/dashboard?tab=signals&view=detailed';

      baseDashboardRouter(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/dashboard/community?tab=signals&view=detailed');
    });

    it('should preserve query parameters during redirect (trader)', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { communityRole: 'trader' };
      req.url = '/dashboard?page=history';

      baseDashboardRouter(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/dashboard/trader?page=history');
    });

    it('should default to trader role if communityRole is not set', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = {}; // No communityRole field
      req.url = '/dashboard';

      baseDashboardRouter(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/dashboard/trader');
    });
  });
});
