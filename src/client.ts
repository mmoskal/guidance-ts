import OpenAI from 'openai';
import {
  AssistantPrompt,
  InitialRunResponse,
  OutCapture,
  OutText,
  ParserOutput,
  RunRequest,
  RunResponse,
  RunUsageResponse,
} from "./api";
import { Gen, GrammarNode } from "./grammarnode";
import {
  assert,
  uint8ArrayConcat,
  uint8arrayFromHex,
  utf8decode,
} from "./util";



export interface RequestOptions {
  info?: string; // included in
  headers?: Record<string, string>;
  method?: string;
  data?: any;
  lineCb?: (s: string) => void;
}

export interface GenerationOptions {
  prompt?: string;
  messages?: AssistantPrompt[];
  grammar: GrammarNode;
  maxTokens?: number;
}

export class Session {
  private oai_client: OpenAI;
  private model: string;

  constructor(baseUri: string, targetModel: string) {
    this.oai_client = new OpenAI({ baseURL: baseUri, apiKey: "" });
    this.model = targetModel;
  }

  async request(options: RequestOptions) {
    console.log("Options.data:", options.data);
    console.log("Messages:", options.data?.messages);
    console.log("guided_grammar:", options.data?.grammar);
    const response = await this.oai_client.chat.completions.create({
      model: this.model,
      messages: options.data?.messages ?? [],
    }, /*{
      extra_body: {
        "guided_decoding_backend": "guidance",
        "guided_grammar": options.data?.grammar?.serialize(),
      }
    }*/);
    console.log("Response:", response);
    console.log("Messages:", response.choices[0].message.content);
    return response;
  }

  generation(options: GenerationOptions) {
    return new SessionGeneration(this, options);
  }
}

export abstract class Generation {
  constructor(protected options: GenerationOptions) { }

  lastUsage: RunUsageResponse;
  logLevel = 1;
  captures: Map<string, OutCapture> = new Map();
  listCaptures: Map<string, OutCapture[]> = new Map();
  text: OutText[] = [];
  isDone = false;
  started = false;
  warnings: string[] = [];

  onText = (s: OutText) => { };
  onLog = (s: string) => { };
  onWarning = (warn: string) => { };
  onError = (err: string) => {
    throw new Error("Server error: " + err);
  };

  getTextBytes() {
    return uint8ArrayConcat(this.text.map((t) => uint8arrayFromHex(t.hex)));
  }

  getText() {
    return utf8decode(this.getTextBytes());
  }

  getCapture(name: string) {
    return this.captures.get(name)?.str;
  }

  getCaptureBytes(name: string) {
    return uint8arrayFromHex(this.captures.get(name)?.hex);
  }

  getListCapture(name: string) {
    return this.listCaptures.get(name)?.map((v) => v.str);
  }

  destroy() { }

  abstract run(): Promise<void>;

  protected handleParserOutput(output: ParserOutput) {
    switch (output.object) {
      case "capture":
        if (output.name.startsWith(Gen.LIST_APPEND_PREFIX)) {
          const name = output.name.slice(Gen.LIST_APPEND_PREFIX.length);
          if (!this.listCaptures.has(name)) this.listCaptures.set(name, []);
          this.listCaptures.get(name).push(output);
        } else {
          this.captures.set(output.name, output);
        }
        break;
      case "final_text":
        this.isDone = true;
        break;
      case "text":
        this.text.push(output);
        this.onText(output);
        break;
    }
  }
}

class SessionGeneration extends Generation {
  constructor(private session: Session, options: GenerationOptions) {
    super(options);
  }

  async run() {
    const arg: RunRequest = {
      controller: "llguidance",
      controller_arg: { grammar: this.options.grammar.serialize() },
      prompt: this.options.prompt,
      messages: this.options.messages,
      temperature: 0.0,
      max_tokens: this.options.maxTokens ?? undefined,
    };
    assert(!this.started);
    this.started = true;
    console.log("arg: RunRequest", JSON.stringify(arg));
    await this.session.request({
      data: arg,
      lineCb: (s) => this.handleLine(s),
    });
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
      if (f.error) {
        this.onError(f.error);
        return;
      }
      for (const line of f.logs.split("\n")) {
        if (line.startsWith("JSON-OUT: ")) {
          if (this.logLevel >= 6) {
            console.log(line);
          }
          this.handleParserOutput(JSON.parse(line.slice(10)));
        } else if (line.startsWith("Warning: ")) {
          if (this.logLevel >= 1) console.warn(line);
          this.warnings.push(line);
          this.onWarning(line);
        } else {
          if (this.logLevel >= 2) console.log(line);
          this.onLog(line);
        }
      }
    }
  }
}
