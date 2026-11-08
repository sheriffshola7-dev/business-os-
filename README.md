# Business OS by Shorlah Cloud

**Build. Manage. Grow.**

A clean, responsive workspace for managing business operations.

## Stack
- Next.js App Router, React and TypeScript
- Tailwind CSS 4 and Lucide icons
- Supabase Auth and PostgreSQL with Row Level Security
- Vercel-ready

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
The initial schema includes workspaces, workspace members, tasks, customers, expenses, sales and inventory items. Row Level Security is enabled on every table. New users receive a private workspace after their first successful sign-in.

## Current status
Email signup/sign-in and the database foundation are connected in the codebase. The dashboard still contains clearly labelled preview/sample content; the next implementation step is wiring dashboard modules to live workspace records.
