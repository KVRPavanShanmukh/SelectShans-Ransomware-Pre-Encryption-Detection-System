# =====================================================
# Stage 1: Build the React Production Frontend
# =====================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# =====================================================
# Stage 2: Production Container (Backend + Static Frontend)
# =====================================================
FROM python:3.10-slim

# Install system dependencies, supervisor and nginx
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl supervisor nginx && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python backend dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend application source
COPY backend/ /app/backend/

# Copy compiled frontend production assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Configure Nginx to serve the React SPA and reverse proxy API calls to Flask
RUN echo 'server {\n\
    listen 80;\n\
    listen 5173;\n\
    server_name _;\n\
\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html index.htm;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    location /api {\n\
        proxy_pass http://127.0.0.1:5000;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Upgrade $http_upgrade;\n\
        proxy_set_header Connection "upgrade";\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
}' > /etc/nginx/sites-available/default && \
    rm -f /etc/nginx/sites-enabled/default && \
    ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Configure Supervisor to manage both Backend and Nginx
RUN echo '[supervisord]\n\
nodaemon=true\n\
\n\
[program:backend]\n\
directory=/app/backend\n\
command=gunicorn -b 0.0.0.0:5000 app:app\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/backend.err.log\n\
stdout_logfile=/var/log/backend.out.log\n\
\n\
[program:frontend]\n\
command=/usr/sbin/nginx -g "daemon off;"\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/frontend.err.log\n\
stdout_logfile=/var/log/frontend.out.log\n' > /etc/supervisor/conf.d/supervisord.conf

ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py

EXPOSE 80 5000 5173

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
