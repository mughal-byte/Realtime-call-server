#!/bin/bash

# Production startup script for AI Voice Assistant
echo "🚀 Starting AI Voice Assistant Server in Production Mode..."

# Set production environment variables
export NODE_ENV=production
export SEND_TEXT_RESPONSE=true
export PORT=3000

# Optional: Set other production variables
# export SKIP_ELEVENLABS=false
# export USE_HTTPS=true

echo "🔧 Environment: Production"
echo "🔒 HTTPS: Enabled (if SSL certificates available)"
echo "📤 Text Response Mode: Enabled"
echo "🌐 Port: $PORT"

# Start the server
node server.js
