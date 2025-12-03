# Temprix (RustMacTimeTrackingHelper)

A macOS activity tracker built with Tauri and Rust that automatically logs active window titles and identifies ticket numbers for time tracking purposes.

## Overview

Temprix runs in the background and monitors your active window to help track time spent on different tasks. It specifically looks for ticket numbers (matching the pattern `#\d+`) in window titles and logs this activity.

## Features

- **Automatic Window Detection**: Uses accessibility APIs to detect the currently active window.
- **Ticket Parsing**: Automatically extracts ticket numbers (e.g., `#1234`) from window titles.
- **Local Logging**: securely logs activity to JSON files in `~/Documents/ActivityLogs/`.
- **System Tray Integration**: Unobtrusive menu bar app.
- **Privacy Focused**: All data remains local on your machine.

## Prerequisites

- **macOS**: This application is designed for macOS.
- **Node.js** & **npm**: For the frontend build process.
- **Rust**: For the Tauri backend.

## Development Setup

1. **Install Dependencies**
   ```bash
   cd src
   npm install
   ```

2. **Run in Development Mode**
   ```bash
   npm run tauri dev
   ```

## Permissions

**Important**: On macOS, this application requires **Screen Recording** permissions to detect the active window title from other applications.

1. When you first run the app, macOS may prompt you to grant permissions.
2. If not prompted, go to **System Settings > Privacy & Security > Screen Recording**.
3. Add/Enable the application (or your terminal if running in dev mode).

## Project Structure

- `src/`: Frontend source code (HTML/JS/CSS).
- `src-tauri/`: Rust backend code.
  - `tracking.rs`: Logic for window detection and logging.
  - `lib.rs`: Main entry point and system tray management.

## License

[Your License Here]
