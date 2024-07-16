import {
  Gen,
  GrammarNode,
  Grammar,
  Join,
  Lexeme,
  Select,
  StringLiteral,
} from "./grammarnode";
import { RegexNode, BaseNode } from "./regexnode";
import { assert } from "./util";

export { GrammarNode, RegexNode, BaseNode };
export type { Grammar };

export type RegexDef = RegExp | RegexNode;

export interface GenOptions {
  name?: string;
  regex?: RegexDef;
  stop?: RegexDef | string;
  maxTokens?: number;
  temperature?: number;
}

function isPlainObject(obj: any): boolean {
  return obj && Object.getPrototypeOf(obj) === Object.prototype;
}

function isRegexDef(obj: any): boolean {
  return obj instanceof RegExp || obj instanceof RegexNode;
}

export function gen(options?: GenOptions): Gen;
export function gen(name: string, options?: GenOptions): Gen;
export function gen(name: string, regex: RegexDef, options?: GenOptions): Gen;
export function gen(regex: RegexDef, options?: GenOptions): Gen;
export function gen(...args: any[]): Gen {
  let name: string | undefined = undefined;
  let regex: RegexDef | undefined = undefined;
  let options: GenOptions = {};

  if (typeof args[0] == "string") name = args.shift();
  if (isRegexDef(args[0])) regex = args.shift();
  if (isPlainObject(args[0])) options = args.shift();
  assert(args.length == 0);

  const stop = !options.stop
    ? undefined
    : typeof options.stop == "string"
    ? RegexNode.literal(options.stop)
    : RegexNode.from(options.stop);
  const g = new Gen(RegexNode.from(regex ?? options.regex ?? /.*/), stop);
  if (options.maxTokens !== undefined) g.maxTokens = options.maxTokens;
  if (options.temperature !== undefined) g.temperature = options.temperature;
  g.captureName = name ?? options.name;
  return g;
}

export function select(...values: Grammar[]) {
  return new Select(values.map(GrammarNode.from));
}

export function join(...values: Grammar[]) {
  return new Join(values.map(GrammarNode.from));
}

export function lexeme(rx: RegexDef) {
  return new Lexeme(RegexNode.from(rx));
}

export function keyword(s: string) {
  return new Lexeme(RegexNode.literal(s), true);
}

export function str(s: string) {
  return new StringLiteral(s);
}

export function oneOrMore(g: Grammar) {
  const inner = GrammarNode.from(g);
  const n = new Select([inner]);
  n.among.push(join(n, inner));
  return n;
}

export function zeroOrMore(g: Grammar) {
  const n = new Select([str("")]);
  n.among.push(join(n, g));
  return n;
}

function concatStrings(acc: GrammarNode[]) {
  for (let i = 1; i < acc.length; ++i) {
    const a = acc[i - 1];
    const b = acc[i];
    if (a instanceof StringLiteral && b instanceof StringLiteral) {
      acc[i - 1] = str(a.literal + b.literal);
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
  else return new Join(acc);
}
