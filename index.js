const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ENV variables
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;
const LIVE_CHAT_ID = process.env.LIVE_CHAT_ID;
const DIALOGFLOW_WEBHOOK_URL = process.env.DIALOGFLOW_WEBHOOK_URL;

let accessToken = null;
let nextPageToken = null;

async function refreshAccessToken() {
  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: 'refresh_token',
      },
    });
    accessToken = response.data.access_token;
    console.log('✅ Access token refreshed!');
  } catch (error) {
    console.error('❌ Error refreshing access token:', error.response?.data || error.message);
  }
}

async function getLiveChatMessages() {
  try {
    const params = {
      liveChatId: LIVE_CHAT_ID,
      part: 'snippet,authorDetails',
    };

    if (nextPageToken) {
      params.pageToken = nextPageToken;
    }

    const response = await axios.get('https://www.googleapis.com/youtube/v3/liveChat/messages', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });

    const messages = response.data.items || [];
    nextPageToken = response.data.nextPageToken;

    for (const message of messages) {
      const text = message.snippet.displayMessage;
      const author = message.authorDetails.displayName;
      console.log(`${author}: ${text}`);

      // Send message to Dialogflow webhook
      const dialogflowResponse = await axios.post(DIALOGFLOW_WEBHOOK_URL, {
        message: text,
        author: author,
      });

      const reply = dialogflowResponse.data.reply || dialogflowResponse.data.fulfillmentText;
      if (reply) {
        await sendMessageToChat(reply);
      }
    }
  } catch (error) {
    const message = error.response?.data || error.message;
    console.error('❌ Error fetching messages:', message);

    if (message?.error?.message === 'page token is not valid.') {
      console.warn('⚠️ Resetting nextPageToken due to invalid page token.');
      nextPageToken = null;
    }

    if (error.response?.status === 401) {
      console.log('🔁 Token expired, refreshing...');
      await refreshAccessToken();
    }
  }
}

async function sendMessageToChat(message) {
  try {
    await axios.post(
      'https://www.googleapis.com/youtube/v3/liveChat/messages',
      {
        snippet: {
          liveChatId: LIVE_CHAT_ID,
          type: 'textMessageEvent',
          textMessageDetails: { messageText: message },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: { part: 'snippet' },
      }
    );
    console.log('🤖 Bot:', message);
  } catch (error) {
    console.error('❌ Error sending message:', error.response?.data || error.message);
  }
}

// Home route
app.get('/', (req, res) => {
  res.send('🔮 YouTube Tarot Bot is running!');
});

app.listen(PORT, async () => {
  console.log(`🚀 Server is live on port ${PORT}`);
  await refreshAccessToken(); // Initial token refresh
  setInterval(refreshAccessToken, 55 * 60 * 1000); // Refresh every 55 minutes
  setInterval(getLiveChatMessages, 8000); // Poll every 8 seconds
});
