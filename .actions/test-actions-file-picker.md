---
id: test-actions-file-picker
name: Test Actions File Picker
description: Test picking action files from .actions/ with checkboxes and returning the selection
icon: beaker
parameters:
  - kind: pick
    key: actions
    name: Action files
    description: Select one or more action files from the .actions/ folder
    multiple: true
    values:
      from: directory
      path: .actions/
      mode: files
---

This is a test action. The user selected the following action file(s): {{actions}}

Run non-interactively — do not prompt for any input. List each selected file
on its own line, confirm the selection was received correctly, and print a short
summary stating how many files were selected out of the total available in
`.actions/`.

Do not modify, create, or delete any file. Never touch `.claude/` or `.actions/`.
