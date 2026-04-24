---
id: echo-parameter
name: Echo Parameter
description: Echo the selected parameter value to verify parameter substitution works
icon: beaker
category: Debug
parameter:
  name: Value
  description: Pick a value to echo back
  multiple: false
  values:
    from: static
    list:
      - alpha
      - bravo
      - charlie
---

Display the following value exactly as received: {{parameter}}

Run non-interactively — do not ask any questions. Simply output the value shown above
so the user can confirm that parameter substitution is working correctly.

Do not modify any files. Do not touch `.claude/` or `.actions/`.
Just print the parameter value and confirm it was received.
