import { generateTestAudio } from './utils/simpleAudioGenerator.js';
import fs from 'fs';

console.log('🎵 Testing improved audio generation...');
const audio = generateTestAudio('Hello, this is a test message');
fs.writeFileSync('/tmp/test-improved-audio.wav', audio);
console.log('✅ Improved audio saved to /tmp/test-improved-audio.wav');
console.log('You can test with: ffplay /tmp/test-improved-audio.wav');
