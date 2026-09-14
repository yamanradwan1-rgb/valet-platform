# VAYLET Employee Native — Branding Source Assets

Owner-approved branding source set prepared from the supplied VAYLET artwork on 2026-09-14.

These files are intentionally committed as SVG source assets so the Native branding patch can generate deterministic high-resolution PNG outputs without redesigning the mark.

## Source files

- `vaylet-v.svg` — master colored V symbol.
- `app-icon.svg` — full legacy icon composition: V symbol + white/light-blue background.
- `adaptive-icon-background.svg` — adaptive icon background only.
- `adaptive-icon-foreground.svg` — colored V with Android-safe transparent padding.
- `splash-logo.svg` — colored V on transparent canvas for the splash image.
- `monochrome-icon.svg` — one-color V silhouette for Android themed icons. Source is black for visibility; raster/output color may be controlled by Android/the build pipeline.
- `notification-icon.svg` — white V silhouette on transparency for Android notification small-icon generation.

## Locked visual decisions

- Do not add the word `VAYLET` to the splash.
- Do not add slogans or decorative text.
- Splash background color is pure white: `#FFFFFF`.
- Keep the official V geometry/proportions and blue treatment; do not redesign the symbol.
- Adaptive foreground must retain generous safe padding for circle, squircle, rounded-square, and other launcher masks.
- App icon uses the clean white/light-blue lower-wave background supplied by the Owner.
- Android notification icon must remain a single-color silhouette with transparent background.

## Native implementation guidance

For Expo/Android configuration, rasterize these sources to deterministic PNG files in the Native assets directory as needed. Prefer at least `1024x1024` for app/adaptive/splash source PNGs; generate notification densities through the normal Android/Expo pipeline.

Expected mapping conceptually:

- `icon` -> rasterized `app-icon.svg`
- `android.adaptiveIcon.foregroundImage` -> rasterized `adaptive-icon-foreground.svg`
- `android.adaptiveIcon.backgroundImage` -> rasterized `adaptive-icon-background.svg` (or equivalent supported configuration)
- Android monochrome/themed icon -> `monochrome-icon.svg`
- splash image -> rasterized `splash-logo.svg`
- splash background -> `#FFFFFF`
- notification small icon -> rasterized `notification-icon.svg`

The patch should also configure/verify `expo-splash-screen` and keep the branded splash visible until the initial React surface is ready, without introducing a blank gray/dark transition.

Do not build an APK merely to add these sources. Physical verification belongs to the later combined final APK.
