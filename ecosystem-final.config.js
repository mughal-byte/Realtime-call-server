{
  "name": "simple-ai-voice",
  "script": "server_final.js",
  "instances": 1,
  "exec_mode": "fork",
  "env": {
    "NODE_ENV": "development",
    "PORT": 3000
  },
  "env_production": {
    "NODE_ENV": "production",
    "PORT": 3000
  },
  "log_file": "logs/pm2-final.log",
  "error_file": "logs/pm2-final-error.log",
  "out_file": "logs/pm2-final-out.log",
  "log_date_format": "YYYY-MM-DD HH:mm:ss Z"
}
