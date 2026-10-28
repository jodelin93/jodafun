# Railway Deployment Guide for Joda Fun

## Prerequisites
- GitHub repository: `jodelin93/jodafun`
- Railway project: "Joda Fun"
- Domains: `jodafun.app` (frontend), `api.jodafun.app` (backend)

## Architecture
```
┌─────────────────┐         ┌─────────────────┐         ┌──────────────┐
│   Frontend      │────────▶│    Backend      │────────▶│  PostgreSQL  │
│ jodafun.app     │         │ api.jodafun.app │         │   Database   │
│ (Next.js 15)    │◀────────│   (NestJS)      │         │              │
└─────────────────┘         └─────────────────┘         └──────────────┘
      Port 3000                   Port 3000
```

## Step-by-Step Deployment

### 1. Push Code to GitHub
```bash
# Code is already committed locally
git push -u origin main
```

### 2. Railway Project Setup

#### Service 1: PostgreSQL Database
1. In Railway project "Joda Fun", click "New"
2. Select "Database" → "Add PostgreSQL"
3. Database will auto-generate `DATABASE_URL`
4. Copy the `DATABASE_URL` for backend configuration

#### Service 2: Backend API (api.jodafun.app)
1. Click "New" → "GitHub Repo"
2. Select `jodelin93/jodafun` repository
3. **Settings:**
   - **Service Name**: `backend-api`
   - **Root Directory**: `game-platform/apps/backend`
   - **Watch Paths**: `game-platform/apps/backend/**`

4. **Environment Variables:**
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=your-super-secret-jwt-key-min-32-chars-change-this-in-production
   CORS_ORIGIN=https://jodafun.app
   PORT=3000
   NODE_ENV=production
   ```

5. **Build & Deploy** (auto-configured via railway.json):
   - Build Command: `npm install && npx prisma generate && npm run build`
   - Start Command: `npx prisma migrate deploy && npm run start:prod`

6. **Custom Domain:**
   - Go to Settings → Domains
   - Add custom domain: `api.jodafun.app`
   - Configure DNS (see below)

#### Service 3: Frontend (jodafun.app)
1. Click "New" → "GitHub Repo"
2. Select `jodelin93/jodafun` repository (same repo, different service)
3. **Settings:**
   - **Service Name**: `frontend`
   - **Root Directory**: `game-platform/apps/frontend`
   - **Watch Paths**: `game-platform/apps/frontend/**`

4. **Environment Variables:**
   ```
   NEXT_PUBLIC_API_URL=https://api.jodafun.app
   NEXT_PUBLIC_WS_URL=wss://api.jodafun.app
   NODE_ENV=production
   ```

5. **Build & Deploy** (auto-configured via railway.json):
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start`

6. **Custom Domain:**
   - Go to Settings → Domains
   - Add custom domain: `jodafun.app`
   - Configure DNS (see below)

### 3. DNS Configuration

For each domain, add these DNS records in your domain registrar:

#### For `jodafun.app` (Frontend):
```
Type: CNAME
Name: @
Value: <railway-provided-domain>.up.railway.app
TTL: Auto
```

#### For `api.jodafun.app` (Backend):
```
Type: CNAME
Name: api
Value: <railway-provided-domain>.up.railway.app
TTL: Auto
```

**Note:** Railway provides the exact CNAME values when you add custom domains.

### 4. Environment Variables Reference

#### Backend (`api.jodafun.app`)
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection (from Railway) | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for JWT tokens (min 32 chars) | `your-secret-here-change-me` |
| `CORS_ORIGIN` | Frontend URL for CORS | `https://jodafun.app` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `production` |

#### Frontend (`jodafun.app`)
| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://api.jodafun.app` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL | `wss://api.jodafun.app` |
| `NODE_ENV` | Environment | `production` |

### 5. Database Migrations

The backend automatically runs migrations on deployment via:
```bash
npx prisma migrate deploy && npm run start:prod
```

To manually run migrations:
```bash
# In Railway backend service shell
npx prisma migrate deploy
```

### 6. Deployment Verification

After deployment, verify:

1. **Backend Health:**
   ```bash
   curl https://api.jodafun.app/health
   # Expected: {"status":"ok","timestamp":"..."}
   ```

2. **Frontend:**
   - Visit: https://jodafun.app
   - Should load the home page

3. **WebSocket:**
   - Start a multiplayer game
   - Check browser console for WebSocket connection

### 7. Monitoring & Logs

- **Railway Dashboard:** https://railway.app
- **Backend Logs:** Select backend service → "Deployments" → View logs
- **Frontend Logs:** Select frontend service → "Deployments" → View logs
- **Database Metrics:** Select PostgreSQL service → "Metrics"

### 8. Rollback (if needed)

If deployment fails:
1. Go to service → "Deployments"
2. Find last working deployment
3. Click "..." → "Redeploy"

## Troubleshooting

### Backend won't start
- Check `DATABASE_URL` is set correctly
- Verify Prisma migrations ran: Check logs for "Migration applied"
- Check all environment variables are set

### Frontend shows API errors
- Verify `NEXT_PUBLIC_API_URL` points to backend
- Check CORS_ORIGIN on backend matches frontend domain
- Test backend health endpoint

### WebSocket connection fails
- Verify `NEXT_PUBLIC_WS_URL` uses `wss://` not `ws://`
- Check backend allows WebSocket upgrade
- Verify CORS settings

### Database connection fails
- Confirm PostgreSQL service is running
- Check DATABASE_URL format
- Verify network connectivity in Railway

## Production Checklist

- [ ] GitHub repository pushed
- [ ] PostgreSQL database created
- [ ] Backend deployed with correct env vars
- [ ] Frontend deployed with correct env vars
- [ ] Custom domains configured
- [ ] DNS records added
- [ ] SSL certificates active (automatic via Railway)
- [ ] Database migrations applied
- [ ] Health endpoint responding
- [ ] Frontend loads correctly
- [ ] WebSocket connections work
- [ ] Test Joda Memory game works

## Support

For Railway-specific issues: https://docs.railway.app
For project issues: Create an issue on GitHub
