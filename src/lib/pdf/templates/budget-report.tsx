import React from "react";
import { Page, View, Text, Document } from "@react-pdf/renderer";
import { baseStyles, colors } from "../styles";
import type { BudgetReportProps } from "../types";
import { PDFHeader, PDFFooter, PDFDocumentTitle } from "./base-template-parts";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function BudgetReport({
  managementCompany,
  oc,
  referenceNumber,
  date,
  financialYear,
  fundLabel,
  status,
  approvedAt,
  approvalNote,
  items,
  totalAmount,
}: BudgetReportProps) {
  return (
    <Document>
      <Page size="A4" style={baseStyles.page} wrap>
        <PDFHeader managementCompany={managementCompany} oc={oc} date={date} />

        <PDFDocumentTitle
          title={`Budget, ${fundLabel}, ${financialYear}`}
          referenceNumber={referenceNumber}
        />

        <View style={baseStyles.body}>
          <View style={{ flexDirection: "row", marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={baseStyles.label}>Financial year</Text>
              <Text style={baseStyles.value}>{financialYear}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={baseStyles.label}>Fund</Text>
              <Text style={baseStyles.value}>{fundLabel}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={baseStyles.label}>Status</Text>
              <Text style={baseStyles.value}>
                {status === "approved" ? "Approved" : "Draft"}
                {approvedAt ? `  ,  ${new Date(approvedAt).toLocaleDateString("en-AU")}` : ""}
              </Text>
            </View>
          </View>

          {approvalNote ? (
            <View style={{ marginBottom: 16 }}>
              <Text style={baseStyles.label}>Approval note</Text>
              <Text style={baseStyles.paragraph}>{approvalNote}</Text>
            </View>
          ) : null}

          {/* Budget items table */}
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 4,
              marginTop: 8,
            }}
          >
            {/* Header row */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: colors.tableStripe,
                paddingVertical: 6,
                paddingHorizontal: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ width: 50, fontFamily: "Helvetica-Bold", fontSize: 9, color: colors.muted }}>Code</Text>
              <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9, color: colors.muted }}>Account</Text>
              <Text style={{ width: 90, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 9, color: colors.muted }}>Annual</Text>
            </View>
            {items.map((it, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  paddingVertical: 5,
                  paddingHorizontal: 8,
                  borderBottomWidth: i === items.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ width: 50, fontSize: 9, fontFamily: "Helvetica", color: colors.foreground }}>{it.code ?? ""}</Text>
                <Text style={{ flex: 1, fontSize: 9, color: colors.foreground }}>
                  {it.description || it.name}
                </Text>
                <Text style={{ width: 90, textAlign: "right", fontSize: 9, fontFamily: "Helvetica", color: colors.foreground }}>
                  {formatCurrency(it.amount)}
                </Text>
              </View>
            ))}
            {/* Total row */}
            <View
              style={{
                flexDirection: "row",
                paddingVertical: 7,
                paddingHorizontal: 8,
                backgroundColor: colors.tableStripe,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ width: 50 }}></Text>
              <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 10, color: colors.foreground }}>Total annual</Text>
              <Text style={{ width: 90, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 10, color: colors.foreground }}>
                {formatCurrency(totalAmount)}
              </Text>
            </View>
          </View>
        </View>

        <PDFFooter managementCompany={managementCompany} referenceNumber={referenceNumber} date={date} />
      </Page>
    </Document>
  );
}
