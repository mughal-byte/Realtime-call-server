import fs from 'fs';

// Generate a simple test audio file (beep sound) without external APIs
export function generateTestAudio(text, duration = 3) {
  console.log(`🎵 Generating test audio for: "${text}"`);
  
  const sampleRate = 8000; // Twilio expects 8kHz
  const samples = sampleRate * duration;
  
  // Generate a more audible beep pattern
  const audioData = new Float32Array(samples);
  const frequency = 800; // Higher frequency for better audibility
  
  for (let i = 0; i < samples; i++) {
    // Create a beep pattern with some variation
    const amplitude = Math.sin(i / samples * Math.PI) * 0.5; // Higher amplitude
    const wave = Math.sin(2 * Math.PI * frequency * i / sampleRate);
    
    // Add some variation to make it more audible
    const variation = Math.sin(2 * Math.PI * 2 * i / sampleRate) * 0.1;
    audioData[i] = wave * amplitude + variation;
  }
  
  // Convert to 16-bit PCM
  const pcmData = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    pcmData[i] = Math.round(audioData[i] * 32767);
  }
  
  // Create WAV file
  const wavBuffer = Buffer.alloc(44 + samples * 2);
  
  // WAV header
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + samples * 2, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20); // PCM
  wavBuffer.writeUInt16LE(1, 22); // Mono
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  wavBuffer.writeUInt16LE(2, 32); // Block align
  wavBuffer.writeUInt16LE(16, 34); // Bits per sample
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(samples * 2, 40);
  
  // Write PCM data
  for (let i = 0; i < samples; i++) {
    wavBuffer.writeInt16LE(pcmData[i], 44 + i * 2);
  }
  
  console.log(`✅ Generated test audio: ${wavBuffer.length} bytes`);
  return wavBuffer;
}

// Generate a simple mulaw audio file directly
export function generateMulawAudio(text, sampleRate = 8000) {
  console.log(`🎵 Generating simple beep audio for: "${text}"`);
  
  const duration = 1.0; // 1 second beep
  const samples = Math.floor(sampleRate * duration);
  
  // Generate a simple sine wave beep
  const frequency = 800; // 800 Hz beep
  const audioData = new Float32Array(samples);
  
  for (let i = 0; i < samples; i++) {
    audioData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
  }
  
  // Convert to 16-bit PCM (simpler and more reliable)
  const pcmData = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    pcmData[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
  }
  
  console.log(`✅ Generated simple beep audio: ${pcmData.length * 2} bytes`);
  return Buffer.from(pcmData.buffer);
}
