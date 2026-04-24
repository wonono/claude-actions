---
id: echo-multi
name: Echo Multi Parameter
description: Echo back several values selected via checkboxes to verify multi-select
icon: checklist
category: Debug
parameter:
  kind: pick
  name: Values
  description: Check one or more values
  multiple: true
  values:
    from: static
    list:
      - alpha
      - bravo
      - charlie
      - delta
      - echo
---

Display the following comma-separated values exactly as received, then count them and say how many were picked: {{parameter}}

Run non-interactively — do not ask any questions. Simply echo the list and the count.

Do not modify any files. Do not touch `.claude/` or `.actions/`.
