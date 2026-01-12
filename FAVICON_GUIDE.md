# Favicon Generation Guide

## Current Status
✅ SVG favicon created: `public/favicon.svg`
- White benzene structure on black rounded rectangle background

## Required PNG Favicons

You need to create these PNG files from the SVG:

1. **favicon.ico** (multi-size ICO file)
   - Contains: 16x16 and 32x32
   - Location: `public/favicon.ico`

2. **favicon-16x16.png**
   - Size: 16x16 pixels
   - Location: `public/favicon-16x16.png`

3. **favicon-32x32.png**
   - Size: 32x32 pixels
   - Location: `public/favicon-32x32.png`

4. **apple-touch-icon.png**
   - Size: 180x180 pixels
   - Location: `public/apple-touch-icon.png`

## How to Generate

### Option 1: Online Tool (Easiest)
1. Visit: https://realfavicongenerator.net/
2. Upload `public/favicon.svg`
3. Configure settings:
   - iOS: 180x180
   - Android: 192x192 (optional)
   - Windows: 16x16, 32x32
4. Download and extract files to `public/` folder

### Option 2: ImageMagick (Command Line)
```bash
# Install ImageMagick first (if not installed)

# Generate 16x16
convert favicon.svg -resize 16x16 favicon-16x16.png

# Generate 32x32
convert favicon.svg -resize 32x32 favicon-32x32.png

# Generate 180x180 (Apple)
convert favicon.svg -resize 180x180 apple-touch-icon.png

# Generate ICO file (combines 16x16 and 32x32)
convert favicon-16x16.png favicon-32x32.png favicon.ico
```

### Option 3: Design Tool
- Use Figma, Photoshop, or GIMP
- Open `favicon.svg`
- Export at required sizes
- Save as PNG/ICO

## Verification

After creating files, verify:
1. All files are in `public/` folder
2. File sizes are correct
3. Images are clear and readable at small sizes
4. Test in browser: Clear cache and reload

## Current SVG Source

The SVG favicon is at: `public/favicon.svg`
- Black rounded rectangle background (#1a1a1a)
- White benzene ring structure
- Double bonds indicated
