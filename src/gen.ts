import {
  LiteralNode,
  RegexNode,
  GrammarNode,
  RuleNode,
  JoinNode,
  SelectNode,
  RepeatNode,
} from "./ast";
import { assert } from "./util";

export type RegexDef = RegExp | GrammarNode;
export type Grammar = string | GrammarNode;

export interface GenOptions {
  name?: string;
  regex?: RegexDef;
  stop?: RegexDef | string;
  maxTokens?: number;
  temperature?: number;
  listAppend?: boolean;
}

function isPlainObject(obj: any): boolean {
  return obj && Object.getPrototypeOf(obj) === Object.prototype;
}

function isRegexDef(obj: any): boolean {
  return obj instanceof RegExp || obj instanceof GrammarNode;
}

export function gen(options?: GenOptions): GrammarNode;
export function gen(name: string, options?: GenOptions): GrammarNode;
export function gen(
  name: string,
  regex: RegexDef,
  options?: GenOptions
): GrammarNode;
export function gen(regex: RegexDef, options?: GenOptions): GrammarNode;
export function gen(...args: any[]): GrammarNode {
  let name: string | undefined = undefined;
  let regex: RegexDef | undefined = undefined;
  let options: GenOptions = {};

  if (typeof args[0] == "string") name = args.shift();
  if (isRegexDef(args[0])) regex = args.shift();
  if (isPlainObject(args[0])) options = args.shift();
  assert(args.length == 0);

  const stop = !options.stop ? undefined : GrammarNode.from(options.stop);

  name ??= options.name;

  const body = RegexNode.from(regex ?? options.regex ?? /.*/);
  const g = new RuleNode(name ?? "r", body);

  if (options.maxTokens !== undefined) g.maxTokens = options.maxTokens;
  if (options.temperature !== undefined) g.temperature = options.temperature;
  if (options.listAppend) g.listAppend = true;
  if (name !== undefined) g.capture = name;
  g.stop = stop;

  return g;
}

export function capture(name: string, grammar: Grammar) {
  const g = new RuleNode(name, GrammarNode.from(grammar));
  return g;
}

export function select(...values: Grammar[]) {
  return new SelectNode(values.map(GrammarNode.from));
}

export function join(...values: Grammar[]) {
  return new JoinNode(values.map(GrammarNode.from));
}

export function lexeme(rx: RegexDef) {
  return RegexNode.from(rx);
}

export function keyword(s: string) {
  return new LiteralNode(s);
}

export function str(s: string) {
  return new LiteralNode(s);
}

export function repeat(g: Grammar, min: number, max: number | null) {
  return new RepeatNode(GrammarNode.from(g), min, max);
}

export function oneOrMore(g: Grammar) {
  return repeat(g, 1, null);
}

export function zeroOrMore(g: Grammar) {
  return repeat(g, 0, null);
}

export function optional(g: Grammar) {
  return repeat(g, 0, 1);
}

function concatStrings(acc: GrammarNode[]) {
  for (let i = 1; i < acc.length; ++i) {
    const a = acc[i - 1];
    const b = acc[i];
    if (a instanceof LiteralNode && b instanceof LiteralNode) {
      acc[i - 1] = str(a.value + b.value);
      acc.splice(i, 1);
      i--;
    }
  }
}

const quoteRegex =
  /\\(u\{[0-9A-Fa-f]+\}|u[0-9A-Fa-f]{4}|x[0-9A-Fa-f]{2}|\n|.)|./g;

function cookRawString(raw: string) {
  return raw.replace(quoteRegex, (match, escapeSeq) => {
    if (escapeSeq) {
      switch (escapeSeq[0]) {
        case "u":
          if (escapeSeq[1] === "{") {
            return String.fromCodePoint(parseInt(escapeSeq.slice(2, -1), 16));
          } else {
            return String.fromCharCode(parseInt(escapeSeq.slice(1), 16));
          }
        case "x":
          return String.fromCharCode(parseInt(escapeSeq.slice(1), 16));
        case "t":
          return "\t";
        case "n":
          return "\n";
        case "v":
          return "\v";
        case "b":
          return "\b";
        case "r":
          return "\r";
        case "f":
          return "\f";
        case "0":
          return "\0";
        case "\n":
          return "";
        default:
          assert(escapeSeq.length == 1);
          return escapeSeq;
      }
    } else {
      return match;
    }
  });
}

export function grm(
  strings: TemplateStringsArray,
  ...values: Grammar[]
): GrammarNode {
  const acc: GrammarNode[] = [];

  const raw = Array.from(strings.raw);

  let minIndent: number | undefined = undefined;
  let joined = raw.join("{}");
  // ignore empty lines
  joined = joined.replace(/(\n *)+(\n|$)/g, "\n");
  // remove final NL
  if (joined.endsWith("\n")) joined = joined.slice(0, -1);
  joined.replace(/\n */g, (m) => {
    if (minIndent === undefined) minIndent = m.length - 1;
    else minIndent = Math.min(m.length - 1, minIndent);
    return "";
  });

  // we do not want the trailing spaces after final newline
  const last = raw[raw.length - 1];
  // note that $ might match \n at the end without the endsWith()
  if (last.endsWith(" ")) raw[raw.length - 1] = last.replace(/\n *$/, "\n");

  if (minIndent) {
    const regex = new RegExp(`\n {1,${minIndent}}`, "g");
    for (let i = 0; i < raw.length; ++i) raw[i] = raw[i].replace(regex, "\n");
  }

  // console.log({
  //   minIndent,
  //   cooked: strings,
  //   raw0: strings.raw,
  //   raw1: raw,
  //   cooked1: raw.map(cookRawString),
  // });

  for (let i = 0; i < raw.length; i++) {
    const s = cookRawString(raw[i]);
    if (s !== "") acc.push(str(s));
    if (i < values.length) {
      if (values[i] != null) acc.push(GrammarNode.from(values[i]));
    }
  }

  concatStrings(acc);

  if (acc.length == 0) return str("");
  else if (acc.length == 1) return acc[0];
  else return new JoinNode(acc);
}
