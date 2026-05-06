# Pro Chat Secure

A modern, secure chat application featuring end-to-end encrypted messaging and real-time voice calls.

## Features

- **End-to-End Encryption**: Messages are encrypted using RSA-OAEP and AES-GCM
- **Real-Time Messaging**: Instant messaging with Socket.IO
- **Voice Calls**: WebRTC-based voice communication
- **User Authentication**: Secure password hashing with bcrypt
- **Avatar Support**: Custom user avatars
- **Responsive Design**: Works on desktop and mobile devices
- **Backward Compatibility**: Supports legacy message formats

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser to `http://localhost:3000`

## GitHub Setup

If you want to store this project on GitHub:

1. Initialize git if needed:
   ```bash
   git init
   git add .
   git commit -m "Initial project commit"
   ```
2. Create a repository at `github.com`
3. Add the remote and push:
   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```

## Deploy to Cloud

For always-on usage, deploy the app to a cloud host instead of relying on your local machine.

Recommended hosts:
- Railway
- Render
- Fly.io
- DigitalOcean App Platform
- Heroku

A sample deployment flow:

1. Push the project to GitHub
2. Connect the repo to the cloud host
3. Set the start command to:
   ```bash
   npm start
   ```
4. Ensure your cloud host uses Node 14+ or newer

### Temporary public access with ngrok

If you want a temporary public URL while developing locally:

```bash
npm run ngrok
```

This is useful for testing, but it does not make the app permanently available when your PC is off.

## Usage

1. Register a new account with a username and password
2. Login to access the chat
3. Select a user from the online list to start chatting
4. Use the voice call feature for audio communication
5. Messages are automatically encrypted for secure communication

## Security

- Passwords are hashed using bcrypt
- Private keys are encrypted with AES-GCM using PBKDF2-derived keys
- Messages are encrypted with hybrid RSA+AES encryption
- No plaintext messages are stored on the server

## Technologies Used

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5, CSS3, JavaScript, Web Crypto API
- **Encryption**: RSA-OAEP, AES-GCM, PBKDF2
- **Real-Time**: WebRTC, Socket.IO

## Development

The application uses modern web standards and requires a browser that supports:
- Web Crypto API
- WebRTC
- ES6+ JavaScript

## License

ISC License

## Author

Jamshed Rajputt