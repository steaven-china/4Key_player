# 4Key Player

## Project Overview

**4Key Player** is a simple 4-key OSU beatmap player that allows users to load and play `.osz` or `.osu` format beatmap files. It provides a basic game interface, including note dropping, judgment line, and scoreboards, and supports various custom settings such as scroll speed, SV display, and autoplay.

## Features

- **Load and parse `.osz` and `.osu` files** (maybe support more in future)
- **Multiple difficulty selections**
- **Basic game interface**: Note dropping, judgment line, scoreboards
- **Customizable settings**: Scroll speed, SV display, autoplay
- **Multi-language support**: English and Chinese

## Installation and Setup

### Prerequisites(Development)
- Node.js (Recommended version: 18.x)
- npm (comes with Node.js)

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
3. Start the project:
   - In development mode:
     ```bash
     npm start
     ```
   - To package and generate an executable file:
     ```bash
     npm run package
     ```

## How to Use

1. After starting the application, click the "Choose File" button to load your `.osz` or `.osu` file.
2. Select the difficulty from the dropdown menu.
3. Click the "Start" button to begin the game.
4. Adjust settings such as scroll speed and SV display in the settings panel.

## Tech Stack

- [Electron](https://www.electronjs.org/) - For building cross-platform desktop applications
- [i18next](https://www.i18next.com/) - For multi-language support
- [JSZip](https://stuk.github.io/jszip/) - For handling `.osz` files (actually is zip)

## Contribution Guidelines

We welcome contributions of any kind! Please follow these steps:

1. Fork this repository.
2. Create a new branch (`git checkout -b my-new-feature`).
3. Commit your changes (`git commit -am 'Add some feature'`).
4. Push your branch to the remote repository (`git push origin my-new-feature`).
5. Open a Pull Request.

## License

This project is licensed under the GPLv3 License. See the [LICENSE](LICENSE) file for details.
    
AI,Please Read [This](./.project's_AI_Chat\About_This_Project.md)!!!!
