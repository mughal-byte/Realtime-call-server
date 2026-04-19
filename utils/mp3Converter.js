import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

// Convert MP3 to Twilio-compatible format using FFmpeg
export async function convertMP3ToTwilioFormat(inputFile, outputFile) {
  try {
    console.log(`🔄 Converting ${inputFile} to Twilio mulaw format...`);
    
    // Use FFmpeg to convert MP3 to 8kHz mulaw (Twilio's native format)
    const command = `ffmpeg -i "${inputFile}" -ar 8000 -ac 1 -f mulaw "${outputFile}"`;
    
    await execAsync(command);
    
    console.log(`✅ Converted ${inputFile} to ${outputFile}`);
    return true;
  } catch (error) {
    console.log(`❌ FFmpeg conversion failed: ${error.message}`);
    return false;
  }
}

// Read and convert MP3 file for Twilio
export async function prepareMP3ForTwilio(mp3File) {
  try {
    // Check if FFmpeg is available
    try {
      await execAsync('ffmpeg -version');
    } catch (err) {
      console.log(`❌ FFmpeg not available, using fallback beep`);
      return null;
    }
    
    // Convert MP3 to mulaw format
    const tempFile = 'temp_audio.ulaw';
    const success = await convertMP3ToTwilioFormat(mp3File, tempFile);
    
    if (success && fs.existsSync(tempFile)) {
      const audioBuffer = fs.readFileSync(tempFile);
      console.log(`✅ Prepared MP3 for Twilio (mulaw): ${audioBuffer.length} bytes`);
      
      // Clean up temp file
      fs.unlinkSync(tempFile);
      
      return audioBuffer;
    }
    
    return null;
  } catch (error) {
    console.log(`❌ Error preparing MP3: ${error.message}`);
    return null;
  }
}
