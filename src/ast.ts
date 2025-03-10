export interface LarkGrammar {
  name: string;
  lark_grammar: string;
}

export interface JsonGrammar {
  name: string;
  json_schema: Record<string, any>;
}

export interface LLGrammar {
  grammars: Array<LarkGrammar | JsonGrammar>;
}

export abstract class ASTNode {
  simplify(): ASTNode {
    return this;
  }
}

export abstract class GrammarNode extends ASTNode {
  simplify(): GrammarNode {
    return this;
  }

  children(): GrammarNode[] {
    return [];
  }

  /**
   * If this returns true, then this node matches empty string and empty string only.
   */
  isNull(): boolean {
    return false;
  }

  /**
   * If this returns true, then this node will be compiled down to a regular expression.
   * It cannot be recursive.
   */
  isTerminal(): boolean {
    return this.children().every((child) => child.isTerminal());
  }

  ll_grammar(): LLGrammar {
    return new LLSerializer().serialize(this);
  }
}

export class LiteralNode extends GrammarNode {
  constructor(public value: string) {
    super();
  }
  isNull(): boolean {
    return this.value === "";
  }
}

export class RegexNode extends GrammarNode {
  constructor(public regex: string) {
    super();
  }
}

export class SelectNode extends GrammarNode {
  constructor(public alternatives: GrammarNode[]) {
    super();
  }
  isNull(): boolean {
    return this.alternatives.every((alt) => alt.isNull());
  }
  simplify(): GrammarNode {
    if (this.isNull()) return new LiteralNode("");
    const alts = this.alternatives
      .map((alt) => alt.simplify())
      .filter((alt) => !alt.isNull());
    const node = alts.length === 1 ? alts[0] : new SelectNode(alts);
    if (this.alternatives.some((alt) => alt.isNull()))
      return new RepeatNode(node, 0, 1);
    return node;
  }
  children(): GrammarNode[] {
    return this.alternatives;
  }
}

export class JoinNode extends GrammarNode {
  constructor(public nodes: GrammarNode[]) {
    super();
  }
  isNull(): boolean {
    return this.nodes.every((node) => node.isNull());
  }
  simplify(): GrammarNode {
    if (this.isNull()) return new LiteralNode("");
    const simplified = this.nodes
      .map((node) => node.simplify())
      .filter((node) => !node.isNull());
    return simplified.length === 1 ? simplified[0] : new JoinNode(simplified);
  }
  children(): GrammarNode[] {
    return this.nodes;
  }
}

export class RepeatNode extends GrammarNode {
  constructor(
    public node: GrammarNode,
    public min: number,
    public max?: number
  ) {
    super();
    if (min < 0) throw new Error("min must be >= 0");
    if (max !== undefined && max < min) throw new Error("max must be >= min");
  }
  isNull(): boolean {
    return this.node.isNull() || (this.min === 0 && this.max === 0);
  }
  children(): GrammarNode[] {
    return [this.node];
  }
  simplify(): GrammarNode {
    return new RepeatNode(this.node.simplify(), this.min, this.max);
  }
}

export class SubstringNode extends GrammarNode {
  constructor(public chunks: string[]) {
    super();
  }
  isTerminal(): boolean {
    return true;
  }
}

/**
 * This creates a name for the given grammar node (value), which can be referenced
 * via RuleRefNode (or directly).
 * In Lark syntax this results in approx. "{name}: {value}"
 * This can either Lark rule (non-terminal) or terminal definition
 * (meaning name can be upper- or lowercase).
 */
