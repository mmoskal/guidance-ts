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
  capture,
} from "./index";

async function main() {
  let g = grm`= ${gen("res", /[0-9]+/, { stop: "\n" })}\n`;
  g = characterMaker("elf", "A swift warrior", ["pencil", "fork"]);

  console.log(g.pp());
  console.log(JSON.stringify(g.serialize(), null, 1));

  const conn = new client.Connection(process.env["AZURE_GUIDANCE_URL"]);
  const c = new client.Client(conn, "7 * 8", g);
  c.logLevel = 4;
  await c.start();
  console.log(c.captures);
  console.log(c.listCaptures);
  console.log({ t: c.getText() });
}

main()

function characterMaker(
  id: string,
  description: string,
  valid_weapons: string[]
) {
  const item = gen("item", { listAppend: true, stop: '"' });
  return grm`\
    The following is a character profile for an RPG game in JSON format.
    \`\`\`json
    {
        "id": "${id}",
        "description": "${description}",
        "name": "${gen("name", { stop: '"' })}",
        "age": ${gen("age", /[0-9]+/, { stop: "," })},
        "armor": "${capture("armor", select("leather", "chainmail", "plate"))}",
        "weapon": "${capture("weapon", select(...valid_weapons))}",
        "class": "${gen("class", { stop: '"' })}",
        "mantra": "${gen("mantra", { stop: '"' })}",
        "strength": ${gen("strength", /[0-9]+/, { stop: "," })},
        "items": ["${item}", "${item}", "${item}"]
    }\`\`\`
  `;
}
