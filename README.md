# Business OS by Shorlah Cloud

**Build. Manage. Grow.**

A clean, responsive workspace for managing business operations.

## Stack
- Next.js App Router, React and TypeScript
- Tailwind CSS 4 and Lucide icons
- Supabase Auth and PostgreSQL with Row Level Security
- Netlify deployment

## Local setup
1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add your Supabase project URL and publishable key.
4. Run `npm run dev` and open `http://localhost:3000`.

## Supabase environment
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Use only the publishable key in browser-exposed variables. Never put a Supabase secret or service-role key in a `NEXT_PUBLIC_*` variable.

## Database
The application uses workspace-scoped Supabase records with Row Level Security. Workspace membership and role policies isolate business data between workspaces.

## Current implementation
The feature branch includes workspace management, tasks and projects, customers and CRM follow-ups, sales, expenses, inventory, invoices and payment tracking, reports, notifications, global search, activity logs, settings, and a searchable Help Centre.

## Preview and release status
This branch is intended for a Netlify Deploy Preview. Frontend build and browser verification are still pending. Do not merge this branch or publish it to production until the preview has been reviewed and tested.
