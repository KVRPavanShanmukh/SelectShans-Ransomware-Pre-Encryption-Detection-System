# Running SentinelStream with Docker

This directory contains the Docker configuration files required to run SentinelStream (Frontend, Backend, and Database) anywhere.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose) installed on your system.

## Setup Instructions

1. **Configure Environment Variables**
   - Copy `.env.example` to `.env` in the `docker` directory:
     ```bash
     cp .env.example .env
     ```
   - Open the `.env` file and configure your credentials (especially Gmail SMTP settings and Google OAuth Client ID if you intend to use those features).

2. **Start the System**
   - Run the following command from the `docker/` directory to build and start the services:
     ```bash
     docker compose up --build
     ```
   - This will start three services:
     - **`db`**: MySQL database running on port `3306` (with `backend/schema.sql` pre-loaded automatically).
     - **`backend`**: Flask server running on port `5000` (built using target `backend` inside `Dockerfile`).
     - **`frontend`**: React dashboard served via Nginx on port `5173` (built using target `frontend` inside `Dockerfile`).

3. **Access the Application**
   - Open your browser and navigate to: `http://localhost:5173`
   - Log in using the default admin account:
     - **Username**: `admin`
     - **Password**: `password123`

## File Organization

- [docker-compose.yml](file:///d:/HACK-LEARNATHONS/LEARNATHON%20SLOT%203/FINAL/PRO/PRO/docker/docker-compose.yml): Coordinates the multi-container configuration.
- [Dockerfile](file:///d:/HACK-LEARNATHONS/LEARNATHON%20SLOT%203/FINAL/PRO/PRO/docker/Dockerfile): A single, unified multi-stage build file for both services.
- [frontend/nginx.conf](file:///d:/HACK-LEARNATHONS/LEARNATHON%20SLOT%203/FINAL/PRO/PRO/docker/frontend/nginx.conf): Nginx configuration serving frontend assets and proxying API endpoints.
- [.env.example](file:///d:/HACK-LEARNATHONS/LEARNATHON%20SLOT%203/FINAL/PRO/PRO/docker/.env.example): Template for local Docker configuration settings.
