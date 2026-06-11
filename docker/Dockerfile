# =====================================================
# Stage 1: Build the React Frontend Application
# =====================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# =====================================================
# Stage 2: Backend Python Flask Service
# =====================================================
FROM python:3.10-slim AS backend
WORKDIR /app

# Install system dependencies (needed for reportlab/matplotlib compilation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY backend/ ./

EXPOSE 5000

ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py

CMD ["python", "app.py"]

# =====================================================
# Stage 3: Frontend Nginx Web Server
# =====================================================
FROM nginx:alpine AS frontend

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Custom nginx configuration (maps default.conf)
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
