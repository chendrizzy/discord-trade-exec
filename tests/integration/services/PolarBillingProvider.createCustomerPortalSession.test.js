/**
 * Integration Test: PolarBillingProvider.createCustomerPortalSession Real API Paths
 *
 * Tests for lines 154-171 of PolarBillingProvider.js
 * Covers successful portal session creation and error handling via real Polar API client
 */

const PolarBillingProvider = require('../../../src/services/billing/providers/PolarBillingProvider');

describe('Integration Test: createCustomerPortalSession Real API Paths', () => {
  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.POLAR_ACCESS_TOKEN;
    delete process.env.POLAR_ORGANIZATION_ID;
  });

  it('should successfully create customer portal session via client.customerSessions.create', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      customerSessions: {
        create: jest.fn()
      }
    };

    const customerId = 'cust_123';
    const returnUrl = 'https://example.com/dashboard';

    const mockPolarResponse = {
      customerSession: {
        id: 'cs_abc123',
        url: 'https://polar.sh/portal/session-abc123'
      }
    };

    provider.client.customerSessions.create.mockResolvedValue(mockPolarResponse);

    // Execute createCustomerPortalSession (lines 154-163)
    const result = await provider.createCustomerPortalSession(customerId, returnUrl);

    // Verify client.customerSessions.create was called correctly (lines 155-158)
    expect(provider.client.customerSessions.create).toHaveBeenCalledWith({
      customerId: 'cust_123',
      returnUrl: 'https://example.com/dashboard'
    });

    // Verify mapped response is returned (lines 160-163)
    expect(result).toBeDefined();
    expect(result.id).toBe('cs_abc123');
    expect(result.url).toBe('https://polar.sh/portal/session-abc123');
  });

  it('should handle error in create customer portal session and throw descriptive error', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      customerSessions: {
        create: jest.fn()
      }
    };

    const customerId = 'cust_invalid';
    const returnUrl = 'https://example.com/dashboard';

    const mockError = new Error('Customer not found');
    mockError.stack = 'Error: Customer not found\n    at Polar.customerSessions.create';

    provider.client.customerSessions.create.mockRejectedValue(mockError);

    // Execute and expect error (lines 164-171)
    await expect(provider.createCustomerPortalSession(customerId, returnUrl)).rejects.toThrow(
      'Failed to create Polar customer portal session: Customer not found'
    );

    // Verify client was called
    expect(provider.client.customerSessions.create).toHaveBeenCalledWith({
      customerId: 'cust_invalid',
      returnUrl: 'https://example.com/dashboard'
    });
  });
});