export class RuleNode extends GrammarNode {
  public capture?: string;
  public list_append: boolean = false;
  public temperature?: number;
  public max_tokens?: number;
  public stop?: RegexNode | LiteralNode;
  public suffix?: LiteralNode;
  public stop_capture?: string;
  constructor(public name: string, public value: GrammarNode) {
    super();
    if (
      (this.temperature !== undefined ||
        this.max_tokens !== undefined ||
        this.stop !== undefined ||
        this.suffix !== undefined ||
        this.stop_capture !== undefined) &&
      !(this.value.isTerminal() || this.value instanceof BaseSubgrammarNode)
    ) {
      throw new Error(
        "RuleNode is not terminal, so it cannot have a temperature, max_tokens, or stop condition"
      );
    }
  }
  isTerminal(): boolean {
    return (
      this.capture === undefined &&
      this.temperature === undefined &&
      this.max_tokens === undefined &&
      this.stop === undefined &&
      this.suffix === undefined &&
      this.stop_capture === undefined &&
      this.value.isTerminal() &&
      !(this.value instanceof BaseSubgrammarNode)
    );
  }
  children(): GrammarNode[] {
    return [this.value];
  }
}

export class RuleRefNode extends GrammarNode {
  private target?: RuleNode;
  setTarget(target: RuleNode): void {
    if (this.target) throw new Error("RuleRefNode target already set");
    this.target = target;
  }
  isTerminal(): boolean {
    // RuleRefNode should only ever be used to enable recursive rule definitions,
    // so it should never be terminal.
    return false;
  }
}

export abstract class BaseSubgrammarNode extends GrammarNode {
  constructor(public name: string) {
    super();
  }
  isTerminal(): boolean {
    return false;
  }
}

export class SubgrammarNode extends BaseSubgrammarNode {
  constructor(
    name: string,
    public body: GrammarNode,
    public skip_regex?: string
  ) {
    super(name);
  }
}

export class JsonNode extends BaseSubgrammarNode {
  constructor(name: string, public schema: Record<string, any>) {
    super(name);
  }
}

export class LLSerializer {
  public grammars: { [name: string]: JsonGrammar | LarkGrammar } = {};
  public names: Map<BaseSubgrammarNode, string> = new Map();

  serialize(node: GrammarNode): LLGrammar {
    if (node instanceof BaseSubgrammarNode) {
      this.visit(node);
    } else {
      this.visit(new SubgrammarNode("main", node));
    }
    const arr = Array.from(this.names.values()).map(
      (name) => this.grammars[name]
    );
    return { grammars: arr };
  }
  visit(node: BaseSubgrammarNode): string {
    if (this.names.has(node)) return this.names.get(node)!;
    let name = node.name;
    const used = new Set(this.names.values());
    if (used.has(name)) {
      let i = 1;
      while (used.has(`${name}_${i}`)) {
        i++;
      }
      name = `${name}_${i}`;
    }
    if (node instanceof SubgrammarNode) {
      // Important: insert name BEFORE visiting body to avoid infinite recursion
      this.names.set(node, name);
      const lark_grammar =
        new LarkSerializer(this).serialize(node.body) +
        (node.skip_regex ? `\n%ignore /${node.skip_regex}/` : "");
      this.grammars[name] = {
        name,
        lark_grammar,
      };
    } else if (node instanceof JsonNode) {
      this.names.set(node, name);
      this.grammars[name] = {
        name,
        json_schema: node.schema,
      };
    } else {
      throw new TypeError(`Unknown subgrammar type: ${node}`);
    }
    return name;
  }
}

