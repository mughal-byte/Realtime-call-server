import fs from 'fs';

// Create a simple test WAV file
function createTestWavFile() {
  console.log('🎵 Creating test WAV file...');
  
  // Simple WAV header for a 1-second sine wave at 440Hz
  const sampleRate = 8000;
  const duration = 1; // 1 second
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
  wavBuffer.writeUInt32LE(sampleRate * 2, 28);
  wavBuffer.writeUInt16LE(2, 32);
  wavBuffer.writeUInt16LE(16, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(samples * 2, 40);
  
  // Write audio data
  for (let i = 0; i < samples; i++) {
    wavBuffer.writeInt16LE(pcmData[i], 44 + i * 2);
  }
  
  const filename = '/tmp/test-tone.wav';
  fs.writeFileSync(filename, wavBuffer);
  
  console.log(`✅ Created test WAV file: ${filename}`);
  console.log(`📊 File size: ${wavBuffer.length} bytes`);
  console.log(`🎵 Duration: ${duration}s, Frequency: ${frequency}Hz`);
  console.log(`🔊 To play: ffplay ${filename}`);
  
  return filename;
}

// Test FFmpeg conversion
async function testFfmpegConversion(wavFile) {
  console.log('\n🔄 Testing FFmpeg conversion...');
  
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    // Convert to mulaw
    const mulawFile = '/tmp/test-tone.mulaw';
    const command = `/usr/bin/ffmpeg -i "${wavFile}" -ar 8000 -ac 1 -f mulaw "${mulawFile}" -y`;
    
    console.log(`Running: ${command}`);
    await execAsync(command);
    
    const stats = fs.statSync(mulawFile);
    console.log(`✅ Converted to mulaw: ${mulawFile}`);
    console.log(`📊 Mulaw file size: ${stats.size} bytes`);
    console.log(`🔊 To play: ffplay -f mulaw -ar 8000 -ac 1 ${mulawFile}`);
    
    return mulawFile;
  } catch (error) {
    console.error('❌ FFmpeg conversion failed:', error.message);
    return null;
  }
}

// Main test
async function runAudioTest() {
  console.log('🎵 Audio Generation and Conversion Test\n');
  
  try {
    // Create test WAV file
    const wavFile = createTestWavFile();
    
    // Test FFmpeg conversion
    const mulawFile = await testFfmpegConversion(wavFile);
    
    console.log('\n🎉 Test completed!');
    console.log('\n📁 Files created:');
    console.log(`   - WAV: ${wavFile}`);
    if (mulawFile) {
      console.log(`   - Mulaw: ${mulawFile}`);
    }
    
    console.log('\n🔊 To test audio playback:');
    console.log(`   - Play WAV: ffplay ${wavFile}`);
    if (mulawFile) {
      console.log(`   - Play mulaw: ffplay -f mulaw -ar 8000 -ac 1 ${mulawFile}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runAudioTest();
