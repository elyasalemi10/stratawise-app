"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { CopyPill } from "@/components/shared/copy-pill";

// Five-step DWD walk-through embedded inside the Settings → Email wizard.
// Step 1 (enter domain) and the prefix step live in the parent — this
// component is the bit between them.

const DWD_URL = "https://admin.google.com/ac/owl/domainwidedelegation";
const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.modify";

export function GmailSetupTutorial({
  oauthClientId,
}: {
  oauthClientId: string | null;
}) {
  return (
    <ol className="space-y-5">
      <Step
        n={1}
        title={
          <>
            Go to{" "}
            <a
              href={DWD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[color:var(--brand-gold)] underline-offset-4 hover:underline"
            >
              Domain wide delegations
              <ExternalLink className="size-3" />
            </a>
          </>
        }
        body={
          <p>
            Sign in as a Google Workspace super admin.
          </p>
        }
        image={{
          src: "/gws-app-tutorial/2.webp",
          alt: "Google Workspace admin → Domain-Wide Delegation",
        }}
      />

      <Step
        n={2}
        title="Click Add new"
        body={
          <p>
            In the top-right of the API clients list, click{" "}
            <span className="font-medium text-foreground">Add new</span>.
          </p>
        }
        image={{
          src: "/gws-app-tutorial/3.webp",
          alt: "Add new API client",
        }}
      />

      <Step
        n={3}
        title="Paste the Client ID and OAuth scopes"
        body={
          <div className="space-y-3">
            <p>Paste these two values into the drawer:</p>
            {oauthClientId ? (
              <CopyPill label="Client ID" value={oauthClientId} className="max-w-md" />
            ) : (
              <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
                Gmail send-as is being rolled out for your firm. The Client ID
                will appear here once the integration is live.
              </p>
            )}
            <CopyPill label="OAuth scopes" value={GMAIL_SCOPES} className="max-w-md" />
          </div>
        }
        image={{
          src: "/gws-app-tutorial/4.webp",
          alt: "Paste Client ID and OAuth scopes",
        }}
      />

      <Step
        n={4}
        title="Click Authorise"
        body={<p>That writes the grant. Move on to your mailbox prefix below.</p>}
      />
    </ol>
  );
}

function Step({
  n,
  title,
  body,
  image,
}: {
  n: number;
  title: React.ReactNode;
  body: React.ReactNode;
  image?: { src: string; alt: string };
}) {
  return (
    <li className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </div>
      <div className="flex-1 space-y-2 text-sm text-foreground min-w-0">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground leading-relaxed">{body}</div>
        {image && (
          <div className="overflow-hidden rounded-md border border-border bg-cool-muted max-w-sm">
            <Image
              src={image.src}
              alt={image.alt}
              width={600}
              height={300}
              className="h-auto w-full"
              unoptimized
            />
          </div>
        )}
      </div>
    </li>
  );
}
