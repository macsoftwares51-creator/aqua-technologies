# Aqua Solar Technologies

Express + MongoDB website with a protected admin editor at `/admin.html`.

## Setup

Create a `.env` file (never commit it):

```env
MONGO_URI=mongodb+srv://...
JWT_SECRET=generate-a-long-random-secret-at-least-32-characters
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Install and start:

```bash
npm install
npm start
```

Create or rotate the administrator with a password of at least 12 characters:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='use-a-long-unique-password' npm run create-admin
```

Open `http://localhost:3000/admin.html`. The editor stores the complete content JSON in MongoDB, records changes in `AuditLog`, and supports signed direct image uploads to Cloudinary. The public site can read the current document at `/api/site-content`.

## Security notes

Admin sessions use an HTTP-only, `SameSite=Strict` cookie with an 8-hour JWT expiry. Helmet headers, origin checks, login/write/lead rate limits, input length limits, optimistic versioning, password hashing, and audit logging are enabled. Deploy behind HTTPS and use a strong secret. The default rate limiter is in-memory; use a shared Redis-backed limiter when running multiple server instances.
