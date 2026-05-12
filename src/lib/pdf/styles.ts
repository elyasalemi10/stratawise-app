import { StyleSheet } from "@react-pdf/renderer";

/**
 * Shared PDF styles for all StrataWise document templates.
 * Uses Helvetica (built-in) as the base font.
 * Colour palette matches the StrataWise design system.
 */

export const colors = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  tableStripe: "#f5f7fa",
  white: "#ffffff",
  destructive: "#ef4444",
  primary: "#2b7fff",
} as const;

export const baseStyles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.foreground,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
  },

  // --- Header ---
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  logo: {
    maxHeight: 50,
    maxWidth: 200,
    objectFit: "contain" as const,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.foreground,
  },
  ocDetails: {
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 1.4,
  },
  headerDate: {
    fontSize: 9,
    color: colors.muted,
    textAlign: "right" as const,
  },
  headerSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 20,
  },

  // --- Document title ---
  documentTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: colors.foreground,
    marginBottom: 4,
  },
  referenceNumber: {
    fontSize: 9,
    color: colors.muted,
    marginBottom: 20,
  },

  // --- Body content ---
  body: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.foreground,
    marginTop: 16,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  label: {
    fontSize: 9,
    color: colors.muted,
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    marginBottom: 8,
  },

  // --- Tables ---
  table: {
    marginVertical: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableHeaderCell: {
    padding: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.foreground,
  },
  tableRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tableRowStriped: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.tableStripe,
  },
  tableCell: {
    padding: 6,
    fontSize: 9,
  },
  tableCellRight: {
    padding: 6,
    fontSize: 9,
    textAlign: "right" as const,
  },
  tableTotalRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.foreground,
  },
  tableTotalCell: {
    padding: 6,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
  },
  tableTotalCellRight: {
    padding: 6,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
    textAlign: "right" as const,
  },

  // --- Footer ---
  footer: {
    position: "absolute" as const,
    bottom: 30,
    left: 40,
    right: 40,
  },
  footerSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  footerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: colors.muted,
    lineHeight: 1.4,
  },
  footerPageNumber: {
    fontSize: 8,
    color: colors.muted,
    textAlign: "right" as const,
  },

  // --- Utility ---
  row: {
    flexDirection: "row",
  },
  spacer: {
    marginTop: 12,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginVertical: 12,
  },
});
