import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/', (req, res) => {
  res.send(`
    <h1>🎙️ Test Simple Server</h1>
    <p>Status: ✅ Running</p>
    <p>WebSocket Connections: ${wss.clients.size}</p>
    <p><strong>Goal:</strong> Send ONE greeting message</p>
  `);
});

wss.on('connection', (ws, req) => {
  console.log(`🔌 NEW CONNECTION: ${req.url}`);
  
  // Extract call ID
  let callId = 'unknown';
  const pathMatch = req.url.match(/^\/realtime\/([^\/\?]+)/);
  if (pathMatch) {
    callId = pathMatch[1];
  }
  console.log(`📞 Call ID: ${callId}`);
  
  // Send greeting IMMEDIATELY
  console.log(`🔔 SENDING GREETING NOW...`);
  
  try {
    // Generate simple beep
    const sampleRate = 8000;
    const duration = 0.5; // 0.5 seconds
    const frequency = 1000; // 1000 Hz
    const samples = Math.floor(sampleRate * duration);
    const audioData = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      audioData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.5;
    }
    
    const pcmData = new Int16Array(samples);
    for (let i = 0; i < samples; i++) {
      pcmData[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
    }
    
    const buffer = Buffer.from(pcmData.buffer);
    const base64Audio = buffer.toString('base64');
    
    const message = {
      event: 'media',
      sequenceNumber: '1',
      streamSid: callId,
      media: {
        track: 'outbound',
        chunk: '1',
        timestamp: Date.now().toString(),
        payload: base64Audio
      }
    };
    
    console.log(`📤 SENDING MESSAGE:`, JSON.stringify(message, null, 2));
    ws.send(JSON.stringify(message));
    console.log(`✅ GREETING SENT! Audio size: ${base64Audio.length} bytes`);
    
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
  }
  
  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received: ${message.event}`);
    } catch (err) {
      console.log(`📦 Raw data: ${data.length} bytes`);
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(`❌ Closed: ${code} - ${reason}`);
  });
  
  ws.on('error', (error) => {
    console.log(`❌ Error: ${error.message}`);
  });
});

server.listen(3000, () => {
  console.log(`✅ Test server running on port 3000`);
});

