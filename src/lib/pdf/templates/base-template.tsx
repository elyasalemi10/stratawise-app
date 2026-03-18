import React from "react";
import { Document, Page, View } from "@react-pdf/renderer";
import { baseStyles } from "../styles";
import type { BaseDocumentProps } from "../types";
import { PDFHeader, PDFFooter, PDFDocumentTitle } from "./base-template-parts";

interface BaseTemplateProps extends BaseDocumentProps {
  children: React.ReactNode;
}

/**
 * Base PDF template for all MSM documents.
 *
 * Renders the management company's branding (not MSM branding).
 * Provides consistent header, document title, and footer across all PDFs.
 *
 * For simple single-page documents, use this directly:
 *   <BaseTemplate {...props}>{content}</BaseTemplate>
 *
 * For complex multi-page documents (levy notices, meeting minutes),
 * use the individual parts (PDFHeader, PDFFooter, PDFDocumentTitle)
 * to compose custom layouts with their own <Document> and <Page>.
 */
export function BaseTemplate({
  managementCompany,
  subdivision,
  documentTitle,
  referenceNumber,
  date,
  children,
}: BaseTemplateProps) {
  return (
    <Document>
      <Page size="A4" style={baseStyles.page}>
        <PDFHeader
          managementCompany={managementCompany}
          subdivision={subdivision}
          date={date}
        />

        <PDFDocumentTitle
          title={documentTitle}
          referenceNumber={referenceNumber}
        />

        <View style={baseStyles.body}>{children}</View>

        <PDFFooter
          managementCompany={managementCompany}
          referenceNumber={referenceNumber}
          date={date}
        />
      </Page>
    </Document>
  );
}

// Re-export parts for custom template composition
export { PDFHeader, PDFFooter, PDFDocumentTitle } from "./base-template-parts";
