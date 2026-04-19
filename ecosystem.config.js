{
  "name": "ai-voice-assistant",
  "script": "server.js",
  "instances": 1,
  "exec_mode": "fork",
  "env": {
    "NODE_ENV": "development",
    "SEND_TEXT_RESPONSE": "true",
    "PORT": 3000
  },
  "env_production": {
    "NODE_ENV": "production",
    "SEND_TEXT_RESPONSE": "true",
    "PORT": 3000,
    "USE_HTTPS": "true"
  },
  "log_file": "logs/pm2.log",
  "error_file": "logs/pm2-error.log",
  "out_file": "logs/pm2-out.log",
  "log_date_format": "YYYY-MM-DD HH:mm:ss Z"
}
