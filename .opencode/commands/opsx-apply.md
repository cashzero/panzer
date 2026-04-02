---
description: Implement tasks from an OpenSpec change
agent: build
---

Implement an OpenSpec change.

Input: `$ARGUMENTS`

Instructions:
- Select the target change from the argument.
- If no change is specified, infer it from context only when unambiguous; otherwise inspect available changes and ask the user to choose.
- Announce which change is being used and how to override it.
- Inspect the change status and follow the repository's OpenSpec workflow and tooling.
- Read the change context artifacts before implementing.
- Implement pending tasks one by one with minimal, focused code changes.
- Update the task checklist as each task is completed.
- Continue until all tasks are done or you hit a real blocker.
- If requirements are unclear, ask a short clarifying question before making risky changes.
- If implementation reveals that proposal or design artifacts are wrong, pause and explain what should be updated.
- Verify changes with the most relevant project checks when feasible.

Final response:
- summarize which tasks were completed in this session
- report remaining progress
- if all tasks are done, tell the user they can run `/opsx-archive <change-name>`
