#!/usr/bin/env node

// Build script to inject environment variables into index.html for GitHub Pages deployment

const fs = require('fs');
const path = require('path');

// Read environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️  Warning: SUPABASE_URL or SUPABASE_ANON_KEY not set in environment variables');
  console.warn('⚠️  The application will work in offline mode with localStorage');
}

// Read index.html
const indexPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Replace placeholders
html = html.replace('{{ SUPABASE_URL }}', SUPABASE_URL);
html = html.replace('{{ SUPABASE_ANON_KEY }}', SUPABASE_ANON_KEY);

// Write back
fs.writeFileSync(indexPath, html, 'utf8');

console.log('✅ Build complete - environment variables injected into index.html');
console.log(`   SUPABASE_URL: ${SUPABASE_URL ? '✅ Set' : '❌ Not set'}`);
console.log(`   SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set'}`);
