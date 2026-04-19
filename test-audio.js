import fs from 'fs';
import { streamToElevenLabs } from './utils/elevenlabs.js';
import { convertToMulaw } from './utils/audioConverter.js';

async function testAudioGeneration() {
  console.log('🎵 Testing audio generation...');
  
  try {
    // Test ElevenLabs audio generation
    console.log('1️⃣ Generating audio with ElevenLabs...');
    const audioBuffer = await streamToElevenLabs('Hello, this is a test message. Can you hear me?');
    
    if (!audioBuffer) {
      console.log('❌ Failed to generate audio from ElevenLabs');
      return;
    }
    
    console.log(`✅ Generated audio: ${audioBuffer.length} bytes`);
    
    // Save original MP3 file
    const mp3File = '/tmp/test-audio.mp3';
    fs.writeFileSync(mp3File, audioBuffer);
    console.log(`💾 Saved MP3 file: ${mp3File}`);
    
    // Test mulaw conversion
    console.log('2️⃣ Converting to mulaw format...');
    const mulawBuffer = await convertToMulaw(audioBuffer);
    
    if (!mulawBuffer) {
      console.log('❌ Failed to convert to mulaw');
      return;
    }
    
    console.log(`✅ Converted to mulaw: ${mulawBuffer.length} bytes`);
    
    // Save mulaw file
    const mulawFile = '/tmp/test-audio.mulaw';
    fs.writeFileSync(mulawFile, mulawBuffer);
    console.log(`💾 Saved mulaw file: ${mulawFile}`);
    
    console.log('\n🎉 Audio generation test completed!');
    console.log(`📁 Files created:`);
    console.log(`   - MP3: ${mp3File}`);
    console.log(`   - Mulaw: ${mulawFile}`);
    console.log('\n🔊 To test audio playback:');
    console.log(`   - Play MP3: ffplay ${mp3File}`);
    console.log(`   - Play mulaw: ffplay -f mulaw -ar 8000 -ac 1 ${mulawFile}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAudioGeneration();
