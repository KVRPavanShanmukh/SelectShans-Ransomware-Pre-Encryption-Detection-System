# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Install system dependencies, Node.js and Git
RUN apt-get update && \
    apt-get install -y curl git supervisor && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# The repository URL will be passed as a build argument
ARG REPO_URL="https://github.com/placeholder/repo.git"

# Set working directory
WORKDIR /app

# Clone the repository
# We use a trick to invalidate the cache if the repo URL changes
RUN git clone ${REPO_URL} .

# Set up Backend
WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt

# Set up Frontend
WORKDIR /app/frontend
RUN npm install

# We need a supervisord config to run both backend and frontend simultaneously
# Create supervisor config
RUN echo "[supervisord]\n\
nodaemon=true\n\
\n\
[program:backend]\n\
directory=/app/backend\n\
command=python app.py\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/backend.err.log\n\
stdout_logfile=/var/log/backend.out.log\n\
\n\
[program:frontend]\n\
directory=/app/frontend\n\
command=npm run dev -- --host 0.0.0.0\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/frontend.err.log\n\
stdout_logfile=/var/log/frontend.out.log\n" > /etc/supervisor/conf.d/supervisord.conf

# Expose ports based on existing configuration
EXPOSE 5000 5173

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
