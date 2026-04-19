import express from 'express'; 
import http from 'http'; 
import { WebSocketServer } from 'ws'; 
import dotenv from 'dotenv'; 

dotenv.config(); 

const app = express(); 
const server = http.createServer(app); 
const wss = new WebSocketServer({ server }); 

// Simple status endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>🎙️ Simple AI Voice Server</h1>
    <p>Status: ✅ Running</p>
    <p>WebSocket Connections: ${wss.clients.size}</p>
    <p><strong>Simple Mode:</strong> Just responds with greeting when call connects</p>
  `);
});

wss.on('connection', (ws, req) => { 
  console.log(`🔌 Connected: ${req.url}`);
  
  // Extract call ID from URL
  let callId = 'unknown';
  try {
    console.log(`🔍 Extracting call ID from URL: ${req.url}`);
    const pathMatch = req.url.match(/^\/realtime\/([^\/\?]+)/);
    if (pathMatch) {
      callId = pathMatch[1];
      console.log(`📞 Call ID extracted: ${callId}`);
    } else {
      callId = `call_${Date.now()}`;
      console.log(`📞 Generated Call ID: ${callId}`);
    }
  } catch (err) {
    callId = `call_${Date.now()}_error`;
    console.log(`📞 Error Call ID: ${callId}`);
  }
  
  // Send initial greeting immediately when call connects
  console.log(`⏰ Setting up greeting timer for ${callId}...`);
  setTimeout(() => {
    console.log(`🔔 Timer triggered for ${callId}, checking WebSocket state...`);
    console.log(`🔍 WebSocket readyState: ${ws.readyState} (1=OPEN, 2=CLOSING, 3=CLOSED)`);
    
    if (ws.readyState === ws.OPEN) {
      try {
        console.log(`🔔 Attempting to send greeting to ${callId}...`);
        
        // Send Twilio-compatible media message with simple audio
        // Generate a simple beep sound as greeting
        const sampleRate = 8000;
        const duration = 1.0; // 1 second
        const frequency = 800; // 800 Hz beep
        const samples = Math.floor(sampleRate * duration);
        const audioData = new Float32Array(samples);
        
        // Generate sine wave
        for (let i = 0; i < samples; i++) {
          audioData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
        }
        
        // Convert to 16-bit PCM
        const pcmData = new Int16Array(samples);
        for (let i = 0; i < samples; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
        }
        
        // Convert to base64
        const buffer = Buffer.from(pcmData.buffer);
        const base64Audio = buffer.toString('base64');
        
        const greetingMessage = {
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
        
        console.log(`📤 Sending greeting message:`, JSON.stringify(greetingMessage, null, 2));
        ws.send(JSON.stringify(greetingMessage));
        console.log(`✅ Successfully sent greeting audio to ${callId} (${base64Audio.length} bytes)`);
        
      } catch (error) {
        console.log(`❌ Error sending greeting: ${error.message}`);
        console.log(`❌ Error stack: ${error.stack}`);
      }
    } else {
      console.log(`❌ WebSocket not open (state: ${ws.readyState}), cannot send greeting`);
    }
  }, 2000); // Send greeting after 2 seconds

  // Handle incoming messages (but don't process audio)
  ws.on('message', (data) => { 
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received message: ${message.event}`);
      
      // Just acknowledge we received something
      if (message.event === 'media') {
        console.log(`🎵 Audio data received (${message.media?.payload?.length || 0} bytes)`);
      }
    } catch (err) { 
      console.log(`📦 Received raw data: ${data.length} bytes`);
    } 
  });

  // Send periodic pings to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.ping();
        console.log(`🏓 Ping sent to ${callId}`);
      } catch (error) {
        console.log(`❌ Ping failed: ${error.message}`);
        clearInterval(pingInterval);
      }
    } else {
      clearInterval(pingInterval);
    }
  }, 10000); // Ping every 10 seconds

  ws.on('close', (code, reason) => {
    console.log(`❌ Closed connection for ${callId} - Code: ${code}, Reason: ${reason}`);
    clearInterval(pingInterval);
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket error for ${callId}: ${error.message}`);
    clearInterval(pingInterval);
  });
}); 

server.listen(process.env.PORT || 3000, () => { 
  console.log(`✅ Simple AI Server running on port ${process.env.PORT || 3000}`); 
});
