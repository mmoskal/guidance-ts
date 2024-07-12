# guidance.ts

This library implements a TypeScript interface for `llguidance`.
It is inspired by Python [Guidance](https://github.com/guidance-ai/guidance).

The user of the library construct grammars (`GrammarNode` class),
and eventually calls `node.serialize()`.
This returns a JSON object that needs to be passed to llguidance server.

Grammars are most easily constructed using `grm` tagged template.

```ts
import { grm, select, gen, str, join } from "guidance";

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

## TODO

- [ ] add API for talking to the server
