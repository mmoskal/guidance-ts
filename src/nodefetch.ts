import { RequestOptions } from "./client";

export async function postAndRead(options: RequestOptions): Promise<{}> {
  let { url, headers = {}, method, data, lineCb, info } = options;

  if (info === undefined) {
    info = url;
  }

  if (data && !method) {
    method = "POST";
  }

  let body = undefined;
  if (typeof data === "object") {
    body = JSON.stringify(data);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  if (!response.ok) {
    const pref =
      `Invalid HTTP response.\nRequest: ${method} ${info}\n` +
      `Status: ${response.status} ${response.statusText}\n`;
    let text = "";
    try {
      text = "Body: " + (await response.text());
    } catch (e) {
      text = e.toString();
    }
    throw new Error(pref + text);
  }

  if (!lineCb) return await response.json();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let partialData = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    partialData += decoder.decode(value, { stream: true });

    let lines = partialData.split("\n");
    partialData = lines.pop() || "";

    for (let line of lines) {
      if (line.startsWith("data: ")) {
        const message = line.substring(6).trim();
        lineCb(message);
      }
    }
  }

  return null;
}
