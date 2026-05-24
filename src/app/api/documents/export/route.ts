import { NextRequest, NextResponse } from "next/server";
import { zipSync, strToU8, type Zippable } from "fflate";
import { createServerClient } from "@/lib/supabase";
import { requireOCAccess } from "@/lib/auth";
import { fetchObject } from "@/lib/storage/r2";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maps the loose `category` column → human folder name shown inside the ZIP.
// Anything unknown (incl. empty/"other") lands in General/.
const CATEGORY_FOLDERS: Record<string, string> = {
  general: "General",
  other: "General",
  insurance: "Insurance",
  levies: "Levies",
  meetings: "Meetings",
  legal: "Legal",
  maintenance: "Maintenance",
};

// De-duplicate filenames inside a single ZIP folder by suffixing " (n)" before
// the extension. fflate's central directory will silently overwrite the first
// entry on duplicate paths, so we have to do this ourselves.
function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  used.add(`${stem}-${crypto.randomUUID()}${ext}`);
  return `${stem}-${crypto.randomUUID()}${ext}`;
}

export async function GET(request: NextRequest) {
  const ocId = request.nextUrl.searchParams.get("oc_id");
  if (!ocId || !UUID_REGEX.test(ocId)) {
    return NextResponse.json({ error: "Valid oc_id is required" }, { status: 400 });
  }

  try {
    await requireOCAccess(ocId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServerClient();
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, file_name, file_path, category, mime_type")
    .eq("oc_id", ocId);

  if (error) {
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }

  if (!docs || docs.length === 0) {
    return NextResponse.json({ error: "No documents to export" }, { status: 404 });
  }

  // Per-folder filename tracker so the dedup is scoped to the folder, not the
  // whole archive. "Insurance/policy.pdf" and "Levies/policy.pdf" can coexist.
  const folderUsed = new Map<string, Set<string>>();
  const zippable: Zippable = {};
  const failed: string[] = [];

  // Fetch in parallel but bounded , Vercel function memory and R2 quotas don't
  // love 200 concurrent GETs. Promise.all over the doc list with no batching
  // is fine for the usual OC size (<100 docs).
  const fetched = await Promise.all(
    docs.map(async (doc) => {
      try {
        const bytes = await fetchObject(doc.file_path);
        return { doc, bytes };
      } catch {
        failed.push(doc.file_name);
        return null;
      }
    }),
  );

  for (const entry of fetched) {
    if (!entry) continue;
    const folder = CATEGORY_FOLDERS[(entry.doc.category ?? "other").toLowerCase()] ?? "General";
    let used = folderUsed.get(folder);
    if (!used) {
      used = new Set<string>();
      folderUsed.set(folder, used);
    }
    const name = uniqueName(used, entry.doc.file_name);
    zippable[`${folder}/${name}`] = new Uint8Array(entry.bytes);
  }

  if (failed.length > 0) {
    zippable["EXPORT_NOTES.txt"] = strToU8(
      `These files could not be retrieved from storage and were omitted from this archive:\n\n${failed.map((n) => `- ${n}`).join("\n")}\n`,
    );
  }

  // Store-only: PDFs/images are already compressed, deflate gains <2% but
  // costs measurable CPU on a serverless function.
  const archive = zipSync(zippable, { level: 0 });

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="oc-documents-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
