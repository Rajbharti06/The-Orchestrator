# The Orchestrator

A minimal orchestrator system that accepts natural language prompts and generates complete backend code using AI.

## Features

- CLI for receiving prompts.
- OpenAI integration (GPT-4) with senior backend architect system messaging.
- Automatic folder structure creation.
- Robust error handling and logging.
- Unit tests with Jest.

## Setup

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Environment Variables:**
    Create a `.env` file in the root directory and add your OpenAI API key:
    ```env
    OPENAI_API_KEY=your_openai_api_key_here
    NODE_ENV=development
    ```

## Usage

To generate code, run the following command:

```bash
node orchestrator.js "build login system"
```

The orchestrator will:
1.  Receive the prompt.
2.  Call the OpenAI API.
3.  Parse the response and write the generated code to the `src/` folder.
4.  Log every step to the console and a rotating log file in the `logs/` directory.

## Testing

Run unit tests using Jest:

```bash
npm test
```

## Folder Structure

The orchestrator creates files in a structure like this:
- `src/routes/`
- `src/models/`
- `src/middleware/`
- `src/app.js`

## Logging

Logs are stored in the `logs/` directory with daily rotation.
- Console: Simplified, colorized output.
- File: Detailed JSON format with timestamps.
