## Overview
This documentation describes the project structure and setup for interactive art and game projects.

## Project Structure

### Main Directory Structure
The project follows this structure:
```
avanderrest.github.io/
├── index.html          # Main landing page
├── style.css          # Main stylesheet
├── main.js            # Main JavaScript
├── wall/              # Project wall directory
│   ├── tiles.json     # Project wall configuration
│   └── partials/     # Wall template fragments
└── lib/               # Shared libraries
    └── touch.css      # Touch-related styles
```

### Project Tile Structure
Each project is represented as a tile in the wall, following this pattern:
```
<project-slug>/
├── sim.js             # Game logic (Node.js)
├── view.js            # User interface
└── PLAN.md            # Project documentation
```

## Project Types

### Game Projects
Examples of game projects in the wall:
- `image-studio/` - Interactive image manipulation
- `neon-roll/` - Digital art experiment
- `marble-run/` - Physics-based game
- `blackout/` - Interactive puzzle game
- `hollowmarch/` - Exploration game

### Photo Journals
Examples of photo-based projects:
- `about-card/` - Photographer profile
- `butterflies-and-grasshoppers/` - Nature photography
- `ducks/` - Wildlife imagery
- `summer-sun/` - Landscape photography
- `the-forest/` - Nature documentation

## Development Commands

### Building the Wall
Generate or update the wall tiles:
```bash
node tools/build-wall.js
```

### Testing a Project
Run tests for a specific project:
```bash
node test/run.js <project-slug>
```

### Local Development
Serve the site for local testing:
```bash
python -m http.server 8010
```

## AI and Project Creation

### AI Tools and Project Creation
This project was created with the assistance of advanced AI tools, specifically Claude 2 and DeepSeek, which played a crucial role in the design, development, and documentation process. These tools were used to:

1. **Generate Initial Project Structure**:
   - Claude 2 provided the foundational structure for the project, including folder layouts, file organization, and initial code templates.
   - DeepSeek was used for multi-step reasoning to refine the project's architecture and ensure logical flow.

2. **Code Generation and Assistance**:
   - Claude 2 was utilized for general-purpose code generation, including game logic, user interface code, and documentation.
   - DeepSeek handled complex problem-solving, debugging, and multi-step reasoning during the development process.

3. **Documentation and Planning**:
   - AI tools were used to draft and refine project documentation, including this README file, design plans (`PLAN.md`), and other technical documentation.

## AI Components
The project was initially created with Claude Opus and after a month transitioned to using deepseek.

### Primary Chat & Code Generation
- **Model:** `qwen2.5-coder:14b`
- **Role:** Handles general chat architecture, code syntax generation, and workspace edits.

### Advanced Debugging & Reasoning
- **Model:** `deepseek-r1:14b`
- **Role:** Specializes in multi-step logical reasoning and complex problem-solving.

### Workspace Vectorization (RAG)
- **Model:** `nomic-embed-text:latest`
- **Role:** Manages local codebase context and semantic searching.

## License
This project is licensed under the GNU General Public License, version 3 (GPL-3.0), unless otherwise noted. You may not use, copy, modify, or distribute this software except in compliance with the terms of the GPL-3.0.

You can find the full text of the license here: [GNU GPL-3](https://www.gnu.org/licenses/gpl-3.0.html).

If you wish to use this software in a way not covered by the GPL-3.0, please contact the copyright holder to discuss a commercial license.
