import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://dlncseadirjiwdnvjyok.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbmNzZWFkaXJqaXdkbnZqeW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NzY2ODEsImV4cCI6MjA5NDQ1MjY4MX0.jj6rH0rb3P5BDVNU9GyMAV2KFX9M8OSEdD4nPnZtLjU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
