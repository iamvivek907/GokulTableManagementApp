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

// Create dist directory if it doesn't exist
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

// Read index.html
const indexPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Replace all occurrences of placeholders using global regex
html = html.replace(/\{\{ SUPABASE_URL \}\}/g, SUPABASE_URL);
html = html.replace(/\{\{ SUPABASE_ANON_KEY \}\}/g, SUPABASE_ANON_KEY);

// Write to dist directory instead of overwriting source
const distIndexPath = path.join(distPath, 'index.html');
fs.writeFileSync(distIndexPath, html, 'utf8');

// Copy other necessary files to dist
const filesToCopy = [
  'manifest.json',
  'service-worker.js',
  'api-client-supabase.js',
  'supabase-client.js',
  'bill-printer.js',
  'state-manager.js',
  'icon-192.png',
  'icon-512.png'
];

filesToCopy.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(distPath, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
  }
});

console.log('✅ Build complete - environment variables injected into dist/index.html');
console.log(`   SUPABASE_URL: ${SUPABASE_URL ? '✅ Set' : '❌ Not set'}`);
console.log(`   SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set'}`);
console.log('   Output directory: dist/');

