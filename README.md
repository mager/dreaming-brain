# dreaming-brain

A small custom brain for an AI assistant. Save completed sessions, let a model propose useful notes, review the changes, then give accepted memory to the next task.

Companion to [What agent dreaming does, and how to use it](https://mager.co/blog/2026-11-07-agent-dreaming/).

```text
Your profile + completed sessions + accepted memory
                       |
                  dream review
                       |
               proposed changes
                       |
              you inspect + accept
                       |
           context for the next task
```

This is a working learning example, not a hosted assistant. It does not change model weights. You choose what it reads and when the saved memory is used.

## Try it in a minute

Requires **Node.js 22 or later**. No packages to install.

```sh
git clone https://github.com/mager/dreaming-brain.git
cd dreaming-brain
npm run demo
```

The offline demo captures a synthetic deployment session, shows a hand-authored proposal, accepts it, recalls the note, and undoes the change. It uses a temporary directory and makes **no API calls**. The proposal is a fixture, not generated intelligence. Normal CLI use requires you to run `accept` explicitly.

## Make the brain yours

```sh
node bin/brain.js init
# Edit brain/profile.md in your editor.
node bin/brain.js capture examples/session.txt
node bin/brain.js status
```

Write the assistant's purpose, working style, and limits in `brain/profile.md`. Dreaming reads that file but never rewrites it. Replace the example with a plain-text export of a completed task when you are ready.

The default `brain/` directory contains private runtime data and is ignored by Git. Each initialized brain also gets its own ignore file. Keep credentials out of session exports; this example is not a secret scanner.

## Generate a dream with Claude

Set `ANTHROPIC_API_KEY` in your shell or secret manager. Set `ANTHROPIC_MODEL` to a model available to your account. For example:

```sh
export ANTHROPIC_MODEL=claude-haiku-4-5-20251001
node bin/brain.js dream --live
```

This makes one paid [Claude Messages API](https://platform.claude.com/docs/en/api/messages) request. It sends your profile, current accepted notes, and up to ten unprocessed sessions to Anthropic. The batch stops when the input budget is full; later sessions remain unprocessed for the next dream. It uses [structured output](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), then checks the reply locally. The model has no tools or filesystem access.

The command prints a proposal ID such as `p-1234abcd`. Use the ID from your run:

```sh
node bin/brain.js review p-1234abcd
# Read the claims, their scope, and the cited evidence.
node bin/brain.js accept p-1234abcd
node bin/brain.js context deployment
```

To decline the proposal, use `reject` instead of `accept`. The sessions remain available for a later review. If there are no new sessions, live mode exits without a model call.

The request has a 100,000-character input ceiling, a 4,096-token output ceiling, a two-minute timeout, and no automatic retries. These limits bound the work; they are not a dollar budget. Usage is printed after a successful call. Provider billing and data handling still apply.

## Use another assistant

You can export the same review prompt and bring back a JSON reply. This path needs no API key in the CLI.

```sh
node bin/brain.js prompt
# Give brain/prompt.md to your assistant.
# Save its JSON-only reply as brain/reply.json.
node bin/brain.js dream --reply brain/reply.json
```

`prompt` saves both the prompt and its exact input snapshot (`brain/request.json`). Keep that snapshot unchanged until you import the reply. A new capture, profile edit, acceptance, or undo makes the old request stale. Export a fresh prompt if that happens. Use `--request FILE` to import against a separately saved snapshot.

Then run `review`, `accept`, and `context` as above. Sharing the prompt with an assistant also shares the included profile, notes, and sessions with that assistant's provider.

## Give memory to the next task

```sh
node bin/brain.js context deployment > brain/context.md
```

Attach or read `brain/context.md` in your next agent session, together with the new task. Saving memory alone does not connect it to an assistant. In your own harness, call the context command before sending the next task to the model.

Context always includes the user-authored profile. With a query, it returns matching accepted notes using simple case-insensitive word matching. With no query, it returns accepted notes in storage order. It includes at most eight notes and approximately 12,000 characters, and reports omitted matches. Narrow the query if needed. This starter has no vector database or semantic search.

## Optional: move accepted memory with Brainpack

The `export` command prints the profile and **all accepted notes** as Markdown. Unlike `context`, it has no eight-note or 12,000-character recall limit. It includes scope, recheck conditions, acceptance dates, and cited excerpts. It does not include complete session logs, pending proposals, unresolved questions, or undo history.

You can use that file with any assistant that reads Markdown. To package it with [Brainpack](https://github.com/mager/brainpack), create a separate directory outside this source repository:

```sh
# Run from the dreaming-brain repository after accepting useful notes.
brain_pack_dir="$HOME/my-agent-pack"
mkdir -p "$brain_pack_dir"
node bin/brain.js export > "$brain_pack_dir/MEMORY.md.next" &&
  mv "$brain_pack_dir/MEMORY.md.next" "$brain_pack_dir/MEMORY.md"

cd "$brain_pack_dir"
npx --yes --package=@mager/brainpack@0.3.0 brainpack init --name my-agent --platform generic
git add MEMORY.md brainpack.json .gitignore
git commit -m "Save accepted agent memory"
npx --yes --package=@mager/brainpack@0.3.0 brainpack snapshot accepted-memory
npx --yes --package=@mager/brainpack@0.3.0 brainpack export "$HOME/my-agent-pack.tar.gz"
```

Git needs your usual commit identity. Brainpack's `snapshot` tags the current commit, so commit the memory file before taking a snapshot. Version `0.3.0` is the published package used in the compatibility check. Brainpack is optional and is not added to this project's dependencies.

To refresh the pack, return to the dreaming-brain repository, export again, review the Git diff in the pack directory, and commit the change. Use a new snapshot name. To restore the archive on another machine:

```sh
mkdir -p "$HOME/restored-agent-pack"
cd "$HOME/restored-agent-pack"
npx --yes --package=@mager/brainpack@0.3.0 brainpack import "$HOME/my-agent-pack.tar.gz"
```

Give the restored `MEMORY.md` to your assistant as context. This is a one-way export for reading; it does not rebuild a dreaming-brain database. Back up the original private `brain/` directory if you need its sessions, checkpoints, and undo history.

The profile, accepted notes, and quoted excerpts can still contain personal information. Review the file before sharing it, and use a private destination for personal memory. Export is not a redaction tool. The commands above do not configure a remote or upload the pack. A full export can exceed an assistant's context limit; use `context QUERY` when you need a smaller selection.

## What a note contains

Each proposed note has:

- `id`: a short stable name such as `docs-preview-target`.
- `text`: the fact or procedure to remember.
- `scope`: where it applies.
- `recheck`: when it needs checking again.
- `replaces`: existing note IDs that this change supersedes.
- `evidence`: session IDs and exact excerpts from the new input sessions.

The reply also has an `unresolved` list. These items remain in the proposal report; they do not enter accepted context. A no-change proposal is valid: accepting it records that the input sessions were reviewed without creating notes.

The software checks structure, IDs, and whether quotes occur in the supplied sessions. **It cannot prove that a quote supports a conclusion.** Review the full session when needed. Prompt instructions reduce some mistakes; they do not make untrusted text safe or a model infallible.

## Inspect, correct, and undo

```sh
node bin/brain.js status
node bin/brain.js review p-1234abcd
node bin/brain.js reject p-1234abcd
node bin/brain.js undo
```

To correct a note, capture a new session with the correction, then run another dream. The new proposal must explicitly name the old note in `replaces`.

`undo` restores the notes and processed-session checkpoint from before the most recent acceptance. Captured sessions remain. Pending proposals are invalidated. Up to twenty acceptance snapshots are retained. Proposal reports keep their historical status; an earlier `accepted` report is not proof that its notes remain active after undo.

## Files and limits

```text
brain/
  profile.md       # Your authored purpose, preferences, and limits
  state.json       # Sessions, notes, proposals, checkpoints, undo history
  request.json     # Snapshot for a manual prompt round trip
  prompt.md        # Generated review prompt
  .gitignore       # Keeps runtime data out of Git by default
```

The article sketches separate folders. This implementation uses one JSON state file so accepting notes and advancing the checkpoint happen in one atomic file replacement. A directory lock prevents two CLI writers from updating that file at once. Model requests happen outside the lock; a revision and input check rejects a stale result. Identical session content is imported only once.

This is for a **small, single-user local brain**. Session imports are limited to 20,000 characters, the profile to 6,000, and the state file to five million characters. The whole accepted-memory set must fit in the dream input budget. It keeps transcripts and reports; it has no automatic retention cleanup, encryption, multi-user permissions, or network service. Do not use a shared or network filesystem for concurrent writers. Back up the directory before experiments.

After a crash, a `.lock` directory may remain. Confirm that no brain command is running before removing that lock. Never remove it just to bypass an active writer.

You can select a different private data directory for any command:

```sh
node bin/brain.js --brain "$HOME/my-agent-memory" init
```

## Tests and source

```sh
npm test
# Optional: downloads the pinned Brainpack CLI and tests a local archive round trip.
npm run test:brainpack
```

- `lib/brain.js`: storage, source validation, review/accept/undo, context.
- `lib/dream.js`: prompt, JSON schema, bounded Claude API request.
- `bin/brain.js`: command-line interface.
- `examples/`: synthetic session and offline lifecycle demo.
- `scripts/check-brainpack.js`: correction, export, Git snapshot, archive, and import check using synthetic data.

The tests exercise real temporary files and CLI processes. API tests replace the network boundary to check successful responses, HTTP errors, malformed output, and truncation without a paid call.

Verification on November 9, 2026: local tests and the offline demo passed. The API request and response paths are tested with fixtures. A successful live generation has not yet been verified.

## Related work

- [Anthropic: The components of agent memory](https://www.anthropic.com/research/components-of-agent-memory)
- [Anthropic's dreaming cookbook](https://platform.claude.com/cookbook/managed-agents-cma-dreaming-with-a-dynamic-workflow)
- [Brainpack](https://github.com/mager/brainpack): my separate tool for versioning and moving portable agent brains. This starter focuses on reviewing memory; Brainpack is not required.

The examples are synthetic. They contain no files from my personal brain.

MIT licensed.
