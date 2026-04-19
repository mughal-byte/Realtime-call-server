import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { prepareMP3ForTwilio } from './utils/mp3Converter.js';
import { streamToElevenLabs } from './utils/elevenlabs.js';
import { transcribeAudio } from './utils/whisper.js';
import { streamToOpenAI } from './utils/openaiRealtime.js';

dotenv.config();

const app = express();

// Greeting message
const GREETING_TEXT = "Hello, I am Adnan from Buildors. We are a leading software development company specializing in web applications, mobile apps, and AI solutions. How may I help you today? Are you looking to book a consultation or learn more about our services?";

// Company information and booking system prompt
const SYSTEM_PROMPT = `You are Adnan, a helpful representative from Buildors, a leading software development company. 

IMPORTANT: Always respond in English only. Never use Spanish, French, or any other language.

Company Information:
- Buildors specializes in web applications, mobile apps, and AI solutions
- We offer custom software development, consulting, and digital transformation services
- Our team has expertise in modern technologies like React, Node.js, Python, AI/ML
- We provide end-to-end solutions from concept to deployment

Booking System:
- We offer free consultations to discuss project requirements
- Available time slots: Monday-Friday, 9 AM - 6 PM
- Consultation duration: 30-60 minutes
- Can be conducted via video call or in-person

Your role:
- Be friendly, professional, and helpful
- Provide information about our services
- Help book consultations
- Ask relevant questions about their project needs
- Keep responses concise (under 100 words) for phone conversations
- If they want to book, collect: name, contact info, preferred time, project type
- ALWAYS respond in English only

Always end with asking how else you can help them.`;

// Audio processing settings - OPTIMIZED FOR SPEED
const AUDIO_BUFFER = {
  minDuration: 2.0, // Minimum 2 seconds of audio (faster)
  maxDuration: 6.0, // Maximum 6 seconds of audio (faster)
  silenceTimeout: 1000, // 1 second of silence to trigger processing (faster)
  silenceThreshold: 0.02, // Higher threshold for faster detection
};

// Conversation state
let conversationHistory = [];
let isProcessing = false;
let lastProcessTime = 0;
const MIN_PROCESSING_INTERVAL = 1000; // 1 second between processing (faster)

// Function to detect silence in audio buffer
function detectSilence(audioBuffer, threshold = 0.01) {
  try {
    // Convert buffer to 16-bit PCM samples
    const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
    
    // Calculate RMS (Root Mean Square) for volume detection
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length) / 32768; // Normalize to 0-1
    
    return rms < threshold;
  } catch (error) {
    console.log(`❌ Error detecting silence: ${error.message}`);
    return false;
  }
}

// Function to process incoming audio and generate AI response
async function processIncomingAudio(audioBuffer, callId, ws, streamSid) {
  try {
    // Check if we should process (rate limiting)
    const now = Date.now();
    if (now - lastProcessTime < MIN_PROCESSING_INTERVAL) {
      console.log(`⏳ Rate limiting: skipping audio processing`);
      return;
    }
    
    if (isProcessing) {
      console.log(`⏳ Already processing, skipping`);
      return;
    }
    
    isProcessing = true;
    lastProcessTime = now;
    
    console.log(`🎵 Processing audio: ${audioBuffer.length} bytes`);
    
    // Check for silence before processing
    const isSilent = detectSilence(audioBuffer, AUDIO_BUFFER.silenceThreshold);
    console.log(`🔇 Silence detected: ${isSilent}`);
    
    // Convert audio buffer to WAV for Whisper
    const wavBuffer = await convertToWAV(audioBuffer);
    
    // Transcribe audio using Whisper
    console.log(`🎤 Transcribing audio with Whisper...`);
    const transcription = await transcribeAudio(wavBuffer);
    
    if (!transcription || transcription.trim().length < 3) {
      console.log(`❌ No valid transcription received (too short or empty)`);
      isProcessing = false;
      return;
    }
    
    console.log(`📝 CALLER SAID: "${transcription}"`);
    console.log(`📤 SENDING TO OPENAI: "${transcription}"`);
    console.log(`🎯 SYSTEM PROMPT: ${SYSTEM_PROMPT.substring(0, 100)}...`);
    
    // Add to conversation history
    conversationHistory.push({ role: 'user', content: transcription });
    
    // Generate AI response using OpenAI
    console.log(`🤖 HITTING OPENAI API for response...`);
    const aiResponse = await streamToOpenAI(transcription, callId, SYSTEM_PROMPT);
    
    console.log(`📥 RECEIVED FROM OPENAI: "${aiResponse}"`);
    
    if (!aiResponse || aiResponse.trim().length < 3) {
      console.log(`❌ No valid AI response received from OpenAI`);
      isProcessing = false;
      return;
    }
    
    console.log(`🤖 AI RESPONSE: "${aiResponse}"`);
    
    // Add AI response to conversation history
    conversationHistory.push({ role: 'assistant', content: aiResponse });
    
    // Generate audio using ElevenLabs
    console.log(`🎤 HITTING ELEVENLABS API for voice...`);
    console.log(`📤 SENDING TO ELEVENLABS: "${aiResponse}"`);
    const responseAudioBuffer = await streamToElevenLabs(aiResponse);
    
    console.log(`📥 RECEIVED FROM ELEVENLABS: ${responseAudioBuffer ? responseAudioBuffer.length + ' bytes' : 'null'}`);
    
    if (responseAudioBuffer) {
      // Convert to Twilio format and send
      console.log(`📤 SENDING RESPONSE TO CALLER...`);
      await sendAudioResponse(responseAudioBuffer, callId, ws, streamSid);
    } else {
      console.log(`❌ Failed to generate audio response from ElevenLabs`);
    }
    
    isProcessing = false;
    
  } catch (error) {
    console.log(`❌ Error processing audio: ${error.message}`);
    isProcessing = false;
  }
}

