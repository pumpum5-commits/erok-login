import { Context } from 'https://edge.netlify.com'

const WINDOW_MS = 60 * 1000; // 1 минута
const MAX_REQUESTS = 60;     // 60 запросов в минуту с одного IP

const requests = new Map<string, number[]>();

export default async (request: Request, context: Context) => {
  const ip = context.ip || "unknown_ip";
  const now = Date.now();

  // Получаем историю запросов и удаляем устаревшие (старше 1 минуты)
  let timestamps = requests.get(ip) || [];
  timestamps = timestamps.filter(ts => now - ts < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    return new Response('Too many requests. Please try again later.', {
      status: 429,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Добавляем текущий запрос
  timestamps.push(now);
  requests.set(ip, timestamps);

  return context.next();
};

export const config = { path: "/api/*" };