# FlipBook API (Express + Prisma + Supabase)

## Prerequisites
- Node.js 20+
- Supabase project (PostgreSQL)
- LibreOffice CLI (`soffice`) for office formats
- Poppler (`pdftoppm`) for PDF rasterization

## Environment
1. Copy `.env.example` to `.env`
2. Set:
   - `DATABASE_URL`: Supabase pooler URL (`aws-0-<region>.pooler.supabase.com:6543`)
   - `DIRECT_URL`: direct DB URL (`db.<project-ref>.supabase.co:5432`) for migrations

## Commands
- `npm run dev` start API + DB queue worker loop
- `npm run build` compile TypeScript
- `npm run prisma:generate` generate Prisma client
- `npm run prisma:migrate` apply migrations

## CircleCI Docker Hub
- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_TOKEN` or `DOCKERHUB_PASSWORD`: Docker Hub access token/password
- `DOCKERHUB_REPOSITORY` optional full image name, for example `username/agreader-api`

The CircleCI workflow builds the API, builds the Docker image, and pushes it to Docker Hub. Branch builds are tagged with `<branch>-<short-sha>`, `main`/`master` also pushes `latest`, and git tags like `v1.2.3` also push `1.2.3`.

## API
- `POST /v1/documents/upload` multipart (`file`)
- `GET /v1/documents/:id`
- `GET /v1/documents/:id/progress`
- `GET /v1/documents/:id/pages`
- `POST /v1/documents/:id/retry`
- `DELETE /v1/documents/:id`

## Frontend flow (`EditorPreview`)
1. Upload file
2. Poll `/progress` until `status=ready`
3. Fetch `/pages` and render page image URLs in turn.js
