# Production Deployment Guide 🚀

This guide covers deploying the RAG Code Review Assistant to production environments.

---

## 🎯 Deployment Options

### Option 1: Railway (Recommended - Free Tier Available)

**Backend Deployment:**

1. Create account at [Railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Add environment variables:
   ```
   OPENAI_API_KEY=your-key
   PYTHONUNBUFFERED=1
   ```
5. Railway auto-detects Dockerfile and deploys
6. Note your backend URL (e.g., `https://your-app.railway.app`)

**Frontend Deployment:**

1. Update `frontend/src/api/client.ts`:
   ```typescript
   const API_BASE_URL = 'https://your-backend.railway.app';
   ```
2. Deploy frontend to Vercel (see below)

**Cost:** Free tier: 500 hours/month, $5/month for additional usage

---

### Option 2: Render

**Backend:**

1. Create account at [Render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repository
4. Settings:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables:** Add `OPENAI_API_KEY`
5. Deploy

**Frontend:**

1. New → Static Site
2. Connect repository
3. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
   - **Environment Variables:** `VITE_API_URL=https://your-backend.onrender.com`

**Cost:** Free tier available, $7/month for paid instances

---

### Option 3: Vercel (Frontend) + Railway/Render (Backend)

**Frontend on Vercel:**

1. Visit [Vercel.com](https://vercel.com)
2. Import Git Repository
3. Framework Preset: Vite
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Environment Variables:
   ```
   VITE_API_URL=https://your-backend.railway.app
   ```
7. Deploy

**Cost:** Free for hobby projects

---

### Option 4: AWS (Production-Grade)

**Architecture:**
- **Backend:** ECS Fargate or EC2
- **Frontend:** S3 + CloudFront
- **Database:** RDS (if you add PostgreSQL later)
- **Vector Store:** EFS for ChromaDB persistence

**Estimated Cost:** ~$50-100/month

---

### Option 5: Google Cloud Run

**Backend:**

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/[PROJECT-ID]/code-review-backend

# Deploy to Cloud Run
gcloud run deploy code-review-backend \
  --image gcr.io/[PROJECT-ID]/code-review-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=your-key
```

**Frontend:**
Deploy to Firebase Hosting (free tier)

**Cost:** Pay-per-use, ~$5-20/month for moderate traffic

---

## 🔐 Security Checklist

### Before Production:

- [ ] Set strong `OPENAI_API_KEY`
- [ ] Enable HTTPS/SSL (automatic on Railway/Render/Vercel)
- [ ] Set `ALLOWED_ORIGINS` to production domain only
- [ ] Implement proper rate limiting (already included)
- [ ] Add authentication for sensitive operations
- [ ] Set up monitoring (Sentry, LogRocket)
- [ ] Configure CORS properly
- [ ] Enable request size limits
- [ ] Add input sanitization
- [ ] Set up error tracking

---

## 📊 Monitoring & Observability

### Recommended Tools:

**Error Tracking:**
```bash
pip install sentry-sdk
```

Add to `main.py`:
```python
import sentry_sdk
sentry_sdk.init(dsn="your-sentry-dsn")
```

**Analytics:**
- PostHog (product analytics)
- Google Analytics
- Plausible (privacy-focused)

**Logging:**
- Papertrail
- Logtail
- CloudWatch (AWS)

---

## 🔧 Environment Configuration

### Production `.env`:

```env
# Required
OPENAI_API_KEY=sk-proj-xxxxx

# Optional - Tune for production
CHROMA_PERSIST_DIR=/app/data/chroma_db
MAX_REPO_SIZE_MB=200
MAX_FILE_SIZE_MB=5
RATE_LIMIT_PER_MINUTE=20
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Sentry (optional)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# Redis (if you add it for caching)
REDIS_URL=redis://localhost:6379
```

---

## 🚀 Performance Optimization

### 1. ChromaDB Persistence

Mount volume for ChromaDB data:
```yaml
volumes:
  - ./chroma_db:/app/chroma_db
```

### 2. Redis Caching

Add Redis for repo metadata:
```python
import redis
r = redis.from_url(os.getenv("REDIS_URL"))
```

### 3. CDN for Static Assets

Use CloudFlare or CloudFront for frontend assets.

### 4. Database Scaling

For 100+ repos, migrate to PostgreSQL:
```python
# Store metadata in PostgreSQL
# Keep vectors in ChromaDB
```

---

## 📈 Scaling Strategy

### Stage 1: MVP (Current)
- Single instance backend
- In-memory caching
- ChromaDB local storage
- **Handles:** ~10 concurrent users

### Stage 2: Growth (100+ users)
- Horizontal scaling with load balancer
- Redis for shared cache
- Persistent ChromaDB volume
- **Handles:** ~100 concurrent users

### Stage 3: Enterprise (1000+ users)
- Kubernetes deployment
- Dedicated vector DB (Pinecone/Weaviate)
- PostgreSQL for metadata
- CDN for global delivery
- **Handles:** 1000+ concurrent users

---

## 🐳 Docker Deployment (Self-Hosted)

### Deploy to VPS (DigitalOcean, Linode, etc.):

```bash
# 1. SSH into your server
ssh user@your-server-ip

# 2. Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 3. Clone repository
git clone your-repo-url
cd rag-code-review

# 4. Set environment variables
export OPENAI_API_KEY=your-key

# 5. Deploy
docker-compose up -d

# 6. Set up Nginx reverse proxy (optional)
# See nginx-config-example.conf
```

**Cost:** $5-10/month for basic VPS

---

## 🔄 CI/CD Pipeline

### GitHub Actions Example:

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        run: |
          npm i -g @railway/cli
          railway link ${{ secrets.RAILWAY_PROJECT_ID }}
          railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        run: |
          npm i -g vercel
          vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

---

## 📊 Cost Estimation

### Minimal Setup (Hobby):
- Railway/Render Free Tier: **$0**
- Vercel Free Tier: **$0**
- OpenAI API: **~$5-20/month** (usage-based)
- **Total: $5-20/month**

### Production Setup:
- Railway Pro: **$20/month**
- Vercel Pro: **$20/month**
- OpenAI API: **~$50-200/month**
- Monitoring (Sentry): **$0-26/month**
- **Total: $90-266/month**

### Enterprise Setup:
- AWS/GCP: **$200-500/month**
- OpenAI API: **$500-2000/month**
- Monitoring & Logging: **$50-200/month**
- **Total: $750-2700/month**

---

## 🆘 Troubleshooting

### Backend won't start:
```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Missing OPENAI_API_KEY
# - Port 8000 already in use
# - Git not installed in container
```

### Frontend can't reach backend:
```bash
# Check CORS settings in backend/.env
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app

# Update frontend API URL
# frontend/src/api/client.ts
```

### ChromaDB persistence issues:
```bash
# Ensure volume is mounted correctly
docker-compose down -v  # Remove volumes
docker-compose up --build  # Rebuild
```

---

## ✅ Pre-Launch Checklist

- [ ] Environment variables configured
- [ ] HTTPS enabled
- [ ] CORS configured for production domain
- [ ] Rate limiting tested
- [ ] Error tracking enabled (Sentry)
- [ ] Analytics configured
- [ ] Load testing completed
- [ ] Backup strategy for ChromaDB data
- [ ] Health check endpoint working
- [ ] API documentation published
- [ ] Terms of Service & Privacy Policy (if public)

---

## 🎉 Launch!

Once deployed, test thoroughly:

1. Visit your production URL
2. Analyze a test repository
3. Run queries and reviews
4. Monitor logs for errors
5. Test rate limiting
6. Verify SSL certificate

---

## 📞 Support

Issues? Check:
- [GitHub Issues](your-repo/issues)
- [Discord/Slack Community](if you have one)
- Email: your-email@example.com

---

**Ready to ship? Deploy with confidence! 🚢**
