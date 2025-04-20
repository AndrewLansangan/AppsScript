#!/bin/bash

# Sync script: pulls from clasp, commits to Git, and pushes

set -e  # Exit on error

# Optional: navigate to project root if needed
# cd ~/Projects/my-gas-project

echo "🔄 Pulling latest changes from Google Apps Script..."
clasp pull

echo "📁 Staging files..."
git add .

echo "📝 Committing..."
git commit -m "🔄 Sync: pulled from clasp on $(date '+%Y-%m-%d %H:%M:%S')"

echo "🚀 Pushing to GitHub..."
git push

echo "✅ Sync complete."
