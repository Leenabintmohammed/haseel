import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { SupabaseClient } from "@supabase/supabase-js";

export interface InvoicePDFData {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  client_name: string;
  client_email?: string;
  company_name: string;
  company_address?: string;
  currency: string;
  amount: number;
  subtotal: number;
  discount: number;
  tax: number;
  paid_amount: number;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  notes?: string;
}

export async function generateInvoicePDF(data: InvoicePDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  
  // Embed Standard Fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Colors Palette
  const primaryColor = rgb(0.12, 0.16, 0.23);   // #1E293B Dark Slate
  const secondaryColor = rgb(0.38, 0.45, 0.55); // #64748B Slate Gray
  const lightBgColor = rgb(0.97, 0.98, 0.99);   // #F8FAFC Very Light Slate
  const borderColor = rgb(0.89, 0.91, 0.94);    // #E2E8F0 Line Border
  const successColor = rgb(0.09, 0.63, 0.42);   // #16A34A Green
  const warningColor = rgb(0.88, 0.40, 0.12);   // #EA580C Orange

  let page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
  const { width, height } = page.getSize();
  
  const margin = 40;
  const contentWidth = width - margin * 2;
  let y = height - margin;

  // Helper for multi-page handling
  const checkPageSpace = (requiredSpace: number) => {
    if (y - requiredSpace < margin) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = height - margin;
      return true;
    }
    return false;
  };

  // 1. Header Section (Company Info & Invoice Title)
  page.drawText(data.company_name.toUpperCase(), {
    x: margin,
    y,
    size: 18,
    font: fontBold,
    color: primaryColor,
  });

  page.drawText("INVOICE", {
    x: width - margin - fontBold.widthOfTextAtSize("INVOICE", 24),
    y,
    size: 24,
    font: fontBold,
    color: primaryColor,
  });

  y -= 18;

  if (data.company_address) {
    const addressLines = wrapText(data.company_address, 40);
    for (const line of addressLines) {
      page.drawText(line, { x: margin, y, size: 9, font: fontRegular, color: secondaryColor });
      y -= 12;
    }
  }

  // Invoice Number Badge / Meta right aligned
  const invMetaX = width - margin - 150;
  let invMetaY = height - margin - 25;
  
  page.drawText(`Invoice No:`, { x: invMetaX, y: invMetaY, size: 9, font: fontBold, color: secondaryColor });
  page.drawText(`#${data.invoice_number}`, { x: invMetaX + 65, y: invMetaY, size: 9, font: fontRegular, color: primaryColor });
  invMetaY -= 14;

  page.drawText(`Issue Date:`, { x: invMetaX, y: invMetaY, size: 9, font: fontBold, color: secondaryColor });
  page.drawText(data.issue_date, { x: invMetaX + 65, y: invMetaY, size: 9, font: fontRegular, color: primaryColor });
  invMetaY -= 14;

  page.drawText(`Due Date:`, { x: invMetaX, y: invMetaY, size: 9, font: fontBold, color: secondaryColor });
  page.drawText(data.due_date, { x: invMetaX + 65, y: invMetaY, size: 9, font: fontRegular, color: primaryColor });

  y = Math.min(y, invMetaY) - 20;

  // Divider Line
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: borderColor,
  });

  y -= 20;

  // 2. Bill To Section
  page.drawText("BILL TO", { x: margin, y, size: 9, font: fontBold, color: secondaryColor });
  y -= 14;

  page.drawText(data.client_name, { x: margin, y, size: 11, font: fontBold, color: primaryColor });
  y -= 14;

  if (data.client_email) {
    page.drawText(data.client_email, { x: margin, y, size: 9, font: fontRegular, color: secondaryColor });
    y -= 14;
  }

  y -= 15;

  // 3. Items Table Header
  const tableHeaderHeight = 24;
  page.drawRectangle({
    x: margin,
    y: y - tableHeaderHeight,
    width: contentWidth,
    height: tableHeaderHeight,
    color: lightBgColor,
  });

  const colX = {
    desc: margin + 10,
    qty: margin + 300,
    unit: margin + 380,
    total: width - margin - 10,
  };

  page.drawText("DESCRIPTION", { x: colX.desc, y: y - 16, size: 8, font: fontBold, color: secondaryColor });
  
  const qtyHead = "QTY";
  page.drawText(qtyHead, { x: colX.qty - fontBold.widthOfTextAtSize(qtyHead, 8), y: y - 16, size: 8, font: fontBold, color: secondaryColor });

  const unitHead = "UNIT PRICE";
  page.drawText(unitHead, { x: colX.unit - fontBold.widthOfTextAtSize(unitHead, 8), y: y - 16, size: 8, font: fontBold, color: secondaryColor });

  const totalHead = "TOTAL";
  page.drawText(totalHead, { x: colX.total - fontBold.widthOfTextAtSize(totalHead, 8), y: y - 16, size: 8, font: fontBold, color: secondaryColor });

  y -= tableHeaderHeight + 8;

  // 4. Line Items Rendering
  for (const item of data.items) {
    checkPageSpace(30);

    const descLines = wrapText(item.description, 45);
    const itemRowHeight = Math.max(descLines.length * 12, 18);

    // Draw Description (Multi-line safe)
    let descY = y;
    for (const line of descLines) {
      page.drawText(line, { x: colX.desc, y: descY, size: 9, font: fontRegular, color: primaryColor });
      descY -= 12;
    }

    // Right-aligned quantities & prices
    const qtyTxt = item.quantity.toString();
    page.drawText(qtyTxt, {
      x: colX.qty - fontRegular.widthOfTextAtSize(qtyTxt, 9),
      y,
      size: 9,
      font: fontRegular,
      color: primaryColor,
    });

    const priceTxt = formatAmount(item.unit_price, data.currency);
    page.drawText(priceTxt, {
      x: colX.unit - fontRegular.widthOfTextAtSize(priceTxt, 9),
      y,
      size: 9,
      font: fontRegular,
      color: primaryColor,
    });

    const lineTotalTxt = formatAmount(item.line_total, data.currency);
    page.drawText(lineTotalTxt, {
      x: colX.total - fontRegular.widthOfTextAtSize(lineTotalTxt, 9),
      y,
      size: 9,
      font: fontBold,
      color: primaryColor,
    });

    y -= itemRowHeight + 6;

    // Subtle row divider line
    page.drawLine({
      start: { x: margin, y: y + 2 },
      end: { x: width - margin, y: y + 2 },
      thickness: 0.5,
      color: lightBgColor,
    });
  }

  y -= 10;
  checkPageSpace(120);

  // 5. Summary & Totals Box
  const summaryWidth = 200;
  const summaryX = width - margin - summaryWidth;

  const drawSummaryRow = (label: string, amountStr: string, isBold = false) => {
    const font = isBold ? fontBold : fontRegular;
    const fontSize = isBold ? 10 : 9;
    const textColor = isBold ? primaryColor : secondaryColor;

    page.drawText(label, { x: summaryX, y, size: fontSize, font, color: textColor });
    
    const amtWidth = font.widthOfTextAtSize(amountStr, fontSize);
    page.drawText(amountStr, {
      x: width - margin - amtWidth,
      y,
      size: fontSize,
      font,
      color: primaryColor,
    });
    y -= 16;
  };

  drawSummaryRow("Subtotal", formatAmount(data.subtotal, data.currency));

  if (data.discount > 0) {
    drawSummaryRow("Discount", `-${formatAmount(data.discount, data.currency)}`);
  }

  if (data.tax > 0) {
    drawSummaryRow("Tax", formatAmount(data.tax, data.currency));
  }

  y -= 4;
  page.drawLine({
    start: { x: summaryX, y: y + 10 },
    end: { x: width - margin, y: y + 10 },
    thickness: 1,
    color: borderColor,
  });

  // Total Due Highlights Block
  const totalBoxHeight = 26;
  page.drawRectangle({
    x: summaryX - 5,
    y: y - totalBoxHeight + 10,
    width: summaryWidth + 5,
    height: totalBoxHeight,
    color: lightBgColor,
  });

  y -= 2;
  drawSummaryRow("Total Due", formatAmount(data.amount, data.currency), true);

  // 6. Payment Status Badge & Notes Section
  y -= 15;
  const balance = data.amount - data.paid_amount;
  const isPaid = balance <= 0;

  // Status Badge Block
  const badgeText = isPaid ? "✓ PAID IN FULL" : `OUTSTANDING: ${formatAmount(balance, data.currency)}`;
  const badgeColor = isPaid ? successColor : warningColor;
  
  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: fontBold.widthOfTextAtSize(badgeText, 9) + 16,
    height: 18,
    color: lightBgColor,
    borderColor: badgeColor,
    borderWidth: 1,
  });

  page.drawText(badgeText, {
    x: margin + 8,
    y: y,
    size: 9,
    font: fontBold,
    color: badgeColor,
  });

  y -= 35;

  // Notes Block
  if (data.notes) {
    checkPageSpace(50);
    page.drawText("NOTES / PAYMENT INSTRUCTIONS", { x: margin, y, size: 8, font: fontBold, color: secondaryColor });
    y -= 12;

    const noteLines = wrapText(data.notes, 90);
    for (const line of noteLines) {
      page.drawText(line, { x: margin, y, size: 8.5, font: fontRegular, color: secondaryColor });
      y -= 11;
    }
  }

  return pdfDoc.save();
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let currentLine = "";
  const words = text.split(" ");
  for (const word of words) {
    if ((currentLine + word).length <= maxChars) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}
