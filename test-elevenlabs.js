require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const text = "Hello, this is a test voice from ElevenLabs!";
const apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
  console.error("❌ ELEVENLABS_API_KEY missing from .env");
  process.exit(1);
}

(async () => {
  try {
    console.log("🎤 Requesting ElevenLabs voice...");
    const response = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
      {
        text,
        voice_settings: { stability: 0.5, similarity_boost: 0.5 },
      },
      {
        headers: { "xi-api-key": apiKey },
        responseType: "arraybuffer",
      }
    );

    fs.writeFileSync("test.mp3", Buffer.from(response.data));
    console.log("✅ test.mp3 saved successfully!");
  } catch (err) {
    console.error("❌ ElevenLabs error:", err.response?.data || err.message);
  }
})();
