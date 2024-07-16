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
  let g = grm`7 * 8 = ${gen(/[0-9]+/)}\n`;

  console.log(g.pp())

  const conn = new client.Connection(process.env["AZURE_GUIDANCE_URL"]);
  const c = new client.Client(conn, "", g);
  c.logLevel = 10;
  await c.start();
}

main();
