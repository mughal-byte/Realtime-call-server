// test-elevenlabs.mjs
import 'dotenv/config';
import fs from 'fs';
import axios from 'axios';

const text = "Hello, this is a test voice from ElevenLabs!";
const apiKey = process.env.ELEVENLABS_API_KEY;

try {
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
    {
      text,
      voice_settings: { stability: 0.5, similarity_boost: 0.5 }
    },
    {
      headers: { "xi-api-key": apiKey },
      responseType: "arraybuffer"
    }
  );

  fs.writeFileSync("test.mp3", Buffer.from(response.data));
  console.log("✅ Saved test.mp3");

} catch (err) {
  console.error("❌ ElevenLabs error:", err.response?.data || err.message);
}
