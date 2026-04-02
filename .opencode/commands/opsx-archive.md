---
description: Archive a completed OpenSpec change
agent: build
---

Archive an OpenSpec change.

Input: `$ARGUMENTS`

Instructions:
- If a change name is provided, use it.
- If no change name is provided, inspect active changes and ask the user to choose; do not guess.
- Check artifact completion status and task completion status before archiving.
- If there are incomplete artifacts or tasks, warn the user and ask for confirmation before proceeding.
- Check whether the change includes delta specs that should be synced into the main specs.
- Summarize the sync impact and ask the user whether to sync first when applicable.
- Follow the repository's OpenSpec workflow and available tooling or skills for any required spec sync.
- Archive the change into the dated archive location without losing its OpenSpec metadata.
- If the target archive path already exists, stop and explain the conflict instead of overwriting it.

Final response:
- report the archived change name
- show the archive path
- summarize warnings, task/artifact completion, and spec sync status
