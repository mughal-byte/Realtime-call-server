import fs from 'fs';

// Create a simple test audio file that can be played
function createTestAudio() {
  console.log('🎵 Creating test audio file...');
  
  // Create a simple WAV file with a beep sound
  const sampleRate = 8000;
  const duration = 2; // 2 seconds
  const frequency = 440; // A4 note
  const samples = sampleRate * duration;
  
  // Generate sine wave
  const audioData = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    audioData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
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
  
  // Write audio data
  for (let i = 0; i < samples; i++) {
    wavBuffer.writeInt16LE(pcmData[i], 44 + i * 2);
  }
  
  // Save file
  const filename = '/tmp/test-beep.wav';
  fs.writeFileSync(filename, wavBuffer);
  console.log(`✅ Test audio saved: ${filename}`);
  console.log(`📊 File size: ${wavBuffer.length} bytes`);
  console.log(`🎵 Duration: ${duration} seconds`);
  console.log(`🔊 Sample rate: ${sampleRate} Hz`);
  
  return filename;
}

// Test if we can play the audio
async function testAudioPlayback() {
  try {
    const filename = createTestAudio();
    
    console.log('\n🎧 Testing audio playback...');
    console.log('You can test the audio file by running:');
    console.log(`ffplay -f wav -ar 8000 -ac 1 ${filename} -nodisp -autoexit`);
    
    // Try to play it automatically
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      await execAsync(`ffplay -f wav -ar 8000 -ac 1 ${filename} -nodisp -autoexit`);
      console.log('✅ Audio playback test completed');
    } catch (error) {
      console.log('⚠️ Could not play audio automatically, but file was created');
      console.log('You can manually test with the command above');
    }
    
  } catch (error) {
    console.error('❌ Error creating test audio:', error.message);
  }
}

testAudioPlayback();
