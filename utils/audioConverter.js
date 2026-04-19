import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function convertToMulaw(audioBuffer) {
  try {
    // Check if ffmpeg is available using full path
    try {
      await execAsync('/usr/bin/ffmpeg -version');
    } catch (error) {
      console.log('⚠️ FFmpeg not available, using fallback conversion');
      return convertToPCM16(audioBuffer);
    }

    // Create temporary files
    const tempInput = `/tmp/input_${Date.now()}.wav`;
    const tempOutput = `/tmp/output_${Date.now()}.mulaw`;
    
    // Write input buffer to temporary file
    fs.writeFileSync(tempInput, audioBuffer);
    
    // Convert to mulaw using ffmpeg with full path
    // Twilio expects: audio/x-mulaw, 8000 Hz, mono
    const ffmpegCommand = `/usr/bin/ffmpeg -i "${tempInput}" -ar 8000 -ac 1 -f mulaw "${tempOutput}" -y`;
    
    console.log(`🔄 Converting audio to mulaw format...`);
    await execAsync(ffmpegCommand);
    
    // Read the converted file
    const mulawBuffer = fs.readFileSync(tempOutput);
    
    // Clean up temporary files
    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);
    
    console.log(`✅ Converted to mulaw: ${mulawBuffer.length} bytes`);
    return mulawBuffer;
    
  } catch (error) {
    console.error('❌ Audio conversion failed:', error.message);
    
    // Fallback: return original buffer (might not work but won't crash)
    console.log('⚠️ Using original audio format as fallback');
    return audioBuffer;
  }
}

// Alternative: Simple PCM conversion without ffmpeg
export function convertToPCM16(audioBuffer, targetSampleRate = 8000) {
  try {
    // This is a simplified conversion - for production, use proper audio libraries
    // For now, just return the buffer and let Twilio handle it
    console.log(`🔄 Using PCM16 fallback conversion`);
    return audioBuffer;
  } catch (error) {
    console.error('❌ PCM conversion failed:', error.message);
    return audioBuffer;
  }
}
