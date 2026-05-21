"use server";

import { requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { uploadObject } from "@/lib/storage/r2";
import { revalidatePath } from "next/cache";
import { buildNarration, type NarrationWord } from "@/lib/blog/narrate";

export interface NarrationWordTiming { w: string; start: number; end: number }

const ELEVEN_MODEL = "eleven_multilingual_v2"; // supports <break> + char timestamps
const CHAR_CAP = 2400; // keep each TTS request comfortably under the limit

type ElevenResponse = {
  audio_base64?: string;
  alignment?: {
    characters?: string[];
    character_start_times_seconds?: number[];
    character_end_times_seconds?: number[];
  };
  detail?: { message?: string; status?: string };
};

async function ttsChunk(voiceId: string, key: string, text: string): Promise<{ audio: Buffer; starts: number[]; ends: number[] }> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL }),
    },
  );
  const json = (await res.json()) as ElevenResponse;
  if (!res.ok || !json.audio_base64 || !json.alignment) {
    if (res.status === 402) {
      throw new Error("This ElevenLabs voice needs a paid plan (or pick a voice available on your plan).");
    }
    console.error("ElevenLabs TTS failed", res.status, json.detail);
    throw new Error("Narration is temporarily unavailable. Please try again.");
  }
  return {
    audio: Buffer.from(json.audio_base64, "base64"),
    starts: json.alignment.character_start_times_seconds ?? [],
    ends: json.alignment.character_end_times_seconds ?? [],
  };
}

// Greedily pack words so each chunk's character span stays under CHAR_CAP.
function chunkWords(words: NarrationWord[]): NarrationWord[][] {
  const chunks: NarrationWord[][] = [];
  let cur: NarrationWord[] = [];
  for (const w of words) {
    if (cur.length && w.charEnd - cur[0].charStart > CHAR_CAP) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export async function generateNarration(
  postId: string,
): Promise<{ audioUrl?: string; words?: NarrationWordTiming[]; error?: string }> {
  await requireRole(["super_admin"]);

  const voiceId = process.env.ELEVEN_LABS_VOICE_ID;
  const key = process.env.ELEVEN_LABS_API_KEY;
  if (!voiceId || !key) {
    return { error: "Narration isn't configured." };
  }

  const supabase = createServerClient();
  const { data: post } = await supabase.from("posts").select("id, content_json").eq("id", postId).maybeSingle();
  if (!post) return { error: "Post not found" };

  const { inputText, words } = buildNarration(post.content_json);
  if (!inputText || words.length === 0) {
    return { error: "There's no narratable text yet (headings, paragraphs, and lists are read; tables, images and embeds are skipped)." };
  }

  try {
    const groups = inputText.length <= CHAR_CAP ? [words] : chunkWords(words);
    const audioParts: Buffer[] = [];
    const timings: NarrationWordTiming[] = [];
    let timeOffset = 0;

    for (const group of groups) {
      const chunkStart = group[0].charStart;
      const chunkEnd = group[group.length - 1].charEnd;
      const chunkText = inputText.slice(chunkStart, chunkEnd);
      const { audio, starts, ends } = await ttsChunk(voiceId, key, chunkText);
      const lastEnd = ends.length ? ends[ends.length - 1] : 0;

      for (const word of group) {
        const ls = word.charStart - chunkStart;
        const le = word.charEnd - chunkStart - 1;
        const start = (starts[ls] ?? 0) + timeOffset;
        const end = (ends[Math.min(le, ends.length - 1)] ?? start) + timeOffset;
        timings.push({ w: word.w, start, end });
      }
      audioParts.push(audio);
      timeOffset += lastEnd;
    }

    const audio = Buffer.concat(audioParts);
    const objectKey = `blog-audio/${postId}-${Date.now()}.mp3`;
    const { publicUrl } = await uploadObject(objectKey, audio, "audio/mpeg");

    await supabase
      .from("posts")
      .update({
        audio_url: publicUrl,
        audio_words: timings,
        audio_voice_id: voiceId,
        audio_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    revalidatePath("/admin/blog");
    return { audioUrl: publicUrl, words: timings };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Narration failed" };
  }
}

export async function clearNarration(postId: string): Promise<{ error?: string }> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const { error } = await supabase
    .from("posts")
    .update({ audio_url: null, audio_words: null, audio_voice_id: null, audio_generated_at: null })
    .eq("id", postId);
  if (error) return { error: error.message };
  revalidatePath("/admin/blog");
  return {};
}
