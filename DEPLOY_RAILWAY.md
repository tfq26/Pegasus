# Railway & Coolify Deployment Guide

This guide explains how to deploy Pegasus to **Railway** (managed) or **Coolify** (self-hosted).

## Option 1: Railway (Easiest for Sockets)

Railway handles persistent connections perfectly, fixing your Socket.io issues.

### 1. The Database (SurrealDB)
1. Go to [Railway.app](https://railway.app).
2. Click **New Project** -> **Provision SurrealDB**.
3. Once created, go to the **Variables** tab of the SurrealDB service and copy the following:
   - `SURREAL_URL` (usually starts with `ws://...`)
   - `SURREAL_USER` (usually `root`)
   - `SURREAL_PASS`

### 2. The Backend
1. Click **New** -> **GitHub Repo** -> Select `Pegasus-Application`.
2. Go to **Settings** -> **General** -> **Root Directory**: Set to `/`.
3. Go to **Settings** -> **Build** -> **Docker Engine**: Railway should automatically find `Dockerfile.backend`. If not, specify it.
4. Add these **Environment Variables**:
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
   - `SURREAL_URL`: (Paste from SurrealDB step)
   - `SURREAL_USER`: `root`
   - `SURREAL_PASS`: `root`
   - `JWT_SECRET`: (Your 32-char secret)
   - `WORKOS_API_KEY`: (Your key)
   - `WORKOS_CLIENT_ID`: (Your ID)
   - `WORKOS_REDIRECT_URI`: `https://your-backend-production.up.railway.app/auth/callback`
   - `ALLOWED_ORIGINS`: `https://your-frontend.vercel.app` (or your Railway frontend URL)

---

## Option 2: Coolify (Self-Hosted Cloud)

If you have a VPS (Hetzner, DigitalOcean, etc.), this is the best for cost-saving.

### 1. Install Coolify on your VPS
Run this on your server:
```bash
curl -fsSL https://get.coollabs.io/coolify/install.sh | bash
```

### 2. Deploy Pegasus
1. Open your Coolify dashboard (usually `http://<your-ip>:3000`).
2. Create a **New Project**.
3. Create a **New Resource** -> **Docker Compose**.
4. Paste the content of the `docker-compose.yml` file from the root of this project.
5. Click **Deploy**.

Coolify will automatically spin up:
- Your Bun Backend (with Sockets enabled).
- A private SurrealDB instance.
- Automatic SSL (HTTPS) for you.

---

## Important Migration Note

### Update `ALLOWED_ORIGINS`
When you deploy the backend to Railway, its URL will change (e.g., `pegasus-backend.up.railway.app`). 
1. Update your **WorkOS** redirect URIs to point to this new URL.
2. Update your **Frontend** `VITE_QUERY_API_URL` to point to this new URL.
