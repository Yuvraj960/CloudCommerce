// Logger — structured JSON logging via Winston

import winston from 'winston';

const { combine, timestamp, json, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  return JSON.stringify({ timestamp, level, message, ...meta });
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    process.env.NODE_ENV === 'development' ? colorize() : json()
  ),
  defaultMeta: { service: process.env.SERVICE_NAME ?? 'unknown' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development'
        ? combine(colorize(), timestamp(), printf(({ level, message, timestamp, ...meta }) =>
            `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`
          ))
        : combine(timestamp(), logFormat),
    }),
  ],
});

export type Logger = typeof logger;