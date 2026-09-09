# How this got built

The brief asked how the AI tool was steered rather than just prompted. So here
is the actual record: what was decided before any code existed, what got
rejected, what broke, and how it was caught.

Tool: Claude Code. Roughly two hours end to end.

## The order of work

Plan first, code second. Before a single file existed I had the tool read the
machine it would run on and report back: which ffmpeg was installed and what it
was compiled with, which voices existed, which fonts were on disk, whether any
API keys were around. That check paid for itself immediately (see the first
problem below).

Then the pieces were built bottom up, each one verified before the next:

1. Pure functions with no I/O: sentence splitting, timing, subtitle building.
2. The voice engines and audio assembly, checked against ffprobe.
3. Scene suggestions, with both the model path and the fallback exercised.
4. The server and the page last, once everything under them was known good.
5. A smoke test that renders for real and inspects the MP4.

## Decisions worth explaining

**ffmpeg with libass, not a React video renderer.** Remotion or a headless
browser would have made the captions easy to style, at the cost of a build
step, a Chrome download, and a much slower render. Subtitles in ASS format
burned by libass gets word-level control, and the render is a single command
that finishes in a couple of seconds.

**Word timings are calculated, not faked and not measured.** The system voices
return audio with no timing data. Rather than pretend, each sentence is
measured with ffprobe, and words inside it are given time in proportion to how
long they take to say. That approximation lives in exactly one file with tests
around it, behind a seam an engine with real timestamps can fill instead.
`lib/tts/elevenlabs.js` is that seam, written but not exercised, and it says so
at the top of the file rather than pretending to be tested.

**The word highlight uses one subtitle event per word, not karaoke tags.** ASS
has `\k` tags built for exactly this. They fill text from the left like a
progress bar and cannot colour a single word on its own. Emitting one event per
word window is more lines in the file, but only the colour changes between
them, so a centred line never shifts while it plays. It is also trivial to
unit-test, which karaoke timing is not.

**Everything degrades instead of failing.** No API key means the scene planner
falls back to a heuristic and the page says so. A voice engine that errors
falls back to the one built into the operating system. The demo cannot die
because a network call did.

**Fonts are bundled, not assumed.** Two OFL fonts sit in the repo and get
handed to ffmpeg directly. Nothing depends on what the machine has installed,
which matters because this was built on a Mac and recorded on a PC.

## What went wrong, and how it was caught

**The installed ffmpeg could not draw text.** The Homebrew build on this
machine had no libass, no freetype, no fontconfig. `drawtext` and `subtitles`
were both missing. Discovered by the environment check before any code was
written, not after a confusing render failure. The fix was the `ffmpeg-static`
binary, which does include libass, and that has the side benefit of being the
same package on Windows. `npm run doctor` now makes that check part of the
tool.

**Captions blinked between sentences.** The audio has a short breath between
sentences and the captions ended with the words, so the screen went blank for
about two tenths of a second every sentence. Caught by pulling single frames
out of the render and looking at them, not by reading the code. Each cue now
holds until the next one starts.

**Scene labels blinked at the same seams,** for the same reason, found the same
way, fixed the same way.

**The Classic bar was invisible.** A translucent black caption box on a black
canvas is nothing at all. The box colour is lifted off pure black now.

**A stray word could flash on its own** in the Pop style: a script that split
into four words then one left the last word alone on screen. The splitter now
takes a word back off the previous cue, so four-plus-one becomes three-plus-two.

**The model cannot be trusted with array indices.** Scene ranges from the model
are clamped, sorted, de-overlapped, renumbered, and stripped of characters that
would break the subtitle format, and the same normalizer runs over the
heuristic output. There is a test that feeds it deliberately broken data.

## What is tested and what is not

`npm test` covers the parts where being wrong is silent: sentence splitting
against abbreviations and decimals, timing that has to be contiguous and add
up, subtitle escaping and event emission for both styles, and scene
normalisation against hostile input. None of it needs ffmpeg or a voice, so it
runs anywhere in about a second.

`npm run smoke` does what unit tests cannot: it renders both styles for real
and asks ffprobe whether the result is genuinely one file with one video
stream, one audio stream, the right dimensions, and a duration that matches the
voice track.

Not tested: the Windows voice path (built on a Mac, verified on the PC before
recording) and the ElevenLabs adapter (no key was used).

## What I would do next

Real word timestamps, either from a paid voice that returns them or from a
local speech-to-text pass over the rendered audio. Everything else is already
shaped to accept them.
