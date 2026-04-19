import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Rate limiting variables
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second

export async function streamToElevenLabs(text, onAudioChunk) {
  try {
    if (process.env.SKIP_ELEVENLABS === 'true') {
      console.log('🚫 ElevenLabs disabled via SKIP_ELEVENLABS=true');
      return null;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms before ElevenLabs request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastRequestTime = Date.now();

    // Connect to ElevenLabs Realtime API via WebSocket
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/realtime?voice=${process.env.ELEVENLABS_VOICE_ID}`,
        {
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        }
      );

      const audioBuffers = [];

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'input_text',
          text,
          model: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.8 }
        }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data);

        if (msg.type === 'audio_chunk') {
          const chunk = Buffer.from(msg.audio, 'base64');
          audioBuffers.push(chunk);
          if (onAudioChunk) onAudioChunk(chunk); // optional real-time playback
        }

        if (msg.type === 'response_complete') {
          ws.close();
          resolve(Buffer.concat(audioBuffers)); // full audio at the end
        }
      });

      ws.on('error', (err) => {
        console.error('ElevenLabs WS Error:', err);
        reject(null);
      });
    });
  } catch (err) {
    console.error('ElevenLabs Error:', err.message);
    return null;
  }
}
