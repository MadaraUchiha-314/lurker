# Lurker

An agent that allows you to chat with any website by monitoring network calls with an AI-powered interface.

## Project Structure

Lurker is organized as a monorepo with npm workspaces:

- `core/`: Shared TypeScript types and utilities
- `agent/`: Backend server that processes network calls and generates responses
- `extension/`: Chrome extension that captures network traffic and provides a UI

## Prerequisites

- Node.js (v18 or later recommended)
- npm (v8 or later recommended)
- Chrome browser

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/MadaraUchiha-314/lurker.git
cd lurker
npm install
```

## Building the Project

Build all packages in the workspace:

```bash
npm run build -ws
```

## Running the Agent Server

The agent server processes network calls and generates responses using LLM technology:

```bash
npm run start -w @lurker-agent/agent
```

The server will start on http://localhost:3000 by default.

## Loading the Chrome Extension

1. Build the extension:

```bash
npm run build -w @lurker-agent/extension
```

2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `extension/dist` directory from this project
5. The Lurker extension icon should appear in your browser toolbar

## Development Workflow

For active development with file watching:

```bash
# Start the agent server in watch mode
npm run dev -w @lurker-agent/agent

# In another terminal, start the extension in watch mode
npm run dev -w @lurker-agent/extension
```

When making changes to the extension, you'll need to reload it in Chrome:
1. Go to `chrome://extensions/`
2. Find the Lurker extension
3. Click the refresh icon

## Using the Extension

1. Open the side panel by clicking on the Lurker icon in your browser toolbar
2. Browse any website as you normally would
3. The extension will capture network traffic automatically
4. Use the chat interface in the side panel to ask questions about the captured network calls
5. Toggle recording on/off using the switch in the panel header
6. Clear captured data with the "Clear Data" button

## Features

- Captures and analyzes network requests and responses
- Chat interface to query the captured network data
- Dark/light theme toggle
- Recording toggle to enable/disable network monitoring
- Limit to 100 most recent network calls for optimal performance

## License

MIT
