# ChatTOC

A lightweight Chrome extension that adds a Table of Contents (TOC) sidebar to ChatGPT conversations.

## Features

- Automatically generates a TOC from user prompts
- Click any item to jump to that prompt
- Hover to preview the full message
- Automatically updates when new prompts are sent
- Supports long conversations (100+ prompts)
- Detects image and file prompts

## Installation

1. Download or clone this repository.
2. Open Chrome and navigate to:

   chrome://extensions

3. Enable **Developer Mode**.
4. Click **Load unpacked**.
5. Select the extension folder.

## Usage

- Open any ChatGPT conversation.
- The ChatTOC sidebar will appear on the right side.
- Click a prompt to jump to it.
- Hover over a prompt to view the full content.
- New prompts are automatically added to the TOC.

## Tech Stack

- JavaScript
- Chrome Extension (Manifest V3)
- DOM Manipulation
- Fetch Hooking
- Server-Sent Events (SSE)

## Notes

ChatTOC runs entirely in the browser.

No conversation data is stored, transmitted, or shared with any external service.

## License

MIT
