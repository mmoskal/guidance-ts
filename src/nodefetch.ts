import fetch from "node-fetch";
import { Readable } from "stream";
import { TextDecoder } from "util";
import { RequestOptions } from "./client";

export async function postAndRead(options: RequestOptions): Promise<{}> {
  let { url, headers = {}, method, data, lineCb } = options;

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
    try {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status};\n${text}`);
    } catch (e) {
      throw new Error(`HTTP error! status: ${response.status}; ${e}`);
    }
  }

  if (!lineCb) return await response.json();

  const reader = response.body as Readable;
  const decoder = new TextDecoder();

  let partialData = "";

  for await (const chunk of reader) {
    partialData += decoder.decode(chunk, { stream: true });

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
