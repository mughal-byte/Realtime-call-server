import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { prepareMP3ForTwilio } from './utils/mp3Converter.js';

dotenv.config();

const app = express();

// HTTPS configuration - only for production
let server;
let wss;

const isProduction = process.env.NODE_ENV === 'production' || process.env.USE_HTTPS === 'true';

if (isProduction) {
  try {
    // Try to load SSL certificates for production
    const privateKey = fs.readFileSync('/etc/letsencrypt/live/buildors.com/privkey.pem', 'utf8');
    const certificate = fs.readFileSync('/etc/letsencrypt/live/buildors.com/cert.pem', 'utf8');
    const ca = fs.readFileSync('/etc/letsencrypt/live/buildors.com/chain.pem', 'utf8');
    
    const credentials = {
      key: privateKey,
      cert: certificate,
      ca: ca
    };
    
    server = https.createServer(credentials, app);
    console.log('🔒 HTTPS server created with SSL certificates (Production mode)');
  } catch (error) {
    console.log('⚠️ SSL certificates not found, falling back to HTTP');
    console.log('SSL Error:', error.message);
    server = http.createServer(app);
  }
} else {
  // Development mode - use HTTP
  server = http.createServer(app);
  console.log('🔓 HTTP server created (Development mode)');
}

wss = new WebSocketServer({ server });

// Simple status endpoint
app.get('/', (req, res) => {
  const protocol = isProduction ? 'wss' : 'ws';
  const host = isProduction ? 'buildors.com' : 'localhost';
  const port = process.env.PORT || 3000;
  
  res.send(`
    <h1>🎙️ Simple AI Voice Server</h1>
    <p>Status: ✅ Running</p>
    <p>Mode: ${isProduction ? '🔒 Production (HTTPS)' : '🔓 Development (HTTP)'}</p>
    <p>WebSocket Connections: ${wss.clients.size}</p>
    <p><strong>Task:</strong> Send test.mp3 when call received</p>
    <p><strong>WebSocket URL:</strong> ${protocol}://${host}:${port}/realtime/YOUR_CALL_SID</p>
    <p><strong>Environment:</strong> ${isProduction ? 'Production' : 'Development'}</p>
  `);
});

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    status: 'Server running',
    timestamp: new Date().toISOString(),
    websocketConnections: wss.clients.size,
    testFile: fs.existsSync('test.mp3') ? 'Found' : 'Not found'
  });
});

wss.on('connection', (ws, req) => {
  console.log(`🔌 NEW CONNECTION: ${req.url}`);
  
  // Extract call ID from URL
  let callId = 'unknown';
  let streamSid = null; // Will be set when we receive Twilio's start message
  
  try {
    const pathMatch = req.url.match(/^\/realtime\/([^\/\?]+)/);
    if (pathMatch) {
      callId = pathMatch[1];
      console.log(`📞 Call ID: ${callId}`);
    } else {
      callId = `call_${Date.now()}`;
      console.log(`📞 Generated Call ID: ${callId}`);
    }
  } catch (err) {
    callId = `call_${Date.now()}_error`;
    console.log(`📞 Error Call ID: ${callId}`);
  }

  // Function to send audio (will be called when Stream SID is available)
  async function sendAudio() {
    if (!streamSid) {
      console.log(`⏳ Waiting for Stream SID...`);
      return;
    }
    
    console.log(`🔔 Sending test.mp3 to ${callId} (Stream: ${streamSid})...`);
    
    if (ws.readyState === ws.OPEN) {
      try {
        // Try MP3 conversion first, then fallback to voice files
        console.log(`🎵 Trying MP3 conversion first...`);
        
        let audioBuffer = null;
        
        // Try to convert MP3 to Twilio format first
        if (fs.existsSync('test.mp3')) {
          try {
            audioBuffer = await prepareMP3ForTwilio('test.mp3');
            if (audioBuffer) {
              console.log(`✅ Successfully converted MP3 to Twilio mulaw format`);
            }
          } catch (error) {
            console.log(`❌ MP3 conversion failed: ${error.message}`);
            audioBuffer = null;
          }
        }
        
        // If MP3 conversion failed, try voice files
        if (!audioBuffer) {
          console.log(`🔄 MP3 conversion failed, trying voice files...`);
          
          if (fs.existsSync('voice_melody.ulaw')) {
            audioBuffer = fs.readFileSync('voice_melody.ulaw');
            console.log(`✅ Using voice_melody.ulaw (melody: A4 + C#5 notes)`);
          } else if (fs.existsSync('voice_high.ulaw')) {
            audioBuffer = fs.readFileSync('voice_high.ulaw');
            console.log(`✅ Using voice_high.ulaw (1200Hz high tone)`);
          } else if (fs.existsSync('voice_low.ulaw')) {
            audioBuffer = fs.readFileSync('voice_low.ulaw');
            console.log(`✅ Using voice_low.ulaw (600Hz low tone)`);
          } else if (fs.existsSync('greeting_twilio.ulaw')) {
            audioBuffer = fs.readFileSync('greeting_twilio.ulaw');
            console.log(`✅ Using greeting_twilio.ulaw (1000Hz tone)`);
          } else if (fs.existsSync('test_twilio.ulaw')) {
            audioBuffer = fs.readFileSync('test_twilio.ulaw');
            console.log(`✅ Using test_twilio.ulaw (800Hz tone)`);
          }
        }
        
        // Final fallback to generated beep
        if (!audioBuffer) {
          console.log(`🔄 No audio files found, using clean beep fallback`);
          
          const sampleRate = 8000;
          const duration = 2.0; // 2 seconds
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
          
          audioBuffer = Buffer.from(pcmData.buffer);
        }
        
        // Send the audio
        const base64Audio = audioBuffer.toString('base64');
        
        const mediaMessage = {
          event: 'media',
          sequenceNumber: '1',
          streamSid: streamSid, // Use the correct Stream SID
          media: {
            track: 'outbound',
            chunk: '1',
            timestamp: Date.now().toString(),
            payload: base64Audio
          }
        };
        
        ws.send(JSON.stringify(mediaMessage));
        console.log(`✅ Sent clean beep audio to ${callId} (${base64Audio.length} bytes)`);
        
      } catch (error) {
        console.log(`❌ Error sending audio: ${error.message}`);
      }
    } else {
      console.log(`❌ WebSocket not open (state: ${ws.readyState}), cannot send audio`);
    }
  }

  // Handle incoming messages (capture Stream SID from Twilio)
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received: ${message.event}`);
      
      // Capture Stream SID from Twilio's start message
      if (message.event === 'start' && message.streamSid) {
        streamSid = message.streamSid;
        console.log(`🎯 Stream SID captured: ${streamSid}`);
        console.log(`📞 Call SID: ${callId}`);
        
        // Send audio now that we have the Stream SID
        setTimeout(async () => {
          await sendAudio();
        }, 1000); // Wait 1 second then send audio
      }
      
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
  const protocol = server instanceof https.Server ? 'HTTPS' : 'HTTP';
  const host = isProduction ? 'buildors.com' : 'localhost';
  console.log(`✅ Simple AI Voice Server running on ${protocol} port ${process.env.PORT || 3000}`);
  console.log(`🌐 WebSocket URL: ${protocol.toLowerCase()}s://${host}:${process.env.PORT || 3000}/realtime/YOUR_CALL_SID`);
  console.log(`🔧 Environment: ${isProduction ? 'Production' : 'Development'}`);
  console.log(`🎯 Task: Send test.mp3 when call received`);
  console.log(`📁 Test file: ${fs.existsSync('test.mp3') ? 'Found' : 'Not found'}`);
});
