import WebSocket from 'ws';

// Test WebSocket connection to simulate Twilio
const testCallId = 'CA1234567890abcdef';
const wsUrl = 'ws://localhost:3000/realtime/' + testCallId;

console.log(`🔌 Testing WebSocket connection to: ${wsUrl}`);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  
  // Send a test Twilio start message
  const startMessage = {
    event: 'start',
    sequenceNumber: '1',
    streamSid: testCallId,
    start: {
      accountSid: 'AC1234567890abcdef',
      callSid: testCallId,
      tracks: ['inbound', 'outbound'],
      mediaFormat: {
        encoding: 'audio/x-mulaw',
        sampleRate: '8000',
        channels: '1'
      }
    }
  };
  
  console.log('📤 Sending start message...');
  ws.send(JSON.stringify(startMessage));
  
  // Send a test media message (simulating audio)
  setTimeout(() => {
    const mediaMessage = {
      event: 'media',
      sequenceNumber: '2',
      streamSid: testCallId,
      media: {
        track: 'inbound',
        chunk: '1',
        timestamp: Date.now().toString(),
        payload: Buffer.from('test audio data').toString('base64')
      }
    };
    
    console.log('📤 Sending test media message...');
    ws.send(JSON.stringify(mediaMessage));
  }, 1000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:', JSON.stringify(message, null, 2));
  } catch (err) {
    console.log('📨 Received raw data:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`❌ WebSocket closed - Code: ${code}, Reason: ${reason}`);
  process.exit(0);
});

// Close after 10 seconds
setTimeout(() => {
  console.log('⏰ Test completed, closing connection...');
  ws.close();
}, 10000);
