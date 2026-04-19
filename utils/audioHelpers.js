import WavEncoder from 'wav-encoder';

export async function bufferToAudio(audioBuffer, sampleRate = 16000) {
  try {
    // If it's already a Float32Array, use it directly
    if (audioBuffer instanceof Float32Array) {
      const audioData = {
        sampleRate,
        channelData: [audioBuffer], // mono
      };
      const arrayBuffer = await WavEncoder.encode(audioData);
      return Buffer.from(arrayBuffer);
    }
    
    // If it's a Buffer or ArrayBuffer, convert to Float32Array
    let buffer;
    if (audioBuffer instanceof Buffer) {
      buffer = audioBuffer;
    } else if (audioBuffer instanceof ArrayBuffer) {
      buffer = Buffer.from(audioBuffer);
    } else {
      throw new Error('Unsupported audio buffer type');
    }
    
    // Convert buffer to Float32Array (assuming 16-bit PCM)
    const float32Array = new Float32Array(buffer.length / 2);
    const dataView = new DataView(buffer.buffer);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Convert 16-bit PCM to float32 (-1.0 to 1.0)
      const sample = dataView.getInt16(i * 2, true); // little-endian
      float32Array[i] = sample / 32768.0;
    }
    
    const audioData = {
      sampleRate,
      channelData: [float32Array], // mono
    };
    
    const arrayBuffer = await WavEncoder.encode(audioData);
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error in bufferToAudio:', error);
    throw error;
  }
}
