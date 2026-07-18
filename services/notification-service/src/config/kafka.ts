import { getKafkaClient, type KafkaClient } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { TOPICS } from '@cloudcommerce/common';
import {
  type OrderCreatedEvent,
  type OrderCompletedEvent,
  type OrderCancelledEvent,
  type PaymentSuccessEvent,
  type PaymentFailedEvent,
} from '@cloudcommerce/common';

let kafkaClient: KafkaClient | null = null;
let consumerRunning = false;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

export async function startKafkaConsumer(): Promise<void> {
  kafkaClient = getKafkaClient('notification-service-group');
  await kafkaClient.connect();

  const consumer = kafkaClient.consumer;

  await consumer.subscribe({
    topics: [
      TOPICS.ORDER_CREATED,
      TOPICS.ORDER_COMPLETED,
      TOPICS.ORDER_CANCELLED,
      TOPICS.PAYMENT_SUCCESS,
      TOPICS.PAYMENT_FAILED,
    ],
    fromBeginning: false,
  });

  const startConsumer = async () => {
    while (!consumerRunning) {
      try {
        await consumer.run({
          eachMessage: async ({ topic, message }) => {
            if (!message.value) return;
            const payload = JSON.parse(message.value.toString());
            await handleNotification(topic, payload);
          },
        });
        consumerRunning = true;
        logger.info('Notification-service Kafka consumer running');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('Kafka consumer startup failed, retrying in 5s', { error: msg });
        if (!consumerRunning) {
          retryTimeout = setTimeout(startConsumer, 5000);
        }
      }
    }
  };

  startConsumer().catch(err => {
    logger.error('Kafka consumer background loop failed', { error: String(err) });
  });

  logger.info('Notification-service Kafka consumer starting', {
    topics: Object.values(TOPICS).join(', '),
  });
}

export async function handleNotification(
  topic: string,
  payload:
    | OrderCreatedEvent
    | OrderCompletedEvent
    | OrderCancelledEvent
    | PaymentSuccessEvent
    | PaymentFailedEvent
): Promise<void> {
  switch (topic) {
    case TOPICS.ORDER_CREATED:
      await sendOrderCreated(payload as OrderCreatedEvent);
      break;
    case TOPICS.ORDER_COMPLETED:
      await sendOrderCompleted(payload as OrderCompletedEvent);
      break;
    case TOPICS.ORDER_CANCELLED:
      await sendOrderCancelled(payload as OrderCancelledEvent);
      break;
    case TOPICS.PAYMENT_SUCCESS:
      await sendPaymentSuccess(payload as PaymentSuccessEvent);
      break;
    case TOPICS.PAYMENT_FAILED:
      await sendPaymentFailed(payload as PaymentFailedEvent);
      break;
    default:
      logger.warn('Unknown notification topic', { topic });
  }
}

// Simulated email senders (just log)
async function sendOrderCreated(event: OrderCreatedEvent): Promise<void> {
  logger.info('[EMAIL] Order confirmation sent', {
    to: `user-${event.userId}@example.com`,
    subject: `Order ${event.orderId} confirmed`,
    orderId: event.orderId,
    totalAmount: event.totalAmount,
  });
}

async function sendOrderCompleted(event: OrderCompletedEvent): Promise<void> {
  logger.info('[EMAIL] Order completion notification sent', {
    subject: `Order ${event.orderId} completed`,
    orderId: event.orderId,
    completedAt: event.completedAt,
  });
}

async function sendOrderCancelled(event: OrderCancelledEvent): Promise<void> {
  logger.info('[EMAIL] Order cancellation sent', {
    subject: `Order ${event.orderId} cancelled`,
    orderId: event.orderId,
    reason: event.reason,
    cancelledAt: event.cancelledAt,
  });
}

async function sendPaymentSuccess(event: PaymentSuccessEvent): Promise<void> {
  logger.info('[EMAIL] Payment receipt sent', {
    subject: `Payment ${event.paymentId} confirmed`,
    orderId: event.orderId,
    paymentId: event.paymentId,
    amount: event.amount,
  });
}

async function sendPaymentFailed(event: PaymentFailedEvent): Promise<void> {
  logger.info('[EMAIL] Payment failure notification sent', {
    subject: `Payment for order ${event.orderId} failed`,
    orderId: event.orderId,
    reason: event.reason,
    failedAt: event.failedAt,
  });
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

export function isKafkaConnected(): boolean {
  return kafkaClient !== null;
}