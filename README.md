# HomeReader TTS Add-on for Home Assistant

HomeReader is a beautiful, self-contained, browser-based Text-to-Speech (TTS) add-on for Home Assistant. It reads your text aloud using natural-sounding voices provided by the Web Speech API directly in your browser. 

The application is completely privacy-respecting as all text processing and speech generation happen locally on your device—no data leaves your browser.

## Features

- **Beautiful UI:** A modern, elevated card-based design with a focus on usability and aesthetics.
- **Home Assistant Ingress:** Seamlessly integrates into your Home Assistant sidebar.
- **Natural Voices:** Utilizes the Web Speech API to provide access to your device's high-quality built-in voices.
- **Adjustable Settings:** Fine-tune the voice, reading speed (rate), pitch, and volume to match your preferences.
- **File Import:** Quickly load text from `.txt`, `.md`, `.html`, `.csv`, `.srt`, and other text-based files.
- **Reading Progress & Highlights:** Follow along visually as the text is read sentence by sentence.
- **Waveform Visualizer:** Enjoy dynamic visual feedback while the speech is playing.
- **Privacy First:** 100% local in-browser processing. No cloud services or external APIs are used for speech generation.

## Installation

### Method 1: Local Add-on (Development)
1. Copy this repository to your Home Assistant's `addons` directory (e.g., `/addons/ha-homereader-tts-addon` or your specific local add-ons path).
2. Go to **Settings > Add-ons > Add-on Store** in your Home Assistant UI.
3. Click the three dots in the top right corner and select **Check for updates**.
4. Scroll down to the "Local add-ons" section and click on **HomeReader TTS**.
5. Click **Install**.
6. After installation, click **Start**.
7. Enable **Show in sidebar** for easy access.

### Method 2: Custom Repository

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fmazillka%2Fha-homereader-tts-addon)

1. Click the button above to add this repository to your Home Assistant instance.
2. If the button doesn't work, go to **Settings > Add-ons > Add-on Store**.
3. Click the three dots in the top right corner and select **Repositories**.
4. Add the URL `https://github.com/mazillka/ha-homereader-tts-addon`.
5. Scroll down, find **HomeReader TTS**, and click **Install**.
6. Click **Start** and toggle **Show in sidebar**.

## Usage

1. Open **HomeReader** from your Home Assistant sidebar.
2. Paste or type text into the text area, or use the **Import** button to load a text file.
3. Select your preferred voice and adjust the Speed, Pitch, and Volume sliders in the **Voice Settings** panel.
4. Click the **Play** button to start reading. 
5. Use the **Stop**, **Pause**, or **Skip** buttons to control playback.

## Technology Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript
- **API:** Web Speech API (`SpeechSynthesis`)
- **Server:** Nginx (lightweight static file serving for Home Assistant)
- **Architecture:** Docker container via Home Assistant Add-on framework

## License

This project is licensed under the terms included in the `LICENSE` file.
