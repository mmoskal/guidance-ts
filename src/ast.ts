import {
  GrammarId,
  GrammarWithLexer,
  NodeJSON,
  NodeProps,
  RegexJSON,
  RegexSpec,
} from "./api";
import { assert, panic } from "./util";

export type RegexDef = string | RegexNode;

const REGEX_PLACEHOLDER = -1000;
export class RegexNode {
  _brandRegex: unknown;

  _cachedId?: GrammarId;
  _cacheWaveId?: number;

  private constructor(
    private simple: RegexJSON,
    private children?: RegexNode[]
  ) {}

  serializeInner(s: Serializer): RegexJSON {
    const simple = JSON.parse(JSON.stringify(this.simple));
    const key = Object.keys(simple)[0];
    let arg = Object.values(simple)[0];

    if (this.children) {
      const mapped = this.children.map(s.regex);
      if (Array.isArray(arg)) {
        arg = mapped.concat(arg);
      } else if (arg === REGEX_PLACEHOLDER) {
        assert(mapped.length == 1);
        arg = mapped[0];
      } else {
        panic();
      }
      simple[key] = arg;
    }

    return simple;
  }

  static literal(s: string) {
    return new RegexNode({ Literal: s });
  }
}

export abstract class GrammarNode {
  _cachedId?: GrammarId;
  _cacheWaveId?: number;

  max_tokens?: number;
  capture_name?: string;

  abstract serializeInner(s: Serializer): NodeJSON;

  serialize() {
    const s = new Serializer();
  }

  static from(s: string | GrammarNode) {
    if (typeof s === "string") return new StringLiteral(s);
    return s;
  }
}

export class Gen extends GrammarNode {
  public temperature?: number;
  public lazy?: boolean;

  constructor(public regex: RegexDef, public stop?: RegexDef) {
    super();
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      Gen: {
        body_rx: s.regex(this.regex),
        stop_rx: s.regex(this.stop),
        temperature: this.temperature,
        lazy: this.lazy,
      },
    };
  }
}

export class Select extends GrammarNode {
  constructor(public among: GrammarNode[]) {
    super();
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      Select: {
        among: this.among.map(s.serialize),
      },
    };
  }
}

export class Join extends GrammarNode {
  constructor(public sequence: GrammarNode[]) {
    super();
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      Join: {
        sequence: this.sequence.map(s.serialize),
      },
    };
  }
}

export class StringLiteral extends GrammarNode {
  constructor(public literal: string) {
    super();
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      String: {
        literal: this.literal,
      },
    };
  }
}

export class Lexeme extends GrammarNode {
  public temperature?: number;

  constructor(public rx: RegexDef, public contextual?: boolean) {
    super();
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      Lexeme: {
        rx: s.regex(this.rx),
        contextual: this.contextual,
        temperature: this.temperature,
      },
    };
  }
}

function nodeProps(node: NodeJSON): NodeProps {
  if ("Gen" in node) {
    return node["Gen"];
  } else if ("String" in node) {
    return node["String"];
  } else if ("Lexeme" in node) {
    return node["Lexeme"];
  } else if ("GenGrammar" in node) {
    return node["GenGrammar"];
  } else if ("Select" in node) {
    return node["Select"];
  } else if ("Join" in node) {
    return node["Join"];
  } else {
    throw new Error("unreachable");
  }
}

export class Serializer {
  private static nextWaveId = 1;

  private waveId: number;
  private grmNodes: NodeJSON[] = [];
  private rxNodes: RegexJSON[] = [];

  constructor() {
    this.waveId = Serializer.nextWaveId++;
    this.serialize = this.serialize.bind(this);
    this.regex = this.regex.bind(this);
  }

  static grammar(top: GrammarNode): GrammarWithLexer {
    // TODO Grammar node
    const s = new Serializer();
    const id = s.serialize(top);
    assert(id == 0);
    return {
      nodes: s.grmNodes,
      greedy_lexer: false,
      rx_nodes: s.rxNodes,
    };
  }

  serialize(n: GrammarNode): GrammarId {
    if (n._cacheWaveId == this.waveId) return n._cachedId as number;
    n._cacheWaveId = this.waveId;
    n._cachedId = this.grmNodes.length;
    const serial = n.serializeInner(this);
    const props = nodeProps(serial);
    if (n.max_tokens !== undefined) props.max_tokens = n.max_tokens;
    if (n.capture_name !== undefined) props.capture_name = n.capture_name;
    this.grmNodes.push(serial);
    return n._cachedId;
  }

  regex(n?: RegexDef): RegexSpec {
    // TODO order is backwards
    if (n === undefined) return "";
    if (typeof n == "string") return n;
    if (n._cacheWaveId == this.waveId) return n._cachedId as number;
    n._cacheWaveId = this.waveId;
    n._cachedId = this.rxNodes.length;
    const serial = n.serializeInner(this);
    this.rxNodes.push(serial);
    return n._cachedId;
  }
}
