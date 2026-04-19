import express from 'express'; 
import http from 'http'; 
import https from 'https';
import fs from 'fs';
import { WebSocketServer } from 'ws'; 
import dotenv from 'dotenv'; 
import Redis from 'ioredis';
import { transcribeAudio } from './utils/whisper.js';
import { streamToOpenAI } from './utils/openaiRealtime.js';
import { streamToElevenLabs } from './utils/elevenlabs.js';
import { bufferToAudio } from './utils/audioHelpers.js';
import { convertToMulaw } from './utils/audioConverter.js';
import { generateTestAudio, generateMulawAudio } from './utils/simpleAudioGenerator.js';
import { cacheConversation } from './services/conversationCache.js';

// Create log file
const logFile = `logs/call-logs-${new Date().toISOString().split('T')[0]}.log`;
fs.mkdirSync('logs', { recursive: true });

// Enhanced logging function
const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}${data ? ' | Data: ' + JSON.stringify(data) : ''}`;
  
  // Console output
  console.log(logMessage);
  
  // File output
  fs.appendFileSync(logFile, logMessage + '\n');
}; 
 
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
const redis = new Redis(process.env.REDIS_URL);

// Add debugging endpoint
app.get('/debug', (req, res) => {
  res.json({
    status: 'Server running',
    timestamp: new Date().toISOString(),
    websocketConnections: wss.clients.size,
    logFile: logFile,
    environment: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set' : 'Missing',
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ? 'Set' : 'Missing',
      REDIS_URL: process.env.REDIS_URL ? 'Set' : 'Missing'
    }
  });
});

// Status endpoint to monitor conversation state
app.get('/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    websocketConnections: wss.clients.size,
    message: 'AI Voice Assistant Server - Complete Response Logic Active',
    configuration: {
      skipElevenLabs: process.env.SKIP_ELEVENLABS === 'true',
      sendTextResponse: process.env.SEND_TEXT_RESPONSE === 'true',
      elevenLabsEnabled: process.env.SKIP_ELEVENLABS !== 'true'
    },
    features: [
      'Complete Response Logic',
      'Request Deduplication', 
      'ElevenLabs Rate Limiting',
      'WebSocket Stability',
      'Audio Format Conversion',
      'Text Response Mode',
      'ElevenLabs Bypass'
    ]
  });
});

// Add logs endpoint
app.get('/logs', (req, res) => {
  try {
    const logs = fs.readFileSync(logFile, 'utf8');
    res.send(`
      <h1>📋 Call Logs</h1>
      <pre style="background: #f5f5f5; padding: 20px; border-radius: 5px; overflow-x: auto;">${logs}</pre>
      <p><a href="/debug">Back to Debug</a></p>
    `);
  } catch (err) {
    res.send(`<h1>📋 Call Logs</h1><p>No logs found yet. Make a call to generate logs.</p><p><a href="/debug">Back to Debug</a></p>`);
  }
});

app.get('/', (req, res) => {
  const protocol = isProduction ? 'wss' : 'ws';
  const host = isProduction ? 'buildors.com' : 'localhost';
  const port = process.env.PORT || 3000;
  
  res.send(`
    <h1>🎙️ AI Realtime Calls Server</h1>
    <p>Status: ✅ Running</p>
    <p>Mode: ${isProduction ? '🔒 Production (HTTPS)' : '🔓 Development (HTTP)'}</p>
    <p>WebSocket Connections: ${wss.clients.size}</p>
    <p><a href="/debug">Debug Info</a></p>
    <p><a href="/logs">View Logs</a></p>
    <p><strong>WebSocket URL:</strong> ${protocol}://${host}:${port}/realtime/YOUR_CALL_SID</p>
    <p><strong>Environment:</strong> ${isProduction ? 'Production' : 'Development'}</p>
  `);
});

// Add explicit route for /realtime (for Twilio)
app.get('/realtime', (req, res) => {
  res.send(`
    <h1>🎙️ Twilio Realtime Endpoint</h1>
    <p>This endpoint is for Twilio WebSocket connections</p>
    <p><strong>New URL Pattern:</strong> ws://localhost:${process.env.PORT || 3000}/realtime/YOUR_CALL_SID</p>
    <p><strong>Old Pattern:</strong> ws://localhost:${process.env.PORT || 3000}/realtime?call_sid=YOUR_CALL_SID</p>
    <p><a href="/debug">Debug Info</a></p>
  `);
});

// Add route for /realtime/{callSid} pattern
app.get('/realtime/:callSid', (req, res) => {
  res.send(`
    <h1>🎙️ Twilio Realtime Endpoint</h1>
    <p>Call SID: <strong>${req.params.callSid}</strong></p>
    <p>This endpoint is for Twilio WebSocket connections</p>
    <p>WebSocket URL: ws://localhost:${process.env.PORT || 3000}/realtime/${req.params.callSid}</p>
    <p><a href="/debug">Debug Info</a></p>
  `);
}); 
 
wss.on('connection', (ws, req) => { 
  console.log(`🔌 Connected: ${req.url}`);
  
  // Handle different URL patterns
  let callId = 'unknown';
  try {
    console.log(`🔍 Processing URL: ${req.url}`);
    
    // First try to extract from URL path: /realtime/{callSid}
    const pathMatch = req.url.match(/^\/realtime\/([^\/\?]+)/);
    console.log(`🔍 Path match result:`, pathMatch);
    
    if (pathMatch) {
      callId = pathMatch[1];
      console.log(`📞 Extracted Call ID from path: ${callId}`);
    } else {
      // Fallback to query parameters
      const url = new URL(req.url, 'http://localhost');
      callId = url.searchParams.get('call_sid') || 
               url.searchParams.get('CallSid') || 
               url.searchParams.get('callSid') ||
               'unknown';
      
      // Also try to extract from the path if it's in the format /realtime?call_sid=...
      if (callId === 'unknown' && req.url.includes('call_sid=')) {
        const match = req.url.match(/call_sid=([^&]+)/);
        if (match) {
          callId = match[1];
        }
      }
      
      // If still unknown, try to extract from Twilio headers or generate a unique ID
      if (callId === 'unknown') {
        // Try to extract from Twilio signature or generate unique ID
        const twilioSignature = req.headers['x-twilio-signature'];
        if (twilioSignature) {
          // Generate a unique call ID based on timestamp and signature
          callId = `call_${Date.now()}_${twilioSignature.substring(0, 8)}`;
        } else {
          callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        }
      }
    }
  } catch (err) {
    callId = `call_${Date.now()}_error`;
  }
  

  const sub = new Redis(process.env.REDIS_URL); 
  sub.subscribe(`call:${callId}:messages`); 

  // Audio buffering for Whisper
  let audioBuffer = [];
  let bufferDuration = 0;
  const minDuration = 2.0; // Minimum 2 seconds before processing (faster response)
  const maxDuration = 5.0; // Maximum 5 seconds before forcing processing
  let silenceTimer = null;
  const SILENCE_TIMEOUT = 1000; // Wait 1 second of silence before processing
  
  // Function to process audio buffer
  async function processAudioBuffer(combinedBuffer, ws, callId) {
    // Check if we're already processing or if AI is responding
    const currentTime = Date.now();
    if (isProcessing || isAiResponding) {
      return;
    }
    
    // Check for timeout on AI response
    if (isAiResponding && (currentTime - responseStartTime) > MAX_RESPONSE_TIME) {
      isAiResponding = false;
      currentResponse = '';
    }
    
    // 1⃣ Transcribe via Whisper 
    const text = await transcribeAudio(combinedBuffer); 
    if (!text) {
      return;
    } else {
      console.log(`📝 Received: "${text}"`);

      // Skip very short or meaningless text
      const normalizedText = text.toLowerCase().trim();
      if (normalizedText.length < MIN_TEXT_LENGTH) {
        console.log(`🚫 Text too short (${normalizedText.length} chars), skipping`);
        return;
      }

      // Skip common meaningless words (less aggressive filtering)
      const skipWords = ['bye', 'uh', 'um', 'ah'];
      if (skipWords.includes(normalizedText)) {
        console.log(`🚫 Skipping common word: "${normalizedText}"`);
        return;
      }

      // Check for duplicate processing
      if (normalizedText === lastProcessedText && 
          (currentTime - lastProcessedTime) < MIN_PROCESSING_INTERVAL) {
        console.log(`🚫 Duplicate text detected, skipping processing (${normalizedText})`);
        return;
      }

      // Set processing flags
      isProcessing = true;
      isAiResponding = true;
      responseStartTime = currentTime;
      lastProcessedText = normalizedText;
      lastProcessedTime = currentTime;
      
      console.log(`🔄 Processing text: "${text}" (${normalizedText})`);

      try {
        await cacheConversation(callId, 'user', text); 

        // 2⃣ Send to GPT-4o Realtime 
        const aiText = await streamToOpenAI(text, callId); 
        console.log(`🤖 AI Response: "${aiText}"`);
        
        // Store the complete response
        currentResponse = aiText;
        await cacheConversation(callId, 'assistant', aiText); 

        // Check if we should send text response instead of audio
        if (process.env.SEND_TEXT_RESPONSE === 'true') {
          // Generate fallback audio instead of text (Twilio Media Streams doesn't support text events)
          if (ws.readyState === ws.OPEN) {
            try {
              // Generate simple beep audio as response
              const audioBuffer = generateMulawAudio(aiText, 8000);
              const base64Audio = audioBuffer.toString('base64');
              
              // Use the callId as streamSid (Twilio expects this)
              const mediaMessage = {
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
              
              ws.send(JSON.stringify(mediaMessage));
              console.log(`📤 Sent audio response to Twilio: "${aiText}"`);
              console.log(`📤 Media message:`, JSON.stringify(mediaMessage, null, 2));
            } catch (sendError) {
              console.log(`❌ Error sending audio: ${sendError.message}`);
            }
          } else {
            console.log(`❌ WebSocket not open (state: ${ws.readyState}), cannot send audio`);
            if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) {
              console.log(`🔌 WebSocket closed, call may have ended`);
            }
          }
          
          // Skip ElevenLabs audio generation
          return;
        }

        // Continue with ElevenLabs audio generation if not in text mode
      } finally {
        // Always reset processing flags when complete
        isProcessing = false;
        isAiResponding = false;
        currentResponse = '';
      }
    }
  }
  
  // Complete response logic - prevent processing while AI is responding
  let isAiResponding = false;
  let currentResponse = '';
  let responseStartTime = 0;
  const MAX_RESPONSE_TIME = 10000; // 10 seconds max for AI response
  
  // Request deduplication and throttling
  let lastProcessedText = '';
  let lastProcessedTime = 0;
  const MIN_PROCESSING_INTERVAL = 5000; // 5 seconds between processing same text (faster)
  const MIN_TEXT_LENGTH = 3; // Minimum text length to process
  let isProcessing = false;

  ws.on('message', async (data) => { 
    try { 
      // Check if it's a Twilio JSON message or raw audio data
      let audioData = null;
      try {
        const message = JSON.parse(data.toString());
        
        if (message.event === 'media' && message.media && message.media.payload) {
          // Extract audio from Twilio media message
          audioData = Buffer.from(message.media.payload, 'base64');
        } else {
          return; // Skip non-media messages
        }
      } catch (parseError) {
        // If JSON parsing fails, treat as raw audio data
        audioData = data;
      }
      
      if (!audioData) {
        return;
      }
      
      // Add raw audio data to buffer (don't convert to WAV yet)
      audioBuffer.push(audioData);
      bufferDuration += 0.1; // Estimate 0.1 seconds per chunk
      
      console.log(`📊 Buffer: ${audioBuffer.length} chunks, ~${bufferDuration.toFixed(1)}s`);

      // Clear any existing silence timer
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }

      // Set a timer to process after silence
      silenceTimer = setTimeout(async () => {
        // Process when we have enough audio and silence detected
        if (audioBuffer.length > 0 && bufferDuration >= minDuration) {
          console.log(`🎼 Processing combined audio: ${Buffer.concat(audioBuffer).length} bytes (~${bufferDuration.toFixed(1)}s)`);
          // Convert the entire buffer to WAV at once
          const combinedBuffer = Buffer.concat(audioBuffer);
          const wavBuffer = await bufferToAudio(combinedBuffer);
          await processAudioBuffer(wavBuffer, ws, callId);
          audioBuffer = [];
          bufferDuration = 0;
        }
      }, SILENCE_TIMEOUT);

      // Force processing if we hit max duration (emergency timeout)
      if (bufferDuration >= maxDuration) {
        if (audioBuffer.length > 0) {
          // Clear silence timer since we're forcing processing
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
          
          // Convert the entire buffer to WAV at once
          const combinedBuffer = Buffer.concat(audioBuffer);
          const wavBuffer = await bufferToAudio(combinedBuffer);
          await processAudioBuffer(wavBuffer, ws, callId);
          audioBuffer = [];
          bufferDuration = 0;
        }
      }

    } catch (err) { 
      console.error('❌ Error processing message:', err.message);
      console.error('Stack trace:', err.stack);
    } 
  });
 
  // Don't send start message - Twilio sends that to us
  // We only need to respond to Twilio's messages
  console.log(`✅ WebSocket connected for call ${callId}, waiting for Twilio messages...`);
    
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
  
  // Store ping interval for cleanup
  ws.pingInterval = pingInterval;

  ws.on('close', (code, reason) => {
    sub.disconnect();
    console.log(`❌ Closed connection for ${callId} - Code: ${code}, Reason: ${reason}`);
    if (ws.pingInterval) {
      clearInterval(ws.pingInterval);
    }
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket error for ${callId}: ${error.message}`);
    if (ws.pingInterval) {
      clearInterval(ws.pingInterval);
    }
  });
}); 
 
server.listen(process.env.PORT, () => { 
  const protocol = server instanceof https.Server ? 'HTTPS' : 'HTTP';
  const host = isProduction ? 'buildors.com' : 'localhost';
  console.log(`✅ Realtime AI Server running on ${protocol} port ${process.env.PORT}`);
  console.log(`🌐 WebSocket URL: ${protocol.toLowerCase()}s://${host}:${process.env.PORT}/realtime/YOUR_CALL_SID`);
  console.log(`🔧 Environment: ${isProduction ? 'Production' : 'Development'}`);
}); 