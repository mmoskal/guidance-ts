import {
  gen,
  GrammarNode,
  grm,
  keyword,
  lexeme,
  oneOrMore,
  select,
  str,
  join,
  client,
} from "./index";

async function main() {
  let g = grm`7 * 8 = ${gen("res", /[0-9]+/, { stop: "\n" })}\n`;

  console.log(g.pp());
  console.log(JSON.stringify(g.serialize(), null, 1));

  const conn = new client.Connection(process.env["AZURE_GUIDANCE_URL"]);
  const c = new client.Client(conn, "", g);
  c.logLevel = 4;
  await c.start();
  console.log(c.captures);
}

main();
