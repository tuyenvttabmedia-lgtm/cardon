# CardOn — Production Docker Deployment

> Phase 4D — deployment reference for API + worker split.

## Architecture

```
Internet → Nginx (TLS) → NestJS API (APP_ROLE=api)
                      ↘ PostgreSQL
                      ↘ Redis ← BullMQ workers (APP_ROLE=worker)
```

## Services

| Service | Image / CMD | Purpose |
|---------|-------------|---------|
| `nginx` | nginx:alpine | TLS, reverse proxy |
| `api` | `node dist/main.js` | HTTP API (`APP_ROLE=api`) |
| `worker` | `node dist/worker.js` | BullMQ consumers (`APP_ROLE=worker`) |
| `postgres` | postgres:16 | Primary database |
| `redis` | redis:7-alpine | Queues + cache |

## docker-compose.production.yml (example)

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: cardon
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: cardon
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cardon -d cardon"]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  api:
    build: .
    restart: unless-stopped
    command: node dist/main.js
    env_file: .env.production
    environment:
      APP_ENV: production
      APP_ROLE: api
      WORKER_HEARTBEAT_REQUIRED: "true"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "4000:3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/health/ready"]
      interval: 30s
      timeout: 5s
      retries: 3

  worker:
    build: .
    restart: unless-stopped
    command: node dist/worker.js
    env_file: .env.production
    environment:
      APP_ENV: production
      APP_ROLE: worker
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      replicas: 2

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./deploy/nginx/cardon.conf:/etc/nginx/conf.d/default.conf:ro
      - ./deploy/ssl:/etc/ssl/cardon:ro
    depends_on:
      - api

volumes:
  pgdata:
  redisdata:
```

## Nginx example (`deploy/nginx/cardon.conf`)

```nginx
upstream cardon_api {
    server api:3000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.cardon.vn;

    ssl_certificate     /etc/ssl/cardon/fullchain.pem;
    ssl_certificate_key /etc/ssl/cardon/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    client_max_body_size 1m;

    location /health {
        proxy_pass http://cardon_api;
        access_log off;
    }

    location /api/ {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://cardon_api;
    }
}

server {
    listen 80;
    server_name api.cardon.vn;
    return 301 https://$host$request_uri;
}
```

## PM2 alternative

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'cardon-api',
      script: 'dist/main.js',
      instances: 2,
      exec_mode: 'cluster',
      env_production: { APP_ENV: 'production', APP_ROLE: 'api', NODE_ENV: 'production' },
    },
    {
      name: 'cardon-worker',
      script: 'dist/worker.js',
      instances: 2,
      exec_mode: 'fork',
      env_production: { APP_ENV: 'production', APP_ROLE: 'worker', NODE_ENV: 'production' },
    },
  ],
};
```

## Deploy checklist

1. Copy `.env.production` — all keys validated by Joi when `APP_ENV=production`
2. `npm run build`
3. `npx prisma migrate deploy`
4. Start `worker` then `api`
5. Verify `GET /health/ready` returns 200
6. Monitor Redis queue depth and worker heartbeat key `cardon:worker:heartbeat`

## Related

- [PHASE_4D_PRODUCTION_READINESS_REPORT.md](./PHASE_4D_PRODUCTION_READINESS_REPORT.md)
- [12_SECURITY_DEPLOY.md](./12_SECURITY_DEPLOY.md)
