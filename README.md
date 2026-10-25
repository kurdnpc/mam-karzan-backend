# Mam Karzan API

Backend for the Mam Karzan store: Express 5, Prisma 7 and PostgreSQL. It serves the public catalogue, the admin dashboard API (JWT cookie auth with owner / manager / staff roles) and uploaded images.

## Setup

```bash
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, CORS_ORIGIN, PUBLIC_URL, WEB_URL, REVALIDATE_SECRET
npm install                   # also generates the Prisma client
npm run db:deploy             # apply migrations
npm run db:seed               # first time only: owner account and demo data
npm run dev                   # http://localhost:4000
```

Change the seeded owner password after the first login (or set `SEED_OWNER_PHONE` / `SEED_OWNER_PASSWORD` before seeding).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload |
| `npm start` | Start for production |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:seed` | Seed owner account and demo data |
| `npm run db:studio` | Browse the database |

## API overview

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/password`
- Public: `/api/settings`, `/api/categories`, `/api/categories/:main`, `/api/items`, `/api/items/:code`, `/api/brands`, `/api/testimonials`, `/api/faqs`, `POST /api/whatsapp-click`
- Admin (auth required): `/api/admin/stats`, `/categories`, `/items`, `/discounts`, `/settings`, `/content/*`, `/users`, `POST /upload`
- Uploaded images: `/uploads/*` (resized to WebP on upload)

After any admin change the API calls the website's `/revalidate` endpoint (`WEB_URL` + `REVALIDATE_SECRET`) so the public site updates immediately.

## Docker

```bash
docker build -t mam-karzan-api .
docker run -p 4000:4000 --env-file .env -v mk_uploads:/app/uploads mam-karzan-api
```

The container applies pending migrations on start.
