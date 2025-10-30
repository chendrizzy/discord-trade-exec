/**
 * PolarBillingProvider Unit Tests
 *
 * Tests for getProduct() and listProducts() methods
 * Following TDD red-green-refactor cycle
 */

const PolarBillingProvider = require('../PolarBillingProvider');
const { Polar } = require('@polar-sh/sdk');
const logger = require('../../../../utils/logger');

// Mock dependencies
jest.mock('@polar-sh/sdk');
jest.mock('../../../../utils/logger');

describe('PolarBillingProvider - Product Methods', () => {
  let provider;
  let mockClient;
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set up environment for testing
    process.env.POLAR_ACCESS_TOKEN = 'test_access_token';
    process.env.POLAR_ORGANIZATION_ID = 'test_org_id';
    process.env.NODE_ENV = 'test';

    // Create mock client with products methods
    mockClient = {
      products: {
        get: jest.fn(),
        list: jest.fn()
      }
    };

    // Mock Polar SDK constructor
    Polar.mockImplementation(() => mockClient);

    // Clear all mocks
    jest.clearAllMocks();

    // Instantiate provider
    provider = new PolarBillingProvider();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('getProduct()', () => {
    const testProductId = '550e8400-e29b-41d4-a716-446655440000';
    const mockPolarProduct = {
      id: testProductId,
      name: 'Professional Plan - Monthly',
      description: 'Professional trading signals platform',
      metadata: {
        type: 'community',
        tier: 'professional'
      },
      prices: [
        {
          id: 'price_123',
          priceAmount: 9900,
          priceCurrency: 'usd',
          recurringInterval: 'month'
        }
      ]
    };

    it('should successfully get product via this.client.products.get()', async () => {
      // Arrange
      const mockResult = {
        product: mockPolarProduct
      };
      mockClient.products.get.mockResolvedValue(mockResult);

      // Act
      const result = await provider.getProduct(testProductId);

      // Assert
      expect(mockClient.products.get).toHaveBeenCalledTimes(1);
      expect(mockClient.products.get).toHaveBeenCalledWith({
        id: testProductId
      });
      expect(result).toEqual({
        id: testProductId,
        name: 'Professional Plan - Monthly',
        description: 'Professional trading signals platform',
        metadata: {
          type: 'community',
          tier: 'professional'
        },
        prices: [
          {
            id: 'price_123',
            priceAmount: 9900,
            priceCurrency: 'usd',
            recurringInterval: 'month'
          }
        ]
      });
    });

    it('should handle errors from this.client.products.get() gracefully', async () => {
      // Arrange
      const mockError = new Error('Polar API error: Product not found');
      mockClient.products.get.mockRejectedValue(mockError);

      // Act & Assert
      await expect(provider.getProduct(testProductId)).rejects.toThrow(
        'Failed to get Polar product: Polar API error: Product not found'
      );

      expect(mockClient.products.get).toHaveBeenCalledTimes(1);
      expect(mockClient.products.get).toHaveBeenCalledWith({
        id: testProductId
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[PolarBillingProvider] Error getting product',
        expect.objectContaining({
          error: mockError.message,
          stack: mockError.stack,
          productId: testProductId
        })
      );
    });
  });

  describe('listProducts()', () => {
    const mockPolarProducts = [
      {
        id: '550e8400-mock-4000-b000-product1',
        name: 'Professional Plan - Monthly',
        description: 'Professional trading signals platform',
        metadata: {
          type: 'community',
          tier: 'professional'
        },
        prices: [
          {
            id: 'price_prof',
            priceAmount: 9900,
            priceCurrency: 'usd',
            recurringInterval: 'month'
          }
        ]
      },
      {
        id: '550e8400-mock-4000-b000-product2',
        name: 'Enterprise Plan - Monthly',
        description: 'Enterprise trading signals platform',
        metadata: {
          type: 'community',
          tier: 'enterprise'
        },
        prices: [
          {
            id: 'price_ent',
            priceAmount: 29900,
            priceCurrency: 'usd',
            recurringInterval: 'month'
          }
        ]
      }
    ];

    it('should successfully list products via this.client.products.list() with organizationId', async () => {
      // Arrange
      const mockResult = {
        items: mockPolarProducts
      };
      mockClient.products.list.mockResolvedValue(mockResult);

      // Act
      const result = await provider.listProducts();

      // Assert
      expect(mockClient.products.list).toHaveBeenCalledTimes(1);
      expect(mockClient.products.list).toHaveBeenCalledWith({
        organizationId: 'test_org_id'
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '550e8400-mock-4000-b000-product1',
        name: 'Professional Plan - Monthly',
        description: 'Professional trading signals platform',
        metadata: {
          type: 'community',
          tier: 'professional'
        },
        prices: [
          {
            id: 'price_prof',
            priceAmount: 9900,
            priceCurrency: 'usd',
            recurringInterval: 'month'
          }
        ]
      });
      expect(result[1]).toEqual({
        id: '550e8400-mock-4000-b000-product2',
        name: 'Enterprise Plan - Monthly',
        description: 'Enterprise trading signals platform',
        metadata: {
          type: 'community',
          tier: 'enterprise'
        },
        prices: [
          {
            id: 'price_ent',
            priceAmount: 29900,
            priceCurrency: 'usd',
            recurringInterval: 'month'
          }
        ]
      });
    });

    it('should handle errors from this.client.products.list() gracefully', async () => {
      // Arrange
      const mockError = new Error('Polar API error: Invalid organization ID');
      mockClient.products.list.mockRejectedValue(mockError);

      // Act & Assert
      await expect(provider.listProducts()).rejects.toThrow(
        'Failed to list Polar products: Polar API error: Invalid organization ID'
      );

      expect(mockClient.products.list).toHaveBeenCalledTimes(1);
      expect(mockClient.products.list).toHaveBeenCalledWith({
        organizationId: 'test_org_id'
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[PolarBillingProvider] Error listing products',
        expect.objectContaining({
          error: mockError.message,
          stack: mockError.stack,
          organizationId: 'test_org_id'
        })
      );
    });
  });
});
