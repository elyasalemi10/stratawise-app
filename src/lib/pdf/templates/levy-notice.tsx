import React from "react";
import { Page, View, Text, Document } from "@react-pdf/renderer";
import { baseStyles, colors } from "../styles";
import type { LevyNoticeProps } from "../types";
import { PDFHeader, PDFFooter, PDFDocumentTitle } from "./base-template-parts";

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function LevyNotice({
  managementCompany,
  subdivision,
  referenceNumber,
  date,
  lotOwner,
  levyPeriod,
  lineItems,
  totalDue,
  dueDate,
  paymentInstructions,
  outstandingBalances,
  penaltyInterestRate,
}: LevyNoticeProps) {
  const hasOutstanding = outstandingBalances && outstandingBalances.length > 0;

  return (
    <Document>
      <Page size="A4" style={baseStyles.page}>
        <PDFHeader
          managementCompany={managementCompany}
          subdivision={subdivision}
          date={date}
        />

        <PDFDocumentTitle
          title="Tax invoice / Levy notice"
          referenceNumber={referenceNumber}
        />

        <View style={baseStyles.body}>
          {/* ── Lot owner details ── */}
          <View style={{ marginBottom: 16 }}>
            <Text style={baseStyles.label}>Issued to</Text>
            <Text style={[baseStyles.value, baseStyles.bold]}>
              {lotOwner.name}
            </Text>
            <Text style={baseStyles.value}>
              Lot {lotOwner.lot_number} — {lotOwner.address}
            </Text>
          </View>

          {/* ── Levy period ── */}
          <View style={{ marginBottom: 16 }}>
            <Text style={baseStyles.label}>Levy period</Text>
            <Text style={baseStyles.value}>
              {levyPeriod.start} — {levyPeriod.end}
            </Text>
          </View>

          {/* ── Amount due table ── */}
          <Text style={baseStyles.sectionTitle}>Amount due</Text>
          <View style={baseStyles.table}>
            {/* Header */}
            <View style={baseStyles.tableHeader}>
              <Text style={[baseStyles.tableHeaderCell, { flex: 3 }]}>
                Description
              </Text>
              <Text
                style={[
                  baseStyles.tableHeaderCell,
                  { flex: 1, textAlign: "right" },
                ]}
              >
                Amount
              </Text>
            </View>

            {/* Line items */}
            {lineItems.map((item, i) => (
              <View
                key={i}
                style={i % 2 === 1 ? baseStyles.tableRowStriped : baseStyles.tableRow}
              >
                <Text style={[baseStyles.tableCell, { flex: 3 }]}>
                  {item.description}
                </Text>
                <Text style={[baseStyles.tableCellRight, { flex: 1 }]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>
            ))}

            {/* Total row */}
            <View style={baseStyles.tableTotalRow}>
              <Text style={[baseStyles.tableTotalCell, { flex: 3 }]}>
                Total due
              </Text>
              <Text style={[baseStyles.tableTotalCellRight, { flex: 1 }]}>
                {formatCurrency(totalDue)}
              </Text>
            </View>
          </View>

          {/* ── Due date ── */}
          <View
            style={{
              marginTop: 12,
              marginBottom: 16,
              padding: 10,
              backgroundColor: colors.tableStripe,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={baseStyles.label}>Due date</Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Helvetica-Bold",
                color: colors.foreground,
              }}
            >
              {dueDate}
            </Text>
          </View>

          {/* ── Payment instructions ── */}
          <Text style={baseStyles.sectionTitle}>Payment instructions</Text>
          <Text style={baseStyles.paragraph}>
            Pay via BPAY or EFT using reference: {referenceNumber}
          </Text>

          {paymentInstructions.bpay ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={[baseStyles.label, { marginBottom: 4 }]}>BPAY</Text>
              <Text style={baseStyles.paragraph}>
                Biller code: {paymentInstructions.bpay.biller_code}
              </Text>
              <Text style={baseStyles.paragraph}>
                Reference: {paymentInstructions.bpay.reference}
              </Text>
            </View>
          ) : null}

          <View style={{ marginBottom: 12 }}>
            <Text style={[baseStyles.label, { marginBottom: 4 }]}>
              Electronic funds transfer (EFT)
            </Text>
            <Text style={baseStyles.paragraph}>
              BSB: {paymentInstructions.eft.bsb}
            </Text>
            <Text style={baseStyles.paragraph}>
              Account number: {paymentInstructions.eft.account_number}
            </Text>
            <Text style={baseStyles.paragraph}>
              Account name: {paymentInstructions.eft.account_name}
            </Text>
            <Text style={baseStyles.paragraph}>
              Reference: {paymentInstructions.eft.reference}
            </Text>
          </View>

          {/* ── Outstanding balances ── */}
          {hasOutstanding ? (
            <>
              <View style={baseStyles.divider} />
              <Text style={baseStyles.sectionTitle}>Outstanding balances</Text>
              <View style={baseStyles.table}>
                <View style={baseStyles.tableHeader}>
                  <Text style={[baseStyles.tableHeaderCell, { flex: 2 }]}>
                    Reference
                  </Text>
                  <Text style={[baseStyles.tableHeaderCell, { flex: 2 }]}>
                    Period
                  </Text>
                  <Text
                    style={[
                      baseStyles.tableHeaderCell,
                      { flex: 1, textAlign: "right" },
                    ]}
                  >
                    Amount
                  </Text>
                </View>
                {outstandingBalances.map((balance, i) => (
                  <View
                    key={i}
                    style={
                      i % 2 === 1
                        ? baseStyles.tableRowStriped
                        : baseStyles.tableRow
                    }
                  >
                    <Text style={[baseStyles.tableCell, { flex: 2 }]}>
                      {balance.reference}
                    </Text>
                    <Text style={[baseStyles.tableCell, { flex: 2 }]}>
                      {balance.period}
                    </Text>
                    <Text
                      style={[
                        baseStyles.tableCellRight,
                        { flex: 1, color: colors.destructive },
                      ]}
                    >
                      {formatCurrency(balance.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* ── Penalty interest notice ── */}
          {penaltyInterestRate != null && penaltyInterestRate > 0 ? (
            <View style={{ marginTop: 16 }}>
              <Text
                style={{
                  fontSize: 9,
                  color: colors.muted,
                  fontStyle: "italic",
                }}
              >
                Interest of up to {penaltyInterestRate}% per month may be
                charged on overdue amounts in accordance with the Owners
                Corporations Act 2006 (Vic).
              </Text>
            </View>
          ) : null}
        </View>

        <PDFFooter
          managementCompany={managementCompany}
          referenceNumber={referenceNumber}
          date={date}
        />
      </Page>
    </Document>
  );
}
