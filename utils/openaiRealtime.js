import WebSocket from 'ws';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();
const redis = new Redis(process.env.REDIS_URL);

export async function streamToOpenAI(userText, callId, systemPrompt = null) {
  return new Promise(async (resolve) => {
    try {
      const context = await redis.get(`conversation:${callId}:context`);
      const conversationHistory = context ? JSON.parse(context) : [];

      const defaultSystemPrompt = 'You are a helpful voice assistant for phone calls.';
      const systemMessage = systemPrompt || defaultSystemPrompt;

      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`,
        {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        }
      );

      let aiText = '';

      ws.on('open', () => {
        const messages = [
          { role: 'system', content: systemMessage },
          ...conversationHistory,
          { role: 'user', content: userText },
        ];

        // Send the input text as a single string
        ws.send(JSON.stringify({ type: 'input_text', text: messages.map(m => m.content).join('\n') }));
      });

      ws.on('message', async (data) => {
        const msg = JSON.parse(data);

        if (msg.type === 'output_text') {
          aiText += msg.text;

          // Optional: you can stream partial text here to frontend or call
          // e.g., socket.emit('ai_stream', msg.text);
        }

        if (msg.type === 'response_complete') {
          // Save conversation context just like before
          conversationHistory.push({ role: 'user', content: userText });
          conversationHistory.push({ role: 'assistant', content: aiText });

          if (conversationHistory.length > 10) {
            conversationHistory.splice(0, conversationHistory.length - 10);
          }

          await redis.set(`conversation:${callId}:context`, JSON.stringify(conversationHistory));

          ws.close();
          resolve(aiText);
        }
      });

      ws.on('error', (err) => {
        console.error('WebSocket Error:', err);
        resolve('Sorry, I had trouble understanding that. Could you please repeat?');
      });
    } catch (err) {
      console.error('Error:', err);
      resolve('Sorry, I had trouble understanding that. Could you please repeat?');
    }
  });
}
