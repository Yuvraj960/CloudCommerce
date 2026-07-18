/**
 * Notification Service — Unit Tests
 * Tests Kafka event notification dispatch.
 * Uses jest.requireActual to access the real handleNotification while
 * mocking @cloudcommerce/common logger to verify notification calls.
 */

// ─── Mock functions (declared before jest.mock so factory can reference them) ─
const mockInfo = jest.fn();

jest.mock('@cloudcommerce/common', () => {
  const actual = jest.requireActual('@cloudcommerce/common') as Record<string, unknown>;
  return {
    ...actual,
    // Override logger so we can assert on notification calls
    logger: { info: mockInfo, error: jest.fn() },
  };
});

// ─── Get real kafka module (unmocked) for handleNotification ────────────────
const { handleNotification } = jest.requireActual('../config/kafka') as {
  handleNotification: (
    topic: string,
    payload: Record<string, unknown>
  ) => Promise<void>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── handleNotification ────────────────────────────────────────────────────────
describe('handleNotification', () => {
  it('logs order_created email notification', async () => {
    const event = {
      orderId: 'order-1',
      userId: 'user-1',
      items: [],
      totalAmount: 1000,
      createdAt: '2026-07-05T00:00:00.000Z',
    };
    await handleNotification('order_created', event);
    expect(mockInfo).toHaveBeenCalledWith(
      '[EMAIL] Order confirmation sent',
      expect.objectContaining({ orderId: 'order-1', totalAmount: 1000, subject: 'Order order-1 confirmed' })
    );
  });

  it('logs order_completed email notification', async () => {
    const event = { orderId: 'order-1', completedAt: '2026-07-05T00:00:00.000Z' };
    await handleNotification('order_completed', event);
    expect(mockInfo).toHaveBeenCalledWith(
      '[EMAIL] Order completion notification sent',
      expect.objectContaining({ orderId: 'order-1', subject: 'Order order-1 completed' })
    );
  });

  it('logs order_cancelled email notification with reason', async () => {
    const event = { orderId: 'order-1', reason: 'Out of stock', cancelledAt: '2026-07-05T00:00:00.000Z' };
    await handleNotification('order_cancelled', event);
    expect(mockInfo).toHaveBeenCalledWith(
      '[EMAIL] Order cancellation sent',
      expect.objectContaining({ orderId: 'order-1', reason: 'Out of stock', subject: 'Order order-1 cancelled' })
    );
  });

  it('logs payment_success email with receipt details', async () => {
    const event = { orderId: 'order-1', paymentId: 'pay_123', amount: 5000, paidAt: '2026-07-05T00:00:00.000Z' };
    await handleNotification('payment_success', event);
    expect(mockInfo).toHaveBeenCalledWith(
      '[EMAIL] Payment receipt sent',
      expect.objectContaining({ orderId: 'order-1', paymentId: 'pay_123', amount: 5000, subject: 'Payment pay_123 confirmed' })
    );
  });

  it('logs payment_failed email with failure reason', async () => {
    const event = { orderId: 'order-1', reason: 'Card declined', failedAt: '2026-07-05T00:00:00.000Z' };
    await handleNotification('payment_failed', event);
    expect(mockInfo).toHaveBeenCalledWith(
      '[EMAIL] Payment failure notification sent',
      expect.objectContaining({ orderId: 'order-1', reason: 'Card declined', subject: 'Payment for order order-1 failed' })
    );
  });
});