#!/bin/bash
# Create simple SVG icons and convert to PNG

# Create 192x192 icon (SVG)
cat > icon-temp.svg << 'SVGEOF'
<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
  <rect width="192" height="192" fill="#208091"/>
  <text x="96" y="115" font-family="Arial" font-size="100" fill="white" text-anchor="middle">🍽️</text>
</svg>
SVGEOF

# For now, create placeholder text files that will be converted to actual images
echo "PWA Icon 192x192 - Restaurant Icon" > icon-192.png
echo "PWA Icon 512x512 - Restaurant Icon" > icon-512.png
echo "Screenshot placeholder" > screenshot.png

echo "Icon placeholders created. In production, replace these with actual PNG images."
