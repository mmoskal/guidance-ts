/// This represents a collection of grammars, with a designated
/// "start" grammar at first position.
/// Grammars can refer to each other via GrammarRef nodes.
export interface TopLevelGrammar {
  grammars: GrammarWithLexer[];
  max_tokens?: number;
  test_trace?: boolean;
}

export const DEFAULT_CONTEXTUAL: boolean = true;

/// The start symbol is at nodes[0]
export interface GrammarWithLexer {
  nodes: NodeJSON[];

  /// When enabled, the grammar can use `Lexeme` but not `Gen`.
  /// When disabled, the grammar can use `Gen` but not `Lexeme`.
  /// `String` is allowed in either case as a shorthand for either `Lexeme` or `Gen`.
  greedy_lexer: boolean;

  /// Only applies to greedy_lexer grammars.
  /// This adds a new lexeme that will be ignored when parsing.
  greedy_skip_rx?: RegexSpec;

  /// The default value for 'contextual' in Lexeme nodes.
  contextual?: boolean;

  /// When set, the regexps can be referenced by their id (position in this list).
  rx_nodes: RegexJSON[];
}

export type NodeJSON =
  // Terminals:
  /// Force generation of the specific string.
  | { String: NodeString }
  /// Generate according to regex.
  | { Gen: NodeGen }
  /// Lexeme in a greedy grammar.
  | { Lexeme: NodeLexeme }
  /// Generate according to specified grammar.
  | { GenGrammar: NodeGenGrammar }
  // Non-terminals:
  /// Generate one of the options.
  | { Select: NodeSelect }
  /// Generate all of the nodes in sequence.
  | { Join: NodeJoin };

/// Optional fields allowed on any Node
export interface NodeProps {
  max_tokens?: number;
  name?: string;
  capture_name?: string;
}

export interface NodeString extends NodeProps {
  literal: string;
}

export interface NodeGen extends NodeProps {
  /// Regular expression matching the body of generation.
  body_rx: RegexSpec;

  /// The whole generation must match `body_rx + stop_rx`.
  /// Whatever matched `stop_rx` is discarded.
  /// If `stop_rx` is empty, it's assumed to be EOS.
  stop_rx: RegexSpec;

  /// When set, the string matching `stop_rx` will be output as a capture
  /// with the given name.
  stop_capture_name?: string;

  /// Lazy gen()s take the shortest match. Non-lazy take the longest.
  /// If not specified, the gen() is lazy if stop_rx is non-empty.
  lazy?: boolean;

  /// Override sampling temperature.
  temperature?: number;
}

export interface NodeLexeme extends NodeProps {
  rx: RegexSpec;
  contextual?: boolean;
  temperature?: number;
}

export interface NodeGenGrammar extends NodeProps {
  grammar: GrammarId;
  /// Override sampling temperature.
  temperature?: number;
  max_tokens_grm: number;
}

export interface NodeSelect extends NodeProps {
  among: NodeId[];
}

export interface NodeJoin extends NodeProps {
  sequence: NodeId[];
}

export type RegexJSON =
  /// Intersection of the regexes
  | { And: RegexId[] }
  /// Union of the regexes
  | { Or: RegexId[] }
  /// Concatenation of the regexes
  | { Concat: RegexId[] }
  /// Matches the regex; should be at the end of the main regex.
  /// The length of the lookahead can be recovered from the engine.
  | { LookAhead: RegexId }
  /// Matches everything the regex doesn't match.
  /// Can lead to invalid utf8.
  | { Not: RegexId }
  /// Repeat the regex at least min times, at most max times
  | { Repeat: [RegexId, number, number?] }
  /// Matches the empty string. Same as Concat([]).
  | { EmptyString: {} }
  /// Matches nothing. Same as Or([]).
  | { NoMatch: {} }
  /// Compile the regex using the regex_syntax crate
  | { Regex: string }
  /// Matches this string only
  | { Literal: string }
  /// Matches this string of bytes only. Can lead to invalid utf8.
  | { ByteLiteral: number[] }
  /// Matches this byte only. If byte is not in 0..127, it may lead to invalid utf8
  | { Byte: number }
  /// Matches any byte in the set, expressed as bitset.
  /// Can lead to invalid utf8 if the set is not a subset of 0..127
  | { ByteSet: number[] };

export type RegexSpec = string | RegexId;

export type GrammarId = number;
export type NodeId = number;
export type RegexId = number;