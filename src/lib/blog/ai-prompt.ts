import { ICON_NAMES } from "./timeline-icons";

// The prompt a manager pastes into any LLM to author a StrataWise blog post.
// It returns a single JSON object matching importAiPost's AiPost shape.
export const AI_POST_PROMPT = `You are writing a blog post for StrataWise, a Victorian (Australia) Owners Corporation management platform. Write in clear, helpful Australian English for the audience specified.

Return ONLY a single valid JSON object (no markdown, no code fences, no commentary) matching this exact shape:

{
  "title": "string , the post title",
  "slug": "kebab-case-url-slug",
  "excerpt": "1, 2 sentence summary shown in listings (also the default meta description)",
  "audience": "strata_managers" | "lot_owners",
  "writtenBy": "REQUIRED. The byline name shown at the top of the post (e.g. 'Sarah Chen', 'Jordan Patel'). Pick a plausible real-sounding Australian human name; do NOT use 'StrataWise', 'The Editor', or any organisation name.",
  "tags": ["lowercase", "topic", "tags"],
  "seo": {
    "metaTitle": "≤60 chars, search-result title (can differ from title)",
    "metaDescription": "≤155 chars, compelling search snippet",
    "keywords": ["primary keyword", "secondary keyword"],
    "canonicalUrl": "optional , omit unless this is a republished canonical"
  },
  "cover": {
    "url": "https://… (optional cover image URL; omit if none)",
    "alt": "REQUIRED if url is set , describe the image for SEO & screen readers"
  },
  "body": [ ...blocks... ]
}

The "body" is an ORDERED array of blocks. Allowed block types:

1. Heading:        { "type": "heading", "level": 1 | 2 | 3, "text": "..." }
   Use ONE level-1 sparingly; structure with level 2/3.
2. Paragraph:      { "type": "paragraph", "text": "..." }
3. Bullet list:    { "type": "bulletList", "items": ["item 1", "item 2"] }
4. Numbered list:  { "type": "orderedList", "items": ["step 1", "step 2"] }
5. Quote:          { "type": "blockquote", "text": "..." }
6. Table:          { "type": "table", "headers": ["Col A", "Col B"], "rows": [["a1","b1"], ["a2","b2"]] }
   Every row MUST have the same number of cells as headers. Keep tables small and scannable.
7. Image:          { "type": "image", "url": "https://…", "alt": "REQUIRED , describe the image" }
   Always include meaningful alt text. Use real, accessible image URLs only.
8. Video (YouTube):{ "type": "youtube", "url": "https://www.youtube.com/watch?v=VIDEOID" }
   Standard watch, youtu.be, shorts or embed URLs all work.
9. Timeline:       { "type": "timeline", "steps": [ { "icon": "Rocket", "title": "Step title" } ] }
   "icon" MUST be one of these exact names: ${ICON_NAMES.join(", ")}.
10. Divider:       { "type": "divider" }

Inline formatting inside any "text"/"items"/cell value (use sparingly):
  **bold**, *italic*, \`code\`, [link text](https://url)

Rules:
- Output MUST be valid JSON (double quotes, no trailing commas, escape quotes inside strings).
- Write metaTitle and metaDescription deliberately for SEO (don't just copy the title).
- Every image and the cover MUST have descriptive alt text.
- Tables: headers first, consistent column counts; prefer them only for genuinely tabular data.
- Keep paragraphs short. Aim for a useful, accurate, non-salesy article.
- Do not invent statistics or legal claims; this is Victorian Owners Corporation context (Owners Corporations Act 2006). Use "Owners Corporation"/"OC", never "strata"/"body corporate".

Topic to write about: <DESCRIBE YOUR TOPIC HERE>`;
