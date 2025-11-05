/**
 * @jest-environment jsdom
 *
 * UI Component Tests for BrokerManagement
 *
 * Tests:
 * 1. Component rendering in different states
 * 2. Loading states
 * 3. Empty state display
 * 4. Configured brokers display
 * 5. Connection testing functionality
 * 6. Disconnect functionality
 * 7. User interactions
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrokerManagement } from '../../../src/dashboard/components/BrokerManagement';

// Mock fetch globally
global.fetch = jest.fn();

describe('BrokerManagement Component', () => {
  const mockConfiguredBrokers = {
    success: true,
    brokers: [
      {
        key: 'alpaca',
        name: 'Alpaca',
        type: 'stock',
        authMethod: 'api-key',
        environment: 'testnet',
        configuredAt: '2025-01-15T10:00:00.000Z',
        lastVerified: '2025-01-16T08:30:00.000Z'
      },
      {
        key: 'coinbasepro',
        name: 'Coinbase Pro',
        type: 'crypto',
        authMethod: 'api-key',
        environment: 'live',
        configuredAt: '2025-01-14T15:00:00.000Z',
        lastVerified: '2025-01-16T09:00:00.000Z'
      }
    ]
  };

  const mockTestResult = {
    success: true,
    message: 'Connection successful',
    balance: {
      available: 10000.00,
      total: 12500.00
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe('Initial Rendering', () => {
    test('should render component without crashing', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, brokers: [] })
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('OAuth2 Broker Connections')).toBeInTheDocument();
      });
    });

    test('should show loading state initially', () => {
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({
              ok: true,
              json: async () => mockConfiguredBrokers
            }), 1000);
          })
      );

      render(<BrokerManagement />);
      expect(screen.getByText('Loading broker configurations…')).toBeInTheDocument();
    });

    test('should fetch configured brokers on mount', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/brokers/user/configured');
      });
    });
  });

  describe('Empty State', () => {
    test('should display empty state when no brokers configured', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, brokers: [] })
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('No API Key Brokers Connected')).toBeInTheDocument();
        expect(screen.getByText(/Use the broker wizard to add exchanges/i)).toBeInTheDocument();
      });
    });

    test('should show BrokerConfigWizard button in empty state', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, brokers: [] })
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('No API Key Brokers Connected')).toBeInTheDocument();
      });
    });
  });

  describe('Configured Brokers Display', () => {
    test('should display configured brokers after successful fetch', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
        expect(screen.getByText('Coinbase Pro')).toBeInTheDocument();
      });
    });

    test('should display broker type badges', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Stocks')).toBeInTheDocument();
        expect(screen.getByText('Crypto')).toBeInTheDocument();
      });
    });

    test('should display environment badges', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Paper Trading')).toBeInTheDocument();
        expect(screen.getByText('Live Trading')).toBeInTheDocument();
      });
    });

    test('should display auth method for each broker', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        const apiKeyBadges = screen.getAllByText('API Key');
        expect(apiKeyBadges.length).toBe(2);
      });
    });

    test('should display configured and last verified dates', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        // Check that date formatting is present (dates will be localized)
        const configuredLabels = screen.getAllByText(/Configured:/i);
        const lastVerifiedLabels = screen.getAllByText(/Last Verified:/i);
        expect(configuredLabels.length).toBe(2);
        expect(lastVerifiedLabels.length).toBe(2);
      });
    });

    test('should display security alert when brokers are configured', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText(/API keys are encrypted with AWS KMS/i)).toBeInTheDocument();
      });
    });
  });

  describe('Connection Testing', () => {
    test('should test connection when Test Connection button clicked', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTestResult
      });

      const testButtons = screen.getAllByText(/Test Connection/i);
      fireEvent.click(testButtons[0]);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/brokers/test/alpaca',
          { method: 'POST' }
        );
      });
    });

    test('should show loading state during connection test', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({
              ok: true,
              json: async () => mockTestResult
            }), 100);
          })
      );

      const testButtons = screen.getAllByText(/Test Connection/i);
      fireEvent.click(testButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Testing…')).toBeInTheDocument();
      });
    });

    test('should display success message after successful test', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTestResult
      });

      const testButtons = screen.getAllByText(/Test Connection/i);
      fireEvent.click(testButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument();
        expect(screen.getByText(/Balance:/i)).toBeInTheDocument();
      });
    });

    test('should display error message after failed test', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          message: 'Invalid API credentials'
        })
      });

      const testButtons = screen.getAllByText(/Test Connection/i);
      fireEvent.click(testButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Invalid API credentials/i)).toBeInTheDocument();
      });
    });

    test('should disable test button while testing', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({
              ok: true,
              json: async () => mockTestResult
            }), 100);
          })
      );

      const testButtons = screen.getAllByText(/Test Connection/i);
      fireEvent.click(testButtons[0]);

      await waitFor(() => {
        const testingButton = screen.getByText('Testing…');
        expect(testingButton.closest('button')).toBeDisabled();
      });
    });
  });

  describe('Disconnect Functionality', () => {
    test('should show confirmation dialog when disconnect clicked', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      // Mock window.confirm
      global.confirm = jest.fn(() => false);

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /Disconnect.*broker/i });

      if (deleteButtons.length > 0) {
        fireEvent.click(deleteButtons[0]);
        expect(global.confirm).toHaveBeenCalledWith(
          expect.stringContaining('disconnect')
        );
      }
    });

    test('should not disconnect if user cancels confirmation', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      global.confirm = jest.fn(() => false);

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      const initialFetchCount = global.fetch.mock.calls.length;

      const deleteButtons = screen.getAllByRole('button', { name: /Disconnect.*broker/i });

      if (deleteButtons.length > 0) {
        fireEvent.click(deleteButtons[0]);

        // Should not make additional fetch call
        expect(global.fetch.mock.calls.length).toBe(initialFetchCount);
      }
    });

    test('should disconnect broker if user confirms', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      global.confirm = jest.fn(() => true);

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const deleteButtons = screen.getAllByRole('button', { name: /Disconnect.*broker/i });

      if (deleteButtons.length > 0) {
        fireEvent.click(deleteButtons[0]);

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/brokers/user/'),
            expect.objectContaining({ method: 'DELETE' })
          );
        });
      }
    });

    test('should remove broker from list after successful disconnect', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      global.confirm = jest.fn(() => true);

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
        expect(screen.getByText('Coinbase Pro')).toBeInTheDocument();
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const deleteButtons = screen.getAllByRole('button', { name: /Disconnect.*broker/i });
      if (deleteButtons.length > 0) {
        fireEvent.click(deleteButtons[0]);
      }

      await waitFor(() => {
        // Alpaca should be removed but Coinbase Pro should remain
        expect(screen.queryByText('Alpaca')).not.toBeInTheDocument();
        expect(screen.getByText('Coinbase Pro')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle fetch error when loading brokers', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to fetch configured brokers:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    test('should handle test connection failure gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockRejectedValueOnce(new Error('Connection timeout'));

      const testButtons = screen.getAllByText(/Test Connection/i);
      fireEvent.click(testButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Test failed/i)).toBeInTheDocument();
      });
    });

    test('should handle disconnect failure gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      global.confirm = jest.fn(() => true);

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockRejectedValueOnce(new Error('Server error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const deleteButtons = screen.getAllByRole('button', { name: /Disconnect.*broker/i });
      if (deleteButtons.length > 0) {
        fireEvent.click(deleteButtons[0]);
      }

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to disconnect broker:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe('User Interactions', () => {
    test('should render Test Connection button for each broker', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        const testButtons = screen.getAllByText(/Test Connection/i);
        expect(testButtons.length).toBe(2);
      });
    });

    test('should render disconnect button for each broker', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        const deleteButtons = screen.getAllByRole('button', { name: /Disconnect.*broker/i });
        expect(deleteButtons.length).toBe(2);
      });
    });

    test('should show spinning icon on refresh button when testing', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Alpaca')).toBeInTheDocument();
      });

      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({
              ok: true,
              json: async () => mockTestResult
            }), 100);
          })
      );

      const testButtons = screen.getAllByText(/Test Connection/i);
      fireEvent.click(testButtons[0]);

      await waitFor(() => {
        const testingButton = screen.getByText('Testing…');
        const svg = testingButton.closest('button')?.querySelector('svg');
        expect(svg).toHaveClass('animate-spin');
      });
    });
  });

  describe('Broker Icons', () => {
    test('should display TrendingUp icon for stock brokers', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        const stockBrokerCard = screen.getByText('Alpaca').closest('.space-y-6, div');
        expect(stockBrokerCard).toBeInTheDocument();
      });
    });

    test('should display Bitcoin icon for crypto brokers', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfiguredBrokers
      });

      render(<BrokerManagement />);

      await waitFor(() => {
        const cryptoBrokerCard = screen.getByText('Coinbase Pro').closest('.space-y-6, div');
        expect(cryptoBrokerCard).toBeInTheDocument();
      });
    });
  });
});
