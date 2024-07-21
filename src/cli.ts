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
  capture,
  Generation,
  Session,
} from "./index";

import "dotenv/config";
import { uint8arrayFromHex } from "./util";
import chalk from "chalk";

async function main() {
  let g = grm`= ${gen("res", /[0-9]+/, { stop: "\n" })}\n`;
  g = characterMaker("elf", "A swift warrior", ["pencil", "fork"]);

  // console.log(g.pp());
  // console.log(JSON.stringify(g.serialize(), null, 1));

  const session = new Session(process.env["AZURE_GUIDANCE_URL"]);
  const seq = new Generation(session, "7 * 8", g);
  // seq.logLevel = 4;
  seq.onText = (t) => {
    if (t.is_generated && !t.str.includes("\uFFFD")) {
      process.stdout.write(chalk.green(t.str));
    } else {
      process.stdout.write(uint8arrayFromHex(t.hex));
    }
  };
  await seq.run();
  // console.log(seq.captures);
  // console.log(seq.listCaptures);
  // console.log({ t: seq.getText() });
}

main();

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
