import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import "../../fonts";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  white: "#ffffff",
};
const FONT = "NunitoSans";

export type VcatBlock =
  | { type: "heading"; text: string }
  | { type: "para"; text: string }
  | { type: "kv"; rows: Array<{ label: string; value: string }> }
  | { type: "table"; head: string[]; rows: string[][] };

export interface VcatDocProps {
  companyName: string;
  companyLogoUrl?: string | null;
  companyAbn?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  brandColor?: string | null;
  title: string;
  subtitle?: string | null;
  reference?: string | null;
  blocks: VcatBlock[];
}

export function VcatDoc({ companyName, companyLogoUrl, companyAbn, companyEmail, companyPhone, brandColor, title, subtitle, reference, blocks }: VcatDocProps) {
  const brand = brandColor || "#0E314C";
  const s = StyleSheet.create({
    page: { fontFamily: FONT, fontSize: 10, color: c.foreground, paddingTop: 28, paddingBottom: 28, paddingHorizontal: 28 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
    logo: { maxHeight: 50, maxWidth: 140, objectFit: "contain" as const },
    companyBlock: { alignItems: "flex-end" as const },
    company: { fontSize: 10, fontWeight: 600, color: c.foreground, textAlign: "right" as const },
    companyMeta: { fontSize: 8, color: c.muted, textAlign: "right" as const, marginTop: 1 },
    titleBar: { borderBottomWidth: 2, borderBottomColor: brand, paddingBottom: 6, marginBottom: 4 },
    title: { fontSize: 16, fontWeight: 700, color: brand },
    subtitle: { fontSize: 9, color: c.muted, marginTop: 2 },
    ref: { fontSize: 9, color: c.muted, marginBottom: 12 },
    heading: { fontSize: 11, fontWeight: 700, color: c.foreground, marginTop: 12, marginBottom: 6 },
    para: { fontSize: 10, color: c.foreground, lineHeight: 1.5, marginBottom: 8 },
    kvRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: c.border },
    kvLabel: { fontSize: 9, color: c.muted, width: 210, paddingRight: 16 },
    kvValue: { fontSize: 10, color: c.foreground, flex: 1 },
    th: { flexDirection: "row", backgroundColor: brand, paddingVertical: 5, paddingHorizontal: 6 },
    thCell: { fontSize: 9, fontWeight: 700, color: c.white, flex: 1 },
    tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: c.border },
    td: { fontSize: 9, color: c.foreground, flex: 1 },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.topRow}>
          {companyLogoUrl ? <Image src={companyLogoUrl} style={s.logo} /> : <View />}
          <View style={s.companyBlock}>
            <Text style={s.company}>{companyName}</Text>
            {companyAbn ? <Text style={s.companyMeta}>ABN {companyAbn}</Text> : null}
            {companyEmail ? <Text style={s.companyMeta}>{companyEmail}</Text> : null}
            {companyPhone ? <Text style={s.companyMeta}>{companyPhone}</Text> : null}
          </View>
        </View>
        <View style={s.titleBar}><Text style={s.title}>{title}</Text></View>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        {reference ? <Text style={s.ref}>{reference}</Text> : null}

        {blocks.map((b, i) => {
          if (b.type === "heading") return <Text key={i} style={s.heading}>{b.text}</Text>;
          if (b.type === "para") return <Text key={i} style={s.para}>{b.text}</Text>;
          if (b.type === "kv") return (
            <View key={i} style={{ marginBottom: 8 }}>
              {b.rows.filter((r) => r.value && r.value.trim().length > 0).map((r, j) => (
                <View key={j} style={s.kvRow}><Text style={s.kvLabel}>{r.label}</Text><Text style={s.kvValue}>{r.value}</Text></View>
              ))}
            </View>
          );
          return (
            <View key={i} style={{ marginBottom: 8 }}>
              <View style={s.th}>{b.head.map((h, j) => <Text key={j} style={s.thCell}>{h}</Text>)}</View>
              {b.rows.map((row, j) => (
                <View key={j} style={s.tr}>{row.map((cell, k) => <Text key={k} style={s.td}>{cell}</Text>)}</View>
              ))}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