// LarkSerializer
export class LarkSerializer {
  public rules: { [name: string]: string } = {};
  public names: Map<RuleNode, string> = new Map();
  constructor(public llSerializer: LLSerializer) {}
  serialize(node: GrammarNode): string {
    if (node instanceof RuleNode && node.name === "start") {
      this.visit(node);
    } else {
      this.visit(new RuleNode("start", node));
    }
    let res = "%llguidance {}\n\n";
    if (!("start" in this.rules)) {
      if ("START" in this.rules) res += "start: START\n";
    }
    let prevNl = true;
    for (const name of this.names.values()) {
      let s = this.rules[name];
      if (!prevNl && s.indexOf("\n") !== -1) res += "\n";
      res += s + "\n";
      prevNl = s.indexOf("\n") !== -1;
      if (prevNl) res += "\n";
    }
    return res;
  }
  visit(node: GrammarNode, top: boolean = false): string {
    if (node instanceof BaseSubgrammarNode) {
      return "@" + this.llSerializer.visit(node);
    }
    if (node instanceof RuleNode) {
      if (this.names.has(node)) return this.names.get(node)!;
      let name = this.normalizeName(node.name, node.isTerminal());
      const used = new Set(this.names.values());
      if (used.has(name)) {
        let i = 1;
        while (used.has(`${name}_${i}`)) {
          i++;
        }
        name = `${name}_${i}`;
      }
      this.names.set(node, name);
      let res = name;
      const attrs: string[] = [];
      if (node.capture !== undefined) {
        let captureName = node.capture;
        if (node.list_append) {
          captureName = `__LIST_APPEND:${captureName}`;
        }
        attrs.push(`capture=${JSON.stringify(captureName)}`);
      } else {
        attrs.push("capture");
      }
      if (node.temperature !== undefined) {
        attrs.push(`temperature=${node.temperature}`);
      }
      if (node.max_tokens !== undefined) {
        attrs.push(`max_tokens=${node.max_tokens}`);
      }
      if (node.stop) {
        attrs.push(`stop=${this.visit(node.stop)}`);
      }
      if (node.suffix) {
        attrs.push(`suffix=${this.visit(node.suffix)}`);
      }
      if (node.stop_capture !== undefined) {
        attrs.push(`stop_capture=${JSON.stringify(node.stop_capture)}`);
      }
      if (attrs.length > 0) res += `[${attrs.join(", ")}]`;
      res += ": " + this.visit(node.value.simplify(), true);
      this.rules[name] = res;
      return name;
    }
    if (node.isNull()) return '""';
    if (node instanceof LiteralNode) {
      return JSON.stringify(node.value);
    }
    if (node instanceof RegexNode) {
      let rx = node.regex;
      if (rx === undefined) rx = "(?s:.*)";
      return this.regex(rx);
    }
    if (node instanceof SelectNode) {
      if (top) {
        return node.alternatives
          .map((alt) => this.visit(alt))
          .join("\n     | ");
      } else {
        return (
          "(" +
          node.alternatives.map((alt) => this.visit(alt)).join(" | ") +
          ")"
        );
      }
    }
    if (node instanceof JoinNode) {
      return node.nodes
        .filter((n) => !n.isNull())
        .map((n) => this.visit(n))
        .join(" ");
    }
    if (node instanceof RepeatNode) {
      let inner = this.visit(node.node);
      if (node.node instanceof JoinNode || node.node instanceof RepeatNode) {
        inner = `(${inner})`;
      }
      if (node.min === 0 && node.max === undefined) return `${inner}*`;
      if (node.min === 1 && node.max === undefined) return `${inner}+`;
      if (node.min === 0 && node.max === 1) return `${inner}?`;
      if (node.max === undefined) return `${inner}{${node.min},}`;
      return `${inner}{${node.min},${node.max}}`;
    }
    if (node instanceof SubstringNode) {
      return `%regex ${JSON.stringify(
        { substring_chunks: node.chunks },
        null,
        2
      )}`;
    }
    if (node instanceof RuleRefNode) {
      if (!node["target"]) throw new Error("RuleRefNode has no target");
      return this.visit(node["target"]);
    }
    throw new TypeError(`Unknown node type: ${node}`);
  }
  normalizeName(name: string, terminal: boolean): string {
    let newName = name.replace(/-/g, "_");
    newName = newName.replace(/([a-z])([A-Z])/g, "$1_$2");
    return terminal ? newName.toUpperCase() : newName.toLowerCase();
  }
  regex(pattern: string): string {
    const escaped = pattern.replace(/(?<!\\)\//g, "\\/").replace(/\n/g, "\\n");
    return `/${escaped}/`;
  }
}
