import {
  InitialRunResponse,
  OutCapture,
  OutText,
  ParserOutput,
  RunRequest,
  RunResponse,
  RunUsageResponse,
} from "./api";
import { GrammarNode } from "./grammarnode";
import { postAndRead } from "./nodefetch";
import { assert } from "./util";

function parseBaseUrl(baseUrl: string) {
  const urlPattern = /^(.*?)(#.*)?$/;
  const match = baseUrl.match(urlPattern);
  let baseUrlWithoutFragment = match[1];
  const fragment = match[2] || "";

  let key = "";
  const keyPattern = /key=([^&]*)/;
  const keyMatch = fragment.match(keyPattern);
  if (keyMatch) {
    key = keyMatch[1];
  }

  if (!baseUrlWithoutFragment.endsWith("/")) {
    baseUrlWithoutFragment += "/";
  }

  return [baseUrlWithoutFragment, key];
}

export interface RequestOptions {
  url: string;
  headers?: Record<string, string>;
  method?: string;
  data?: any;
  lineCb?: (s: string) => void;
}

export class Connection {
  constructor(private connectionString: string) {}

  async request(options: RequestOptions) {
    const [baseUrl, key] = parseBaseUrl(this.connectionString);
    options = { ...options };
    if (options.url.startsWith("/")) {
      options.url = baseUrl + options.url.slice(1);
    }
    options.headers = {
      "api-key": key,
      ...(options.headers ?? {}),
    };
    return await postAndRead(options);
  }
}

export class Client {
  constructor(
    private connection: Connection,
    private prompt: string,
    private grammar: GrammarNode
  ) {}

  lastUsage: RunUsageResponse;
  logLevel = 2;
  captures: Map<string, OutCapture> = new Map();
  text: OutText[] = [];
  isDone = false;
  started = false;
  warnings: string[] = [];

  async start() {
    const arg: RunRequest = {
      controller: "llguidnace",
      controller_arg: { grammar: this.grammar.serialize() },
      prompt: this.prompt,
      temperature: 0,
      max_tokens: 1000,
    };
    assert(!this.started);
    this.started = true;
    return await this.connection.request({
      url: "/run",
      data: arg,
      lineCb: (s) => this.handleLine(s),
    });
  }

  private handleParserOutput(output: ParserOutput) {
    switch (output.object) {
      case "capture":
        this.captures.set(output.name, output);
        break;
      case "final_text":
        this.isDone = true;
        break;
      case "text":
        this.text.push(output);
        break;
    }
  }

  private handleLine(serverLine: string) {
    if (serverLine.startsWith("[DONE]")) return;
    const output: RunResponse | InitialRunResponse = JSON.parse(serverLine);
    if (output.object == "initial-run") {
      // ignore
    } else if (output.object == "run") {
      this.lastUsage = output.usage;
      assert(output.forks.length == 1);
      const f = output.forks[0];
      if (f.error) throw new Error("Server error: " + f.error);
      for (const line of f.logs.split("\n")) {
        if (line.startsWith("JSON-OUT: ")) {
          this.handleParserOutput(JSON.parse(line.slice(10)));
        } else if (line.startsWith("Warning: ")) {
          if (this.logLevel >= 1) console.log(line);
          this.warnings.push(line);
        } else {
          if (this.logLevel >= 2) console.log(line);
        }
      }
    }
  }
}
