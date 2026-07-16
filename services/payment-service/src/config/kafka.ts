import { getKafkaClient, publishEvent, type KafkaClient } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { TOPICS, type OrderCreatedEvent } from '@cloudcommerce/common';
import { pool } from '../config/db';
import { PaymentStatus } from '@cloudcommerce/common';

let kafkaClient: KafkaClient | null = null;

export async function startKafkaConsumer(): Promise<void> {
  kafkaClient = getKafkaClient('payment-service-group');
  await kafkaClient.connect();

  const consumer = kafkaClient.consumer;

  await consumer.subscribe({
    topics: [TOPICS.ORDER_CREATED],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      const payload = JSON.parse(message.value.toString()) as OrderCreatedEvent;
      logger.info('Received order_created', { orderId: payload.orderId });
      await processPayment(payload);
    },
  });

  logger.info('Payment-service Kafka consumer started', {
    topics: TOPICS.ORDER_CREATED,
  });
}

async function processPayment(event: OrderCreatedEvent): Promise<void> {
  const { orderId, totalAmount } = event;

  // Simulated payment logic:
  // - amounts >= $1000 (100000 cents) fail to simulate risk scoring
  // - all other amounts succeed
  const succeeds = totalAmount < 100_000;
  const now = new Date().toISOString();

  if (succeeds) {
    const paymentId = `pay_${Date.now()}_${orderId.slice(0, 8)}`;
    await pool.query(
      `INSERT INTO payments (order_id, amount, status, payment_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [orderId, totalAmount, PaymentStatus.Success, paymentId, now]
    );

    await publishEvent(kafkaClient!, TOPICS.PAYMENT_SUCCESS, {
      orderId,
      paymentId,
      amount: totalAmount,
      paidAt: now,
    });
    logger.info('Payment succeeded', { orderId, paymentId, amount: totalAmount });
  } else {
    const reason = 'Amount exceeds risk threshold';
    await pool.query(
      `INSERT INTO payments (order_id, amount, status, failed_reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [orderId, totalAmount, PaymentStatus.Failed, reason, now]
    );

    await publishEvent(kafkaClient!, TOPICS.PAYMENT_FAILED, {
      orderId,
      reason,
      failedAt: now,
    });
    logger.info('Payment failed', { orderId, reason, amount: totalAmount });
  }
}

export async function publishPaymentSuccess(
  event: Record<string, unknown>
): Promise<void> {
  if (!kafkaClient) throw new Error('Kafka client not initialized');
  await publishEvent(kafkaClient, TOPICS.PAYMENT_SUCCESS, event);
}

export async function publishPaymentFailed(
  event: Record<string, unknown>
): Promise<void> {
  if (!kafkaClient) throw new Error('Kafka client not initialized');
  await publishEvent(kafkaClient, TOPICS.PAYMENT_FAILED, event);
}

export async function disconnectKafka(): Promise<void> {
  if (kafkaClient) {
    await kafkaClient.disconnect();
    kafkaClient = null;
  }
}

export { kafkaClient };