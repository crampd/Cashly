import Fastify from "fastify";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import Twilio from "twilio";
import fetch from "node-fetch";
import { saveCall, updateCallStatus, saveConversation, getPreviousTopics } from "./status.js";
import { initDb } from "./db.js";

dotenv.config();

const {
  ELEVENLABS_API_KEY,
  ELEVENLABS_AGENT_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TELEGRAM_BOT_WEBHOOK_URL,
} = process.env;

if (
  !ELEVENLABS_API_KEY ||
  !ELEVENLABS_AGENT_ID ||
  !TWILIO_ACCOUNT_SID ||
  !TWILIO_AUTH_TOKEN ||
  !TWILIO_PHONE_NUMBER
) {
  console.error("Missing required environment variables");
  throw new Error("Missing required environment variables");
}

await initDb();

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

const PORT = process.env.PORT || 8000;

fastify.get("/", async (_, reply) => {
  reply.send({ message: "Server is running" });
});

const twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Helper function to get signed URL for authenticated conversations
async function getSignedUrl() {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
    {
      method: "GET",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    }
  );
  if (!response.ok) throw new Error(`Failed to get signed URL: ${response.statusText}`);
  const data = await response.json();
  return data.signed_url;
}

// --- REST API: Save call info when initiated from bot ---
fastify.post("/api/call", async (request, reply) => {
  const { number, name, prompt, first_message, call_sid } = request.body;
  if (!number) return reply.code(400).send({ error: "number required" });
  await saveCall({ number, name, prompt, first_message, call_sid, status: "initiated" });
  reply.send({ success: true });
});

// --- REST API: Get previous topics for a number ---
fastify.get("/api/previous-topics/:number", async (request, reply) => {
  const { number } = request.params;
  const topics = await getPreviousTopics(number);
  reply.send({ topics });
});

// --- Webhook: Call ended, update status and store conversation, send to Telegram bot ---
fastify.post("/webhook/call-ended", async (request, reply) => {
  const { call_sid, number, dynamic_variables, topics, transcription } = request.body;
  if (!call_sid || !number) return reply.code(400).send({ error: "call_sid and number required" });

  await updateCallStatus(call_sid, "ended", dynamic_variables);
  if (topics) await saveConversation(number, topics, call_sid);

  // --- Send result to Telegram bot webhook ---
  if (TELEGRAM_BOT_WEBHOOK_URL) {
    try {
      await fetch(TELEGRAM_BOT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_sid,
          number,
          topics,
          transcription,
          dynamic_variables,
        }),
      });
    } catch (err) {
      console.error("Failed to send call result to Telegram bot:", err);
    }
  }

  reply.send({ success: true });
});

// --- Outbound call initiation (Twilio) ---
fastify.post("/outbound-call", async (request, reply) => {
  const { number, name, prompt, first_message } = request.body;
  if (!number) return reply.code(400).send({ error: "Phone number is required" });

  try {
    const call = await twilioClient.calls.create({
      from: TWILIO_PHONE_NUMBER,
      to: number,
      url: `https://${request.headers.host}/outbound-call-twiml?name=${encodeURIComponent(
        name || ""
      )}&prompt=${encodeURIComponent(
        prompt || ""
      )}&first_message=${encodeURIComponent(first_message || "")}`,
    });

    // Save call info in DB
    await saveCall({ number, name, prompt, first_message, call_sid: call.sid, status: "initiated" });

    reply.send({
      success: true,
      message: "Call initiated",
      callSid: call.sid,
    });
  } catch (error) {
    console.error("Error initiating outbound call:", error);
    reply.code(500).send({
      success: false,
      error: "Failed to initiate call",
    });
  }
});

// --- TwiML route for outbound calls ---
fastify.all("/outbound-call-twiml", async (request, reply) => {
  const name = request.query.name || "";
  const prompt = request.query.prompt || "";
  const first_message = request.query.first_message || "";
  const greeting = name
    ? `Hello ${name}, this is your AI agent. ${first_message || ""}`
    : `${first_message || "Hello, this is your AI agent."}`;
  reply.type("text/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${greeting}</Say></Response>`
  );
});

// --- WebSocket route for handling media streams (if needed) ---
fastify.register(async fastifyInstance => {
  // Example: fastifyInstance.get("/media-stream", { websocket: true }, (ws, req) => { ... });
});

fastify.listen({ port: PORT }, err => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`[Server] Listening on port ${PORT}`);
});