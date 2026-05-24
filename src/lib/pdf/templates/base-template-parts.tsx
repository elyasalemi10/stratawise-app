import React from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import { baseStyles } from "../styles";
import type { ManagementCompany, OC } from "../types";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Reusable PDF header block.
 * Renders management company logo/name, oc details, and date.
 */
export function PDFHeader({
  managementCompany,
  oc,
  date,
}: {
  managementCompany: ManagementCompany;
  oc: OC;
  date: Date;
}) {
  return (
    <>
      <View style={baseStyles.header}>
        <View style={baseStyles.headerLeft}>
          {managementCompany.logo_url ? (
            <Image
              src={managementCompany.logo_url}
              style={baseStyles.logo}
            />
          ) : null}
          <View>
            <Text style={baseStyles.companyName}>
              {managementCompany.name}
            </Text>
            <Text style={baseStyles.ocDetails}>
              {oc.name}
            </Text>
            <Text style={baseStyles.ocDetails}>
              {oc.address}
            </Text>
            {oc.abn ? (
              <Text style={baseStyles.ocDetails}>
                ABN: {oc.abn}
              </Text>
            ) : null}
            <Text style={baseStyles.ocDetails}>
              Plan: {oc.plan_number}
            </Text>
          </View>
        </View>
        <Text style={baseStyles.headerDate}>{formatDate(date)}</Text>
      </View>
      <View style={baseStyles.headerSeparator} />
    </>
  );
}

/**
 * Reusable document title + reference number block.
 */
export function PDFDocumentTitle({
  title,
  referenceNumber,
}: {
  title: string;
  referenceNumber: string;
}) {
  return (
    <>
      <Text style={baseStyles.documentTitle}>{title}</Text>
      <Text style={baseStyles.referenceNumber}>
        Reference: {referenceNumber}
      </Text>
    </>
  );
}

/**
 * Reusable PDF footer block.
 * Uses `fixed` positioning , rendered on every page.
 */
export function PDFFooter({
  managementCompany,
  referenceNumber,
  date,
}: {
  managementCompany: ManagementCompany;
  referenceNumber: string;
  date: Date;
}) {
  const dateStr = formatDate(date);
  const timeStr = formatTime(date);

  return (
    <View style={baseStyles.footer} fixed>
      <View style={baseStyles.footerSeparator} />
      <View style={baseStyles.footerContent}>
        <View>
          <Text style={baseStyles.footerText}>{managementCompany.name}</Text>
          <Text style={baseStyles.footerText}>
            Generated on {dateStr} at {timeStr}
          </Text>
          <Text style={baseStyles.footerText}>
            This is a system-generated document.
          </Text>
          <Text style={baseStyles.footerText}>
            Reference: {referenceNumber}
          </Text>
        </View>
        <Text
          style={baseStyles.footerPageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </View>
  );
}
