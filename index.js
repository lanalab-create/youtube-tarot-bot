// index.js
const { google } = require("googleapis");
const fetch = require("node-fetch");

// Load environment variables
require("dotenv").config();

const API_KEY = process.env.YOUTUBE_API_KEY;
const LIVE_CHAT_ID = process.env.LIVE_CHAT_ID;
const WEBHOOK_URL = process.env.DIALOGFLOW_WEBHOOK;

let nextPageToken = "";

async function getLiveChatMessages() {
  const youtube = google.youtube("v3");
  const res = await youtube.liveChatMessages.list({
    liveChatId: LIVE_CHAT_ID,
    part: "snippet,authorDetails",
    pageToken: nextPageToken,
    key: API_KEY,
  });

  nextPageToken = res.data.nextPageToken;

  const messages = res.data.items || [];
  for (const msg of messages) {
    const text = msg.snippet.displayMessage;
    const user = msg.authorDetails.displayName;

    // Skip bot messages to avoid loops
    if (msg.authorDetails.isChatModerator || msg.authorDetails.isChatOwner) continue;

    // Send to webhook
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    });
    const data = await response.json();

    const reply = `@${user} ${data.response}`;
    await sendMessage(reply);
  }

  // Wait and repeat
  setTimeout(getLiveChatMessages, 6000);
}

async function sendMessage(message) {
  const youtube = google.youtube("v3");
  await youtube.liveChatMessages.insert({
    part: "snippet",
    key: API_KEY,
    requestBody: {
      snippet: {
        liveChatId: LIVE_CHAT_ID,
        type: "textMessageEvent",
        textMessageDetails: { messageText: message },
      },
    },
  });
}

// Start the loop
getLiveChatMessages();
