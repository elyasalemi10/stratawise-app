// Readability transform for blog narration.
//
// Walks the TipTap document JSON and produces:
//   - inputText: the string sent to ElevenLabs, with <break> pauses between
//     structural blocks and audio-only lead-ins ("1." for ordered lists).
//   - words: the VISIBLE, highlightable words in spoken order, each with its
//     character span in inputText (so we can read exact timings back from
//     ElevenLabs' per-character timestamps) and its normalized text (so the
//     player can align by sequence + text, robust to minor tokenisation
//     differences).
//
// Narrated blocks: heading, paragraph, list (bullet/ordered), blockquote.
// Skipped (no audio, no highlight): tables, images, YouTube embeds, code,
// timelines, horizontal rules — tables especially read terribly aloud.

export interface NarrationWord {
  w: string;
  charStart: number;
  charEnd: number;
}
export interface NarrationBuild {
  inputText: string;
  words: NarrationWord[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JNode = { type?: string; text?: string; content?: JNode[] };

/** Shared word normaliser — MUST match the player's tokeniser so word
 *  sequences line up. Keeps tokens whitespace-delimited (no splitting inside
 *  words on dashes) so the player and transformer agree. */
export function normalizeForNarration(input: string): string {
  return input
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, ",")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeForNarration(input: string): string[] {
  const n = normalizeForNarration(input);
  return n ? n.split(" ").filter(Boolean) : [];
}

function extractText(node: JNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.content) return node.content.map(extractText).join("");
  return "";
}

export function buildNarration(doc: unknown): NarrationBuild {
  const words: NarrationWord[] = [];
  let text = "";

  function sep() {
    if (text.length && !text.endsWith(" ") && !text.endsWith(">")) text += " ";
  }
  function addWord(w: string) {
    sep();
    const start = text.length;
    text += w;
    words.push({ w, charStart: start, charEnd: text.length });
  }
  function addLead(s: string) {
    sep();
    text += s;
  }
  function addBreak(seconds: number) {
    text += ` <break time="${seconds}s" />`;
  }
  function addProse(raw: string) {
    for (const w of tokenizeForNarration(raw)) addWord(w);
  }

  const root = doc as JNode | null;
  const blocks = root?.content ?? [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const before = words.length;
        addProse(extractText(block));
        if (words.length > before) addBreak(0.6);
        break;
      }
      case "paragraph": {
        const before = words.length;
        addProse(extractText(block));
        if (words.length > before) addBreak(0.4);
        break;
      }
      case "blockquote": {
        const before = words.length;
        addProse(extractText(block));
        if (words.length > before) addBreak(0.4);
        break;
      }
      case "bulletList": {
        for (const li of block.content ?? []) {
          const before = words.length;
          addProse(extractText(li));
          if (words.length > before) addBreak(0.3);
        }
        break;
      }
      case "orderedList": {
        let n = 1;
        for (const li of block.content ?? []) {
          addLead(`${n}.`);
          addProse(extractText(li));
          addBreak(0.3);
          n++;
        }
        break;
      }
      // Skipped: table, image, youtube, codeBlock, timeline, horizontalRule.
      default:
        break;
    }
  }

  return { inputText: text.trim(), words };
}