// Function to convert raw audio to WAV format for Whisper
async function convertToWAV(audioBuffer) {
  try {
    // Create a simple WAV header for 8kHz mono 16-bit PCM
    const sampleRate = 8000;
    const channels = 1;
    const bitsPerSample = 16;
    const dataSize = audioBuffer.length;
    const fileSize = 44 + dataSize - 8;
    
    const wavHeader = Buffer.alloc(44);
    
    // RIFF header
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(fileSize, 4);
    wavHeader.write('WAVE', 8);
    
    // fmt chunk
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); // fmt chunk size
    wavHeader.writeUInt16LE(1, 20); // PCM format
    wavHeader.writeUInt16LE(channels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28); // byte rate
    wavHeader.writeUInt16LE(channels * bitsPerSample / 8, 32); // block align
    wavHeader.writeUInt16LE(bitsPerSample, 34);
    
    // data chunk
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(dataSize, 40);
    
    return Buffer.concat([wavHeader, audioBuffer]);
  } catch (error) {
    console.log(`❌ Error converting to WAV: ${error.message}`);
    return null;
  }
}

// Function to send AI response audio - OPTIMIZED FOR SPEED
async function sendAudioResponse(audioBuffer, callId, ws, streamSid) {
  try {
    // Save as temporary MP3 file
    const tempMp3File = `response_${callId}_${Date.now()}.mp3`;
    fs.writeFileSync(tempMp3File, audioBuffer);
    
    // Convert to Twilio format
    const twilioAudio = await prepareMP3ForTwilio(tempMp3File);
    
    // Clean up temp file immediately
    if (fs.existsSync(tempMp3File)) {
      fs.unlinkSync(tempMp3File);
    }
    
    if (twilioAudio && ws && ws.readyState === ws.OPEN && streamSid) {
      // Send audio response to Twilio
      const base64Audio = twilioAudio.toString('base64');
      
      const mediaMessage = {
        event: 'media',
        sequenceNumber: '1',
        streamSid: streamSid,
        media: {
          track: 'outbound',
          chunk: '1',
          timestamp: Date.now().toString(),
          payload: base64Audio
        }
      };
      
      ws.send(JSON.stringify(mediaMessage));
      console.log(`✅ Sent AI response audio to ${callId} (${base64Audio.length} bytes) - SPEED OPTIMIZED`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.log(`❌ Error sending audio response: ${error.message}`);
    return false;
  }
}
async function generateGreetingAudio() {
  try {
    console.log(`🎤 Generating greeting audio: "${GREETING_TEXT}"`);
    
    // Generate audio using ElevenLabs
    const audioBuffer = await streamToElevenLabs(GREETING_TEXT);
    
    if (audioBuffer) {
      // Save as temporary MP3 file
      const tempMp3File = 'greeting_temp.mp3';
      fs.writeFileSync(tempMp3File, audioBuffer);
      console.log(`✅ Generated greeting MP3: ${audioBuffer.length} bytes`);
      
      // Convert to Twilio format
      const twilioAudio = await prepareMP3ForTwilio(tempMp3File);
      
      // Clean up temp file
      if (fs.existsSync(tempMp3File)) {
        fs.unlinkSync(tempMp3File);
      }
      
      if (twilioAudio) {
        console.log(`✅ Converted greeting to Twilio format: ${twilioAudio.length} bytes`);
        return twilioAudio;
      }
    }
    
    console.log(`❌ Failed to generate greeting audio`);
    return null;
  } catch (error) {
    console.log(`❌ Error generating greeting: ${error.message}`);
    return null;
  }
}

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
  let audioBuffer = Buffer.alloc(0); // Buffer for incoming audio
  
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
        // Try ElevenLabs greeting first, then fallback to other options
        console.log(`🎵 Generating greeting with ElevenLabs...`);
        
        let audioBuffer = null;
        
        // Try to generate greeting using ElevenLabs
        try {
          audioBuffer = await generateGreetingAudio();
          if (audioBuffer) {
            console.log(`✅ Using ElevenLabs greeting audio`);
          }
        } catch (error) {
          console.log(`❌ ElevenLabs greeting failed: ${error.message}`);
          audioBuffer = null;
        }
        
        // If ElevenLabs failed, try MP3 conversion
        if (!audioBuffer && fs.existsSync('test.mp3')) {
          try {
            audioBuffer = await prepareMP3ForTwilio('test.mp3');
            if (audioBuffer) {
              console.log(`✅ Using test.mp3 as fallback`);
            }
          } catch (error) {
            console.log(`❌ MP3 conversion failed: ${error.message}`);
            audioBuffer = null;
          }
        }
        
        // If MP3 conversion failed, try voice files
        if (!audioBuffer) {
          console.log(`🔄 Trying voice files...`);
          
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
        
        // Process incoming audio for AI conversation
        if (message.media?.payload && message.media.track === 'inbound') {
          try {
            // Decode base64 audio data
            const audioData = Buffer.from(message.media.payload, 'base64');
            console.log(`📊 Audio chunk: ${audioData.length} bytes`);
            
            // Add to audio buffer for processing
            if (!audioBuffer) {
              audioBuffer = Buffer.alloc(0);
            }
            audioBuffer = Buffer.concat([audioBuffer, audioData]);
            
            // Check if we have enough audio to process
            const audioDuration = audioBuffer.length / (8000 * 2); // 8kHz, 16-bit
            console.log(`⏱️ Audio buffer duration: ${audioDuration.toFixed(2)}s`);
            
            // Check for silence in recent audio
            const recentAudio = audioBuffer.slice(-audioData.length); // Last chunk
            const isSilent = detectSilence(recentAudio, AUDIO_BUFFER.silenceThreshold);
            console.log(`🔇 Recent audio silence: ${isSilent}`);
            
            // Process if we have minimum duration AND detected silence
            if (audioDuration >= AUDIO_BUFFER.minDuration && isSilent) {
              console.log(`🎯 TRIGGERING PROCESSING: ${audioDuration.toFixed(2)}s + silence detected`);
              
              // Process the audio buffer
              setTimeout(async () => {
                if (audioBuffer && audioBuffer.length > 0) {
                  console.log(`🚀 STARTING AI PROCESSING...`);
                  await processIncomingAudio(audioBuffer, callId, ws, streamSid);
                  audioBuffer = Buffer.alloc(0); // Clear buffer after processing
                }
              }, 200); // Faster delay (200ms instead of 500ms)
            } else if (audioDuration >= AUDIO_BUFFER.maxDuration) {
              // Force processing if buffer is too long
              console.log(`⚠️ FORCE PROCESSING: Buffer too long (${audioDuration.toFixed(2)}s)`);
              
              setTimeout(async () => {
                if (audioBuffer && audioBuffer.length > 0) {
                  console.log(`🚀 STARTING AI PROCESSING (FORCED)...`);
                  await processIncomingAudio(audioBuffer, callId, ws, streamSid);
                  audioBuffer = Buffer.alloc(0); // Clear buffer after processing
                }
              }, 200); // Faster delay
            } else {
              console.log(`⏳ Waiting for more audio or silence...`);
            }
            
          } catch (error) {
            console.log(`❌ Error processing audio data: ${error.message}`);
          }
        }
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
