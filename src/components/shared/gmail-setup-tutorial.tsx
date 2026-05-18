"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { CopyPill } from "@/components/shared/copy-pill";

// Six-step walk-through for wiring up Google Workspace Domain-Wide Delegation
// against the StrataWise service account. Rendered inside Settings → Email
// when the manager picks Gmail. Step 1 (enter domain) and Step 6 (enter
// prefix) are inputs OWNED BY THE PARENT — the tutorial only shows the
// instructions for those steps; the fields live alongside.
//
// The Pub/Sub topic ARN, OAuth scopes, and Workspace admin URL are all
// resolved server-side via env so we don't hard-code anything that could
// drift.

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
        title="Enter your firm's email domain"
        body={
          <p>
            Just the bit after the <span className="font-mono">@</span> — strip
            <span className="font-mono"> https://</span>, <span className="font-mono">www.</span>,
            and any trailing slash. Type it in the field above this tutorial.
          </p>
        }
      />

      <Step
        n={2}
        title="Open your Workspace Domain-Wide Delegation page"
        body={
          <p>
            Sign into{" "}
            <a
              href={DWD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[color:var(--brand-gold)] underline-offset-4 hover:underline"
            >
              admin.google.com/ac/owl/domainwidedelegation
              <ExternalLink className="size-3" />
            </a>{" "}
            as a Workspace super admin.
          </p>
        }
        image={{
          src: "/gws-app-tutorial/2.webp",
          alt: "Google Workspace admin → Domain-Wide Delegation",
        }}
      />

      <Step
        n={3}
        title="Click Add new"
        body={
          <p>
            In the top-right of the API clients list, click{" "}
            <span className="font-medium text-foreground">Add new</span> to open
            the authorisation drawer.
          </p>
        }
        image={{
          src: "/gws-app-tutorial/3.webp",
          alt: "Add new API client",
        }}
      />

      <Step
        n={4}
        title="Paste the Client ID and OAuth scopes"
        body={
          <div className="space-y-3">
            <p>
              Paste these two values into the drawer:
            </p>
            {oauthClientId ? (
              <CopyPill label="Client ID" value={oauthClientId} />
            ) : (
              <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
                Gmail send-as is being rolled out for your firm. The Client ID
                will appear here once the integration is live.
              </p>
            )}
            <CopyPill label="OAuth scopes" value={GMAIL_SCOPES} />
          </div>
        }
        image={{
          src: "/gws-app-tutorial/4.webp",
          alt: "Paste Client ID and OAuth scopes",
        }}
      />

      <Step
        n={5}
        title="Click Authorise"
        body={
          <p>
            Click <span className="font-medium text-foreground">Authorize</span>.
            Google sometimes takes a few minutes (up to 24h in rare cases) to
            propagate the grant before the test in Step 6 will pass.
          </p>
        }
      />

      <Step
        n={6}
        title="Enter your mailbox prefix"
        body={
          <p>
            The part before the <span className="font-mono">@</span> in your
            Workspace email. For example{" "}
            <span className="font-mono">mark</span> for{" "}
            <span className="font-mono">mark@stratamanagement.com.au</span>.
            Type it in the field above and click Save — we'll run a live test
            and set up inbox sync in one step.
          </p>
        }
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
  title: string;
  body: React.ReactNode;
  image?: { src: string; alt: string };
}) {
  return (
    <li className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </div>
      <div className="flex-1 space-y-2 text-sm text-foreground">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground leading-relaxed">{body}</div>
        {image && (
          <div className="overflow-hidden rounded-md border border-border bg-cool-muted">
            <Image
              src={image.src}
              alt={image.alt}
              width={1200}
              height={600}
              className="h-auto w-full"
              unoptimized
            />
          </div>
        )}
      </div>
    </li>
  );
}
