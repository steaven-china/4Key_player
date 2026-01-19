# 4Key Player

## Project Overview

**4Key Player** is a simple 4-key beatmap player that allows users to load and play `.osz`, `.osu`, `.pcz`, and `.json` format beatmap files. It provides a basic game interface, including note dropping, judgment line, and scoreboards, and supports various custom settings such as scroll speed, SV display, and autoplay.

## Features

- **Load and parse multiple formats**: `.osz`, `.osu`, `.pcz`, and `.json` files
- **Multiple difficulty selections**
- **PCZ format support**: Package Chart Zip format containing JSON beatmaps, audio, and background images
- **Basic game interface**: Note dropping, judgment line, scoreboards
- **Customizable settings**: Scroll speed, SV display, autoplay
- **Multi-language support**: English and Chinese (maybe More in future)

## Installation and Setup

### Prerequisites(Development)
- Node.js (Recommended version: 18.x)
- npm (comes with Node.js)(or pnpm)

### Steps
1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/steaven-china/4key_player.git
   cd 4key_player
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build The Project:
    ```bash
   npm run build
   ```
4. Start the project:
   - In development mode:
     ```bash
     npm start
     ```
   - To package and generate an executable file:
     ```bash
     npm run package
     ```

## How to Use

1. After starting the application, click the "Choose File" button to load your beatmap file. Supported formats include:
   - `.osz` - OSU beatmap package (zip format)
   - `.osu` - OSU beatmap file
   - `.pcz` - PCZ format (Package Chart Zip containing JSON beatmaps, audio, and images)
   - `.json`, `.4key.json`, `.4key` - JSON beatmap files
2. Select the difficulty from the dropdown menu.
3. Click the "Start" button to begin the game.
4. Adjust settings such as scroll speed and SV display in the settings panel.

## Tech Stack

- [Electron](https://www.electronjs.org/) - For building cross-platform desktop applications
- [i18next](https://www.i18next.com/) - For multi-language support
- [JSZip](https://stuk.github.io/jszip/) - For handling `.osz` files (actually is zip)

## PCZ Format Support

4Key Player now supports the PCZ (Package Chart Zip) format, which is a ZIP file containing:

1. **Beatmap file** (required): JSON format (`.4key.json`, `.json`, `.4key`) or `.osu` file
2. **Audio file** (optional): `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`
3. **Background image** (optional): `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`

### Creating PCZ Files

To create a PCZ file:
1. Prepare your JSON beatmap, audio file, and background image
2. Zip all files together
3. Rename the `.zip` extension to `.pcz`

Example structure:
```
my_chart.pcz
├── chart.4key.json  # JSON beatmap
├── music.mp3        # Audio file
└── background.png   # Background image
```

For detailed documentation, see [docs/PCZ_FORMAT.md](docs/PCZ_FORMAT.md).

## OSZ to PCZ Converter

We provide a conversion tool to help migrate existing `.osz` files to the new `.pcz` format:

### Using the Converter

```bash
# Basic conversion
node examples/osz_to_pcz_converter.js input.osz

# Convert with custom output name
node examples/osz_to_pcz_converter.js input.osz output.pcz

# Batch conversion
for file in *.osz; do node examples/osz_to_pcz_converter.js "$file"; done
```

### Features
- Converts `.osz` (OSU format) to `.pcz` (JSON format)
- Preserves all beatmap data, audio files, and background images
- Supports multiple difficulty levels within a single file
- Intelligent file matching and error handling

For detailed usage instructions, see [examples/OSZ_TO_PCZ_README.md](examples/OSZ_TO_PCZ_README.md).

Sincerely say thank you!

## Contribution Guidelines

We welcome contributions of any kind! Please follow these steps:

1. Fork this repository.
2. Create a new branch (`git checkout -b my-new-feature`).
3. Commit your changes (`git commit -am 'Add some feature'`).
4. Push your branch to the remote repository (`git push origin my-new-feature`).
5. Open a Pull Request.

## License

This project is licensed under the GPLv3 License. See the [LICENSE](LICENSE) file for details.

## additionally
- This Project Build With Super AI Power.
- The New Feature Format will be done in the future.
- The Track will to Be Spin in 2d(?)

## Todo:
1. Chart Editor
2. Add more features to PCZ JSON Format
3. Improve PCZ format validation and error handling

## Tools and Utilities

### Conversion Tools
- **OSZ to PCZ Converter**: Convert existing `.osz` files to the new `.pcz` format
- **PCZ Creation Script**: Create `.pcz` files from JSON beatmaps, audio, and images

### Documentation
- [PCZ Format Documentation](docs/PCZ_FORMAT.md) - Complete specification of the PCZ format
- [Parser Architecture](docs/parser-architecture.md) - Technical details of the parsing system
- [Conversion Guide](examples/OSZ_TO_PCZ_README.md) - Step-by-step conversion instructions

## About `.pcz`
May just a piece chart's of `zip`.

So, if you want to create a chart with `.pcz`,
the format would be this:
```terminaloutput
chart.pcz
├── sample.4key.json
├── test.mp3
└── bg.png
```

### This WIP!!!