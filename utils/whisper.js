import fetch from 'node-fetch';
import FormData from 'form-data';
import { bufferToAudio } from './audioHelpers.js';

export async function transcribeAudio(float32Array) {
  try {
    const wavBuffer = await bufferToAudio(float32Array);

    const formData = new FormData();
    formData.append('file', wavBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav',
    });
    formData.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
            timeout: 60000, // 60 second timeout
  });

    const result = await response.json();

    if (result.error) {
      console.error('Whisper error:', result.error);
      return null;
    }

    console.log('Transcription:', result.text);
    return result.text;
  } catch (err) {
    console.error('Transcription failed:', err);
    return null;
  }
}
