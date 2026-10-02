const SUPABASE_URL = "https://ktmydhiwowybydplnqvc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bXlkaGl3b3d5YnlkcGxucXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2OTY3MTQsImV4cCI6MjA5NjI3MjcxNH0.TkbWITVkcWvYH87m5HP8NL4SoIIwC_fqrE6rd32YRP4";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
