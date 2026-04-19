import Redis from "ioredis";
import dotenv from 'dotenv';

dotenv.config();
const redis = new Redis(process.env.REDIS_URL);

export async function cacheConversation(callId, role, message) {
  const key = `conversation:${callId}`;
  const entry = JSON.stringify({ role, message, time: new Date().toISOString() });
  await redis.rpush(key, entry);
  console.log(`💬 Cached conversation for ${callId}: [${role}] ${message}`);
}

