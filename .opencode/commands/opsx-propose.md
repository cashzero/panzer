---
description: Propose a new OpenSpec change and create proposal artifacts
agent: plan
---

Create or continue an OpenSpec change proposal.

Input: `$ARGUMENTS`

Goals:
- Determine the intended change name in kebab-case.
- Create the change if it does not already exist.
- Generate the proposal artifacts needed to make the change ready for implementation.

Instructions:
- If no input is provided, ask the user what they want to build or fix before proceeding.
- If the input is descriptive rather than a change name, derive a concise kebab-case change name.
- If a change with that name already exists, confirm whether to continue it or create a different one.
- Use the repository's OpenSpec workflow and any available OpenSpec tooling or skills.
- Create the change artifacts in dependency order until the change is ready to apply.
- Read existing related artifacts before writing new ones.
- Keep artifact content specific to this project and aligned with `openspec/product.md`, `openspec/roadmap.md`, and repository conventions.
- Ask the user a short clarifying question only if critical context is missing.

Deliverables:
- `proposal.md`
- `design.md` when required by the workflow
- `tasks.md`
- any additional apply-required artifacts defined by the workflow

Final response:
- report the change name and location
- list the artifacts created
- state whether the change is ready for implementation
- tell the user they can run `/opsx-apply <change-name>` next
