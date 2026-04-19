import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log('🚀 Starting debug server...');

app.get('/', (req, res) => {
  res.send(`
    <h1>🔍 Debug Server</h1>
    <p>Status: ✅ Running</p>
    <p>WebSocket Connections: ${wss.clients.size}</p>
  `);
});

wss.on('connection', (ws, req) => {
  console.log('🎉 CONNECTION EVENT TRIGGERED!');
  console.log('🔌 URL:', req.url);
  console.log('🔌 Headers:', req.headers);
  
  // Send greeting immediately
  console.log('🔔 SENDING GREETING...');
  
  const message = {
    event: 'media',
    sequenceNumber: '1',
    streamSid: 'test123',
    media: {
      track: 'outbound',
      chunk: '1',
      timestamp: Date.now().toString(),
      payload: 'dGVzdA==' // base64 for "test"
    }
  };
  
  try {
    ws.send(JSON.stringify(message));
    console.log('✅ GREETING SENT SUCCESSFULLY!');
  } catch (error) {
    console.log('❌ ERROR SENDING:', error.message);
  }
  
  ws.on('message', (data) => {
    console.log('📨 MESSAGE RECEIVED:', data.toString().substring(0, 100));
  });
  
  ws.on('close', () => {
    console.log('❌ CONNECTION CLOSED');
  });
  
  ws.on('error', (error) => {
    console.log('❌ WEBSOCKET ERROR:', error.message);
  });
});

server.listen(3000, () => {
  console.log('✅ Debug server running on port 3000');
  console.log('🔍 Waiting for connections...');
});
