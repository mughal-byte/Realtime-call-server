#!/bin/bash

# Production startup script for Simple AI Voice Server
echo "🚀 Starting Simple AI Voice Server in Production Mode..."

# Set production environment variables
export NODE_ENV=production
export PORT=3000

echo "🔧 Environment: Production"
echo "🌐 Port: $PORT"
echo "📁 Test file: $(ls -la test.mp3 2>/dev/null | awk '{print $5 " bytes"}' || echo 'Not found')"

# Start the server
node server_final.js
