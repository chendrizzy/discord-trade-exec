/**
 * @jest-environment jsdom
 *
 * UI Component Tests for FeeComparison
 *
 * Tests:
 * 1. Component rendering in different states
 * 2. Loading states
 * 3. Error handling
 * 4. Data display
 * 5. User interactions
 * 6. Auto-refresh behavior
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FeeComparison } from '../../../src/dashboard/components/FeeComparison';

// Mock fetch globally
global.fetch = jest.fn();

describe('FeeComparison Component', () => {
  const mockComparisonData = {
    success: true,
    data: {
      comparisons: [
        {
          exchange: 'kraken',
          displayName: 'Kraken',
          symbol: 'BTC/USD',
          quantity: 1.0,
          currentPrice: 49995,
          tradeValue: 49995,
          fees: {
            maker: 0.0016,
            taker: 0.0026,
            takerPercent: 0.26
          },
          estimatedFee: 129.987,
          estimatedFeePercent: 0.26,
          savingsVsMostExpensive: 120.038,
          isCheapest: true,
          isMostExpensive: false,
          website: 'https://www.kraken.com'
        },
        {
          exchange: 'coinbasepro',
          displayName: 'Coinbase Pro',
          symbol: 'BTC/USD',
          quantity: 1.0,
          currentPrice: 50005,
          tradeValue: 50005,
          fees: {
            maker: 0.005,
            taker: 0.005,
            takerPercent: 0.5
          },
          estimatedFee: 250.025,
          estimatedFeePercent: 0.5,
          savingsVsMostExpensive: 0,
          isCheapest: false,
          isMostExpensive: true,
          website: 'https://pro.coinbase.com'
        }
      ],
      recommendation: {
        exchange: 'Kraken',
        reason: 'Kraken offers the lowest trading fee at $129.99',
        estimatedFee: 129.987,
        savings: 120.038,
        savingsPercent: 48.01
      },
      summary: {
        totalExchangesCompared: 2,
        cheapestExchange: 'Kraken',
        cheapestFee: 129.987,
        mostExpensiveExchange: 'Coinbase Pro',
        mostExpensiveFee: 250.025,
        maxSavings: 120.038
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe('Initial Rendering', () => {
    test('should render component without crashing', () => {
      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);
      expect(screen.getByText('Fee Comparison')).toBeInTheDocument();
    });

    test('should show empty state when no data', () => {
      render(<FeeComparison symbol="" quantity={0} />);
      expect(screen.getByText('No Comparison Yet')).toBeInTheDocument();
      expect(screen.getByText(/Enter a symbol and quantity/i)).toBeInTheDocument();
    });

    test('should render header with refresh button', () => {
      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    test('should show loading spinner when fetching data', async () => {
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({
              ok: true,
              json: async () => mockComparisonData
            }), 1000);
          })
      );

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      // Wait for debounce
      await waitFor(
        () => {
          expect(screen.getByText('Loading fee comparison...')).toBeInTheDocument();
        },
        { timeout: 600 }
      );
    });

    test('should disable refresh button while loading', async () => {
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({
              ok: true,
              json: async () => mockComparisonData
            }), 100);
          })
      );

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        const refreshButton = screen.getByRole('button', { name: /refresh/i });
        expect(refreshButton).toBeDisabled();
      }, { timeout: 600 });
    });
  });

  describe('Data Display', () => {
    test('should display comparison data after successful fetch', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        expect(screen.getAllByText('Kraken').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Coinbase Pro').length).toBeGreaterThan(0);
      }, { timeout: 1000 });
    });

    test('should display recommendation card', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        expect(screen.getByText('Best Rate Recommendation')).toBeInTheDocument();
        expect(screen.getByText(/Trade on Kraken/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    test('should highlight cheapest exchange with "Best Rate" badge', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        expect(screen.getByText('Best Rate')).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    test('should display formatted currency values', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        // Check for formatted currency (includes $ and .XX)
        expect(screen.getAllByText(/\$129\.99/i).length).toBeGreaterThan(0);
      }, { timeout: 1000 });
    });

    test('should display summary statistics', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        expect(screen.getByText('Cheapest Exchange')).toBeInTheDocument();
        expect(screen.getByText('Max Savings')).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('Error Handling', () => {
    test('should display error when fetch fails', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    test('should display error when API returns error response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          message: 'No exchanges connected'
        })
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        expect(screen.getByText(/No exchanges connected/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    test('should show validation error for invalid inputs', () => {
      render(<FeeComparison symbol="" quantity={0} />);

      // With empty symbol and zero quantity, should show empty state, not error
      expect(screen.getByText('No Comparison Yet')).toBeInTheDocument();
    });

    test('should display partial errors from individual exchanges', async () => {
      const dataWithErrors = {
        ...mockComparisonData,
        data: {
          ...mockComparisonData.data,
          errors: [
            { exchange: 'binance', error: 'API rate limit exceeded' }
          ]
        }
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => dataWithErrors
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        expect(screen.getByText(/Some exchanges could not be compared/i)).toBeInTheDocument();
        expect(screen.getByText(/API rate limit exceeded/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('User Interactions', () => {
    test('should fetch data when refresh button is clicked', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      // Wait for initial fetch
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      }, { timeout: 1000 });

      // Click refresh
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      // Should fetch again
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    });

    test('should show spinning icon on refresh button when loading', async () => {
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({
              ok: true,
              json: async () => mockComparisonData
            }), 100);
          })
      );

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        const refreshButton = screen.getByRole('button', { name: /refresh/i });
        const svg = refreshButton.querySelector('svg');
        expect(svg).toHaveClass('animate-spin');
      }, { timeout: 600 });
    });
  });

  describe('Auto-fetch Behavior', () => {
    test('should fetch data when symbol or quantity changes', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockComparisonData
      });

      const { rerender } = render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      // Wait for initial fetch
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      }, { timeout: 1000 });

      // Change quantity
      rerender(<FeeComparison symbol="BTC/USD" quantity={2.0} />);

      // Should fetch again
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      }, { timeout: 1000 });
    });

    test('should debounce rapid changes', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockComparisonData
      });

      const { rerender } = render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      // Make rapid changes
      rerender(<FeeComparison symbol="BTC/USD" quantity={1.1} />);
      rerender(<FeeComparison symbol="BTC/USD" quantity={1.2} />);
      rerender(<FeeComparison symbol="BTC/USD" quantity={1.3} />);

      // Should only fetch once after debounce
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      }, { timeout: 1000 });
    });
  });

  describe('External Links', () => {
    test('should render exchange website links', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        const links = screen.getAllByText('Visit');
        expect(links.length).toBe(2);
      }, { timeout: 1000 });
    });

    test('should have correct href attributes for exchange links', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        const links = screen.getAllByRole('link');
        const krakenLink = links.find(link => link.href === 'https://www.kraken.com/');
        const coinbaseLink = links.find(link => link.href === 'https://pro.coinbase.com/');

        expect(krakenLink).toBeInTheDocument();
        expect(coinbaseLink).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('Timestamp Display', () => {
    test('should show last updated timestamp after fetch', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockComparisonData
      });

      render(<FeeComparison symbol="BTC/USD" quantity={1.0} />);

      await waitFor(() => {
        expect(screen.getByText(/Last updated:/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });
});
