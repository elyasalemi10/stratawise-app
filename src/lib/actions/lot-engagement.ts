"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

// Per-lot engagement read model , meeting participation, votes cast, proxies
// given. Attendance is inferred from the votes table: if a vote row exists
// for one of this OC's meetings with this lot's id on it, the lot took part
// in that meeting. We don't have a separate meeting_attendees table today.
//
// Used by the Owner tab's Engagement card on /ocs/{}/lots/{}.

export interface LotEngagementVoteChoiceCount {
  choice: string;
  count: number;
}

export interface LotEngagementMeeting {
  meeting_id: string;
  reference_number: string | null;
  title: string | null;
  meeting_type: string | null;
  date_time: string;
  votes_cast: number;
  proxies_given: number;
}

export interface LotEngagement {
  // Total meetings the lot has participated in (any vote row).
  meetingsAttended: number;
  // Total individual votes cast across all meetings.
  votesCast: number;
  // Total proxies given (vote.is_proxy=true rows attributed to the lot).
  proxiesGiven: number;
  // ISO timestamp of the most recent meeting this lot took part in.
  lastMeetingAt: string | null;
  // Breakdown of vote choices for the last 12 months.
  choices: LotEngagementVoteChoiceCount[];
  // Most-recent 5 meetings the lot participated in.
  recentMeetings: LotEngagementMeeting[];
}

export async function getLotEngagement(lotId: string): Promise<LotEngagement> {
  await requireCompanyRole();
  const supabase = createServerClient();

  // Pull every vote row attributed to this lot. votes.lot_id is the canonical
  // "who voted" column; a row exists when the lot was registered for the
  // meeting AND a vote was recorded (or a proxy was submitted on its behalf).
  const { data: votes } = await supabase
    .from("votes")
    .select(
      "id, agenda_item_id, choice, is_proxy, proxy_holder_id, created_at",
    )
    .eq("lot_id", lotId)
    .order("created_at", { ascending: false })
    .limit(500);

  const voteRows = votes ?? [];

  // Map agenda items back to meetings so we can count unique meetings.
  const agendaIds = Array.from(
    new Set(
      voteRows
        .map((v) => v.agenda_item_id as string | null)
        .filter((v): v is string => !!v),
    ),
  );

  let agendaToMeeting: Record<string, string> = {};
  const meetingMeta: Record<
    string,
    { reference_number: string | null; title: string | null; meeting_type: string | null; date_time: string }
  > = {};

  if (agendaIds.length > 0) {
    const { data: agenda } = await supabase
      .from("agenda_items")
      .select("id, meeting_id")
      .in("id", agendaIds);
    agendaToMeeting = Object.fromEntries(
      (agenda ?? []).map((a) => [a.id as string, a.meeting_id as string]),
    );

    const meetingIds = Array.from(
      new Set(Object.values(agendaToMeeting).filter(Boolean)),
    );
    if (meetingIds.length > 0) {
      const { data: meetings } = await supabase
        .from("meetings")
        .select("id, reference_number, title, meeting_type, date_time")
        .in("id", meetingIds);
      for (const m of meetings ?? []) {
        meetingMeta[m.id as string] = {
          reference_number: (m.reference_number as string | null) ?? null,
          title: (m.title as string | null) ?? null,
          meeting_type: (m.meeting_type as string | null) ?? null,
          date_time: m.date_time as string,
        };
      }
    }
  }

  // Aggregate per-meeting tallies.
  const perMeeting = new Map<
    string,
    { votes: number; proxies: number; date_time: string }
  >();
  const choiceCounts = new Map<string, number>();
  let proxiesGiven = 0;
  let lastMeetingAt: string | null = null;

  for (const v of voteRows) {
    const meetingId = v.agenda_item_id
      ? agendaToMeeting[v.agenda_item_id as string]
      : undefined;
    if (!meetingId) continue;
    const meta = meetingMeta[meetingId];
    if (!meta) continue;
    const slot =
      perMeeting.get(meetingId) ??
      { votes: 0, proxies: 0, date_time: meta.date_time };
    slot.votes += 1;
    if (v.is_proxy) {
      slot.proxies += 1;
      proxiesGiven += 1;
    }
    perMeeting.set(meetingId, slot);
    if (v.choice) {
      const c = String(v.choice);
      choiceCounts.set(c, (choiceCounts.get(c) ?? 0) + 1);
    }
    if (!lastMeetingAt || meta.date_time > lastMeetingAt) {
      lastMeetingAt = meta.date_time;
    }
  }

  const recentMeetings: LotEngagementMeeting[] = Array.from(perMeeting.entries())
    .map(([id, t]) => ({
      meeting_id: id,
      reference_number: meetingMeta[id]?.reference_number ?? null,
      title: meetingMeta[id]?.title ?? null,
      meeting_type: meetingMeta[id]?.meeting_type ?? null,
      date_time: t.date_time,
      votes_cast: t.votes,
      proxies_given: t.proxies,
    }))
    .sort((a, b) => (a.date_time < b.date_time ? 1 : -1))
    .slice(0, 5);

  const choices: LotEngagementVoteChoiceCount[] = Array.from(
    choiceCounts.entries(),
  )
    .map(([choice, count]) => ({ choice, count }))
    .sort((a, b) => b.count - a.count);

  return {
    meetingsAttended: perMeeting.size,
    votesCast: voteRows.length,
    proxiesGiven,
    lastMeetingAt,
    choices,
    recentMeetings,
  };
}
