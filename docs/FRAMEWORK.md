# Driver Log — Project Framework & Rules

A shell-driven scaffolding framework for building DriverLog with AI assistance. Claude generates
project structure as executable `.sh` scripts (using heredocs) rather than pasting many files into
chat.

## Phase A: Generation

Claude generates the project scaffold as a single `.sh` script using heredocs
(`cat << 'EOF' > file`) to write each file. This condenses a multi-file structure into one
runnable artifact.

## Phase B: Handoff

The generated `.sh` script is delivered as a file. It can be reviewed, committed, and re-run.

## Phase C: Local Execution & Safety

1. **Review**: Always briefly review the generated `.sh` script to ensure it isn't running
   destructive commands (e.g., `rm -rf`).
2. **Make executable**: `chmod +x setup_script.sh`
3. **Execute**: `./setup_script.sh`

## Advantages of the Shell-Driven Framework

- **Bypasses output limits**: LLMs often struggle to output large multi-file projects in a single
  chat UI. A shell script condenses the structure.
- **Idempotency**: Scripts can be designed to safely overwrite or update existing files without
  breaking the environment.
- **Version control**: The `.sh` script itself can be committed to Git as a record of how the
  scaffold was generated.

## Next Steps for Implementation

- **Establish an alias/helper**: Create a local terminal alias to quickly create, paste, and run
  these Claude-generated scripts.
- **Define template prompts**: Save the "Generate as a shell script" instructions as a custom
  system prompt or snippet to easily prepend to your requests.

## Rule: Check the CI doc before any presentation

Whenever a presentation (slides, PDF, or similar visual deck) is created for DriverLog, read
`brand/CI-brand-guidelines.html` first and build the deck to match it:

- Colors: Brand Red `D0021B`, Red Dark `A80016`, Red Mid `E8344A`, Red Light `FDECEA`,
  Background `F2F2F7`, Card `FFFFFF`, Text `1C1C1E` / `3C3C43` / `8E8E93`, Border `E5E5EA`,
  system accents Green `34C759` / Amber `FF9500` / Blue `007AFF`.
- Type: native system-UI stack (use Arial/Calibri as the safe equivalent in slide tools);
  bold, tight titles.
- Shape: 14px card radius / 10px control radius (≈0.1–0.15in in slide tools), soft low-spread
  shadows, iOS-squircle icon language.
- Logo: `brand/logo-icon.svg` (icon) — rasterize to PNG for slide tools rather than embedding
  the wordmark SVG directly, since headless SVG-to-PNG conversion (ImageMagick/librsvg) drops
  the wordmark's text glyphs. Rebuild the "DriverLog" wordmark as native text instead
  (bold "Driver" + "Log" in Red, or all-white on dark/red backgrounds).
- Voice: plain, practical, driver-first — "track your money," not "financial management."
