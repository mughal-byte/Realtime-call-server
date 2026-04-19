import { generateTestAudio, generateMulawAudio } from './utils/simpleAudioGenerator.js';
import fs from 'fs';

console.log('🎵 Testing audio generation...');

// Test 1: Generate test audio
const testAudio = generateTestAudio('Hello, this is a test message');
fs.writeFileSync('/tmp/test-audio.wav', testAudio);
console.log('✅ Test audio saved to /tmp/test-audio.wav');

// Test 2: Generate mulaw audio
const mulawAudio = generateMulawAudio('Hello, this is a test message');
fs.writeFileSync('/tmp/test-audio.mulaw', mulawAudio);
console.log('✅ Mulaw audio saved to /tmp/test-audio.mulaw');

console.log('🎉 Audio generation test complete!');
console.log('You can test playback with:');
console.log('ffplay -f mulaw -ar 8000 -ac 1 /tmp/test-audio.mulaw');
