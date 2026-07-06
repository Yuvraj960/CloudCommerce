// Kafka client wrapper (singleton) for services that produce or consume events
// Consumer groups follow the pattern: <service-name>-group

import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { logger } from './logger';

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'localhost:9092';

interface KafkaClient {
  producer: Producer;
  consumer: Consumer;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

// Module-level singleton (avoids reconnecting on hot-reload in dev)
let _client: KafkaClient | null = null;

export function getKafkaClient(groupId: string): KafkaClient {
  if (_client) return _client;

  const kafka = new Kafka({
    clientId: process.env.SERVICE_NAME ?? 'cloudcommerce-service',
    brokers: [KAFKA_BROKER],
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 100,
      retries: 5,
    },
  });

  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId });

  _client = {
    producer,
    consumer,
    async connect() {
      await producer.connect();
      await consumer.connect();
      logger.info('Kafka connected', { broker: KAFKA_BROKER });
    },
    async disconnect() {
      await producer.disconnect();
      await consumer.disconnect();
      _client = null;
      logger.info('Kafka disconnected');
    },
  };

  return _client;
}

// Publish an event to a topic
export async function publishEvent(
  client: KafkaClient,
  topic: string,
  message: Record<string, unknown>
): Promise<void> {
  await client.producer.send({
    topic,
    messages: [{ value: JSON.stringify(message) }],
  });
  logger.info('Kafka event published', { topic, messageKeys: Object.keys(message) });
}

export type { KafkaClient };