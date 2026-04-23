---
id: debug-multi-param
name: Debug — Multi Parameters
description: Echoes a chosen tone and a free-text message. Used to test multi-parameter prompting.
icon: symbol-parameter
parameters:
  - kind: pick
    key: tone
    name: Tone
    description: Which tone should the echo take?
    values:
      from: static
      list:
        - formal
        - casual
  - kind: text
    key: message
    name: Message
    description: The text to echo back
    placeholder: "hello from claude-actions"
---

Echo back the following, then acknowledge the result.

Tone: {{tone}}

Message: {{message}}

Do not modify any file. Do not touch `.claude/` or `.actions/`. Run non-interactively — do not ask any questions.

Your response must end with the final line: "done with: {{tone}} & {{message}}".
