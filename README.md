# guidance.ts

This library implements a TypeScript interface for [llguidance](https://github.com/microsoft/llguidance).
It is inspired by Python [Guidance](https://github.com/guidance-ai/guidance).

The user of the library construct grammars (`GrammarNode` class),
and eventually calls `node.serialize()`.
This returns a JSON object that needs to be passed to llguidance server.

Grammars are most easily constructed using `grm` tagged template.

```ts
import { grm, select, gen, str, join } from "guidance-ts";

let g = grm`\
    Do you want a joke or a poem? A ${select("joke", "poem")}.
    Okay, here is a one-liner: "${gen({ stop: '"' })}"
    `;
```

The indentation is removed automatically.
Grammars can be also constructed more manually:

```ts
g = join(
  str("Do you want a joke or a poem? A "),
  select("joke", "poem"),
  // str() can be omitted:
  '.\nOkay, here is a one-liner: "',
  gen({ stop: '"' }),
  '"\n'
);
```

There's also `.join()` method on `GrammarNode`:

```ts
g = grm`Do you want a joke or a poem? A ${select("joke", "poem")}.\n`
g = g.join(grm`Okay, here is a one-liner: "${gen({ stop: '"' })}"\n`)
```

To interact with the server, first create a `Session` instance:

```ts
import { Session, Generation } from "guidance-ts";
const session = new Session(process.env["AZURE_GUIDANCE_URL"]);
```

The `AZURE_GUIDANCE_URL` should contain a string of the form 
`https://somewhere.com/deployment-name/v1#key=secret`.
The library will hit `https://somewhere.com/deployment-name/v1/run`
with `API-Key` header set to `secret`.
If you set it to `https://somewhere.com/guidance#auth=secret`
it will set `Authorization` header to `Bearer secret`
and hit `https://somewhere.com/guidance`.

You can deploy `Phi-3.5-mini-instruct` model in Azure ML (it's pay-per-token).
Then the `AZURE_GUIDANCE_URL` will be something like:
`https://mydeployment.eastus2.models.ai.azure.com/guidance#auth=AbCdE..123`

Then, create a `Generation` for the grammar:

```ts
const g = new Generation(session, "7 * 8", grm` = ${gen("res", /[0-9]+/, { stop: '\n' })}\n`);
await g.start()
console.log(g.getCapture("res"))
```


Here's another example, ported from Guidance README:

```ts
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
```