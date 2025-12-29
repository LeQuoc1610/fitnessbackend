# GymBro Back-end

## Quick start

1) Create `.env`

Copy `.env.example` to `.env` and edit values.

2) Install deps

```bash
npm install
```

3) Run API

```bash
npm run dev
```

API runs on `http://localhost:8080` by default.

## Endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)
- `GET /api/profiles/:uid`
- `PUT /api/profiles/me` (Bearer token)
- `GET /api/threads?limit=20&cursor=...` (Bearer token)
- `POST /api/threads` (Bearer token)
- `POST /api/threads/:id/like` (Bearer token)
- `POST /api/threads/:id/save` (Bearer token)
- `GET /api/threads/:id/comments` (Bearer token)
- `POST /api/threads/:id/comments` (Bearer token)
- `GET /api/workouts/me` (Bearer token)
- `POST /api/workouts` (Bearer token)
- `GET /api/prs/me` (Bearer token)
- `POST /api/prs` (Bearer token)
