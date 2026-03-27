import Redis from 'ioredis';
import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

const connection = { connection: redis };

// One queue per concern — each independently scalable
export const transcriptQueue = new Queue('transcript-processing', connection);
export const notesQueue = new Queue('llm-notes', connection);
export const screenshotQueue = new Queue('screenshot-processing', connection);
export const deletionQueue = new Queue('data-deletion', connection);

export const allQueues = [transcriptQueue, notesQueue, screenshotQueue, deletionQueue];
