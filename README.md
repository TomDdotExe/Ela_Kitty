# Ela Kitty

Ela Kitty is a simple Next.js application for reporting and viewing stray cat locations. It uses Leaflet for map rendering and Supabase for authentication and data storage.

## Environment Variables

Create a `.env.local` file and provide the following variables so the application can connect to Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your Supabase anon key>
```

