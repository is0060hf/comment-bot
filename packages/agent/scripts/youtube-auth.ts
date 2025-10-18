import { createServer } from 'http';
import { parse } from 'url';
import { google } from 'googleapis';
import open from 'open';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in .env file');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

async function getRefreshToken() {
  // Generate the auth URL with access_type=offline
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to ensure refresh token is returned
  });

  console.log('Opening browser for YouTube authentication...');
  console.log('If browser does not open automatically, visit this URL:');
  console.log(authUrl);

  // Create local server to handle OAuth callback
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || '', true);

    if (parsedUrl.pathname === '/oauth2callback') {
      const code = parsedUrl.query.code as string;

      if (code) {
        try {
          // Exchange authorization code for tokens
          const { tokens } = await oauth2Client.getToken(code);

          if (tokens.refresh_token) {
            console.log('\n✅ Authentication successful!');
            console.log('\nYour refresh token is:');
            console.log('─'.repeat(60));
            console.log(tokens.refresh_token);
            console.log('─'.repeat(60));
            console.log('\nAdd this to your .env file:');
            console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);

            // Update .env file
            const envPath = path.join(__dirname, '..', '.env');
            let envContent = await fs.readFile(envPath, 'utf-8');

            if (envContent.includes('YOUTUBE_REFRESH_TOKEN=')) {
              envContent = envContent.replace(
                /YOUTUBE_REFRESH_TOKEN=.*/,
                `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`
              );
            } else {
              envContent += `\nYOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
            }

            await fs.writeFile(envPath, envContent);
            console.log('\n✅ .env file has been updated automatically!');

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
                  <h1 style="color: #4CAF50;">✅ Authentication Successful!</h1>
                  <p>Your refresh token has been saved to the .env file.</p>
                  <p>You can close this window and return to the terminal.</p>
                </body>
              </html>
            `);
          } else {
            throw new Error(
              'No refresh token received. Make sure you are authenticating for the first time.'
            );
          }
        } catch (error) {
          console.error('Error exchanging code for token:', error);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
                <h1 style="color: #f44336;">❌ Authentication Failed</h1>
                <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
                <p>Please check the terminal for more details.</p>
              </body>
            </html>
          `);
        }

        // Close server after handling request
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Error: No authorization code received');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  server.listen(3000, () => {
    console.log('Local server started on http://localhost:3000');
    console.log('Waiting for authentication...\n');

    // Open browser
    open(authUrl).catch(() => {
      console.log('Could not open browser automatically. Please visit the URL above.');
    });
  });
}

// Run the authentication flow
getRefreshToken().catch(console.error);
