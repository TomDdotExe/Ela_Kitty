# Ela Kitty – Stray Cat Reporting

Ela Kitty is a Next.js application for reporting stray cat sightings. It
uses Supabase for authentication and data storage, and Tailwind CSS for the
UI. Users can sign in via email or Google and mark the location of a sighting
on an interactive map.

## Required environment variables

Create a `.env.local` file with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

