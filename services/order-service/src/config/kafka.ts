import { getKafkaClient, publishEvent, type KafkaClient } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { TOPICS, type OrderCompletedEvent, type OrderCancelledEvent, type PaymentSuccessEvent, type PaymentFailedEvent } from '@cloudcommerce/common';
import { pool } from '../config/db';
import { OrderStatus } from '@cloudcommerce/common';

let kafkaClient: KafkaClient | null = null;
let consumerRunning = false;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

export async function startKafkaConsumer(): Promise<void> {
  kafkaClient = getKafkaClient('order-service-group');
  await kafkaClient.connect();

  const consumer = kafkaClient.consumer;

  await consumer.subscribe({
    topics: [TOPICS.PAYMENT_SUCCESS, TOPICS.PAYMENT_FAILED],
    fromBeginning: false,
  });

  const startConsumer = async () => {
    while (!consumerRunning) {
      try {
        await consumer.run({
          eachMessage: async ({ topic, message }) => {
            if (!message.value) return;

            const payload = JSON.parse(message.value.toString()) as
              | PaymentSuccessEvent
              | PaymentFailedEvent;

            if (topic === TOPICS.PAYMENT_SUCCESS) {
              const event = payload as PaymentSuccessEvent;
              logger.info('Received payment_success', { orderId: event.orderId });
              await handlePaymentSuccess(event);
            } else if (topic === TOPICS.PAYMENT_FAILED) {
              const event = payload as PaymentFailedEvent;
              logger.info('Received payment_failed', { orderId: event.orderId });
              await handlePaymentFailed(event);
            }
          },
        });
        consumerRunning = true;
        logger.info('Order-service Kafka consumer running');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('Kafka consumer startup failed, retrying in 5s', { error: msg });
        if (!consumerRunning) {
          retryTimeout = setTimeout(startConsumer, 5000);
        }
      }
    }
  };

  // Run consumer retry in background — do NOT block HTTP server startup
  startConsumer().catch(err => {
    logger.error('Kafka consumer background loop failed', { error: String(err) });
  });

  logger.info('Order-service Kafka consumer starting', {
    topics: [TOPICS.PAYMENT_SUCCESS, TOPICS.PAYMENT_FAILED].join(', '),
  });
}

async function handlePaymentSuccess(event: PaymentSuccessEvent): Promise<void> {
  await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
    [OrderStatus.Completed, event.orderId]
  );
  const completedAt = new Date().toISOString();
  const completedEvent: OrderCompletedEvent = { orderId: event.orderId, completedAt };
  await publishEvent(kafkaClient!, TOPICS.ORDER_COMPLETED, completedEvent as unknown as Record<string, unknown>);
  logger.info('Order status → completed', { orderId: event.orderId });
}

async function handlePaymentFailed(event: PaymentFailedEvent): Promise<void> {
  await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
    [OrderStatus.Cancelled, event.orderId]
  );
  const cancelledEvent: OrderCancelledEvent = {
    orderId: event.orderId,
    reason: event.reason,
    cancelledAt: event.failedAt,
  };
  await publishEvent(kafkaClient!, TOPICS.ORDER_CANCELLED, cancelledEvent as unknown as Record<string, unknown>);
  logger.info('Order status → cancelled', { orderId: event.orderId });
}

export async function publishOrderCreated(
  event: Record<string, unknown>
): Promise<void> {
  if (!kafkaClient) throw new Error('Kafka client not initialized');
  await publishEvent(kafkaClient, TOPICS.ORDER_CREATED, event);
}

export async function disconnectKafka(): Promise<void> {
  consumerRunning = false;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  if (kafkaClient) {
    await kafkaClient.disconnect();
    kafkaClient = null;
  }
}