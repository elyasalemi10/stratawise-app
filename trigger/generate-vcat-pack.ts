import { task } from "@trigger.dev/sdk";
import { buildVcatPack } from "@/lib/vcat/generate";

// Background VCAT pack generation (optional path; the UI generates inline so
// the Download link is immediate). Available for very large packs.
export const generateVcatPackTask = task({
  id: "generate-vcat-pack",
  maxDuration: 600,
  run: async (payload: { lotId: string; levyNoticeId: string; performerId: string | null }) => {
    return await buildVcatPack(payload);
  },
});
