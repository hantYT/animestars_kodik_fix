#!/bin/bash

echo "🚀 AnimeStars Kodik Optimizer Release Builder"
echo ""

echo "📦 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🔢 Updating version..."
npm run version
if [ $? -ne 0 ]; then
    echo "❌ Failed to update version"
    exit 1
fi

echo ""
echo "🏗️ Building release..."
npm run release
if [ $? -ne 0 ]; then
    echo "❌ Failed to build release"
    exit 1
fi

echo ""
echo "✅ Release build complete!"
echo "📁 Check the releases/ folder for the ZIP file"
echo ""
echo "📋 Next steps:"
echo "1. Test the extension manually"
echo "2. Commit and push changes"
echo "3. Create GitHub release and upload the ZIP"
