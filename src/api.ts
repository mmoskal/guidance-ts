/// This represents a collection of grammars, with a designated
/// "start" grammar at first position.
export interface TopLevelGrammar {
  grammars: GrammarWithLexer[];
  max_tokens?: number;
}

export interface GrammarWithLexer {
  name?: string;
  lark_grammar?: string;
  json_schema?: Record<string, any>;
}

// Output of llguidance parser

export interface BytesOutput {
  str: string;
  hex: string;
}

export interface OutCapture extends BytesOutput {
  object: "capture";
  name: string;
  log_prob: number;
}

export interface OutFinalText extends BytesOutput {
  object: "final_text";
  stop_reason: StopReason;
}

export type StopReason =
  /// Parser has not emitted stop() yet.
  | "NotStopped"
  /// max_tokens limit on the total number of tokens has been reached.
  | "MaxTokensTotal"
  /// max_tokens limit on the number of tokens in the top-level parser has been reached.
  | "MaxTokensParser"
  /// Top-level parser indicates that no more bytes can be added.
  | "NoExtension"
  /// Top-level parser indicates that no more bytes can be added, however it was recognized late.
  | "NoExtensionBias"
  /// Top-level parser allowed EOS (as it was in an accepting state), and EOS was generated.
  | "EndOfSentence"
  /// Something went wrong with creating a nested parser.
  | "InternalError"
  /// The lexer is too complex
  | "LexerTooComplex"
  /// The parser is too complex
  | "ParserTooComplex";

export interface OutText extends BytesOutput {
  object: "text";
  log_prob: number;
  num_tokens: number;
  is_generated: boolean;
  stats: ParserStats;
}

export type ParserOutput = OutCapture | OutFinalText | OutText;

export interface ParserStats {
  runtime_us: number;
  rows: number;
  definitive_bytes: number;
  lexer_ops: number;
  all_items: number;
  hidden_bytes: number;
}

