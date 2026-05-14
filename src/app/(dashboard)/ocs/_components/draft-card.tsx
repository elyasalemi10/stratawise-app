"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CircleDashed, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteDraft } from "@/lib/actions/oc";
import { revalidateSidebarFromClient } from "@/lib/sidebar-cache";

// Client wrapper around an in-progress OC-creation draft card. Renders
// the same card as before but adds a hover-revealed trash button that
// opens a confirm dialog → calls the deleteDraft server action →
// refreshes the page to drop the card. The card itself stays a Link to
// the wizard so clicking anywhere else resumes the draft.

export type DraftCardData = {
  id: string;
  label: string;
  step: number;
  address: string | null;
};

export function DraftCard({ draft }: { draft: DraftCardData }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function openConfirm(e: React.MouseEvent) {
    // Stop the click from bubbling to the Link wrapper around the card
    // — clicking trash should never accidentally navigate into the
    // wizard.
    e.preventDefault();
    e.stopPropagation();
    setConfirmOpen(true);
  }

  function handleDelete() {
    startTransition(async () => {
      const r = await deleteDraft(draft.id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      // Refresh the page server-side so the card disappears + the sidebar
      // OC swapper drops the in-progress row.
      revalidateSidebarFromClient();
      router.refresh();
      setConfirmOpen(false);
      toast.success("Draft deleted.");
    });
  }

  return (
    <>
      <div className="group relative">
        <Link href={`/ocs/new?draft=${draft.id}&step=${draft.step}`} className="block">
          <Card className="transition-colors hover:border-primary/30 cursor-pointer border-dashed">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 pr-9">
                <CircleDashed className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {draft.label}{" "}
                    <span className="text-muted-foreground font-normal">
                      — Step {draft.step}/8
                    </span>
                  </p>
                  {draft.address ? (
                    <p className="mt-1 text-xs text-muted-foreground truncate">{draft.address}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Continue setting up this OC</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        {/* Hover-revealed trash button. Absolutely positioned over the
            card's top-right corner so it doesn't take part in the
            card's flex layout (no row reflow when it appears). The
            outer wrapper has group + relative so this catches the
            hover state correctly. */}
        <button
          type="button"
          onClick={openConfirm}
          aria-label={`Delete draft for ${draft.label}`}
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md bg-card border border-border text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive hover:border-destructive/40 cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!pending) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>
              The draft for <strong className="text-foreground">{draft.label}</strong> will be removed,
              along with any uploaded plan / rules / insurance PDFs. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={pending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
