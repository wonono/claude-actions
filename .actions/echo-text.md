---
id: echo-text
name: Echo Text Parameter
description: Echo back the free-text value typed by the user
icon: symbol-string
parameter:
  kind: text
  name: Message
  description: Type anything — it will be echoed back
  placeholder: "hello from claude-actions"
---

Display the following text exactly as received, then count the characters and the words in it: {{parameter}}

Run non-interactively — do not ask any questions. Simply echo the input and the two counts.

Do not modify any files. Do not touch `.claude/` or `.actions/`.
