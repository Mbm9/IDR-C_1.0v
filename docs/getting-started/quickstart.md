# Quickstart

> Get Identity Radar running in 5 minutes.

## Prerequisites
- Docker and Docker Compose
- Node.js 18+
- npm

## Steps

### 1. Clone and install
```bash
git clone https://github.com/ASHS21/IDR-C.git
cd IDR-C
npm install
```

### 2. Start PostgreSQL
```bash
docker compose up -d
```

### 3. Push database schema
```bash
npm run db:push
```

### 4. Create database views
```bash
docker exec -i identity-radar-db psql -U postgres -d identity_radar < db/migrations/0001_create_views.sql
```

### 5. Seed sample data
```bash
npm run db:seed
```

### 6. Start the application
```bash
npm run dev
```

### 7. Open in browser
Navigate to `http://localhost:3000` and log in with:
- **Email:** `admin@acmefs.sa`
- **Password:** `admin123`

## What's included in seed data
- 1 organization (Acme Financial Services)
- 200 identities (140 human + 60 non-human)
- 500 entitlements across 100 resources
- 50 groups with 300+ memberships
- 30 policy violations
- 5 integration sources
- Sample AI remediation plan

## Next steps
- [Full Installation Guide](./installation.md) for production deployment
- [Core Concepts](./concepts.md) to understand the ontology model
