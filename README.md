# AMLL Telegram Mini App Player 🎵

Animated Apple Music-style lyrics visualizer and web player designed for Telegram Mini Apps (WebApps). Built with Vite, TypeScript, PixiJS, and the [@applemusic-like-lyrics](https://github.com/amll-dev/applemusic-like-lyrics) ecosystem.

## Features

- 🍎 **Apple Music Style Karaoke**: Syllable-by-syllable synchronized dynamic lyrics with spring physics.
- 🎨 **Fluid WebGL Mesh Gradient**: Dynamic animated background automatically tinted by album art colors.
- 📱 **Telegram Mini App SDK**: Full viewport expansion, native Telegram dark/light theme integration, and haptic feedback.
- ⏱ **Interactive Navigation**: Tap any line of the lyrics to seek audio immediately.
- ⚡ **Lightweight & Fast**: Built with Vite and pure TypeScript, served as static assets.

## Tech Stack

- **Framework**: Vite + TypeScript
- **Lyrics Engine**: `@applemusic-like-lyrics/core` & `@applemusic-like-lyrics/lyric`
- **Graphics**: PixiJS (`pixi.js`)
- **Integration**: Telegram WebApp SDK (`@telegram-apps/sdk` / `telegram-web-app.js`)

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** in compliance with the `@applemusic-like-lyrics` ecosystem license requirements. See [LICENSE](LICENSE) for details.
