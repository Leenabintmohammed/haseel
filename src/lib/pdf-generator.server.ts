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
  payment_link?: string | null;
}

export async function generateInvoicePDF(data: InvoicePDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { height, width } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // لوحة الألوان المحدّثة
  const colors = {
    blackBg: rgb(0.05, 0.05, 0.05),       // أسود للشريط الجانبي
    whiteText: rgb(1, 1, 1),              // أبيض ناصع (تم تطبيقه)
    rotanaGreen: rgb(0.02, 0.59, 0.41),   // أخضر روتانا للتمويج والتمييز
    rotanaLightBg: rgb(0.92, 0.97, 0.94), // خلفية شارة PAID
    sidebarMuted: rgb(0.70, 0.73, 0.76),  // رمادي فاتح للنصوص الفرعية
    bodyText: rgb(0.12, 0.14, 0.17),      // أسود ناعم للجسم الرئيسي
    mutedText: rgb(0.45, 0.48, 0.52),     // رمادي الوصف
    border: rgb(0.88, 0.90, 0.92),        // حدود فاصلة
  };

  // --- 1. Left Dark Sidebar (الشريط الجانبي) ---
  const sidebarWidth = 170;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: sidebarWidth,
    height: height,
    color: colors.blackBg,
  });

  let sideY = height - 45;

  // اسم الشركة (أبيض عريض)
  page.drawText(data.company_name.toUpperCase(), {
    x: 22,
    y: sideY,
    size: 10.5,
    font: fontBold,
    color: colors.whiteText,
  });
  sideY -= 14;

  if (data.company_address) {
    const addressLines = wrapText(data.company_address, 26);
    for (const line of addressLines) {
      page.drawText(line, { x: 22, y: sideY, size: 7.5, font: fontRegular, color: colors.sidebarMuted });
      sideY -= 11;
    }
  }

  sideY -= 25;

  // بيانات الفاتورة
  const drawSidebarField = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: 22, y: sideY, size: 7, font: fontBold, color: colors.rotanaGreen });
    sideY -= 10;
    // القيمة باللون الأبيض
    page.drawText(value, { x: 22, y: sideY, size: 8.5, font: fontRegular, color: colors.whiteText });
    sideY -= 18;
  };

  drawSidebarField("Invoice Reference", `#${data.invoice_number}`);
  drawSidebarField("Issue Date", data.issue_date);
  drawSidebarField("Payment Due", data.due_date);

  sideY -= 10;

  // بيانات العميل (اسم العميل بالأبيض)
  page.drawText("BILLED TO", { x: 22, y: sideY, size: 7, font: fontBold, color: colors.rotanaGreen });
  sideY -= 12;
  page.drawText(data.client_name, { x: 22, y: sideY, size: 9, font: fontBold, color: colors.whiteText });
  sideY -= 12;

  if (data.client_email) {
    const emailLines = wrapText(data.client_email, 24);
    for (const line of emailLines) {
      page.drawText(line, { x: 22, y: sideY, size: 7.5, font: fontRegular, color: colors.sidebarMuted });
      sideY -= 11;
    }
  }

  // --- 2. Main Content Area (المنطقة الرئيسية) ---
  const mainX = sidebarWidth + 30;
  const mainWidth = width - mainX - 30;
  let mainY = height - 45;

  page.drawText("INVOICE", {
    x: mainX,
    y: mainY,
    size: 18,
    font: fontBold,
    color: colors.rotanaGreen,
  });

  // Status Badge
  const balance = data.amount - data.paid_amount;
  const isPaid = balance <= 0;
  const badgeText = isPaid ? "PAID" : "OUTSTANDING";
  const badgeWidth = fontBold.widthOfTextAtSize(badgeText, 7.5) + 14;

  page.drawRectangle({
    x: width - 30 - badgeWidth,
    y: mainY - 1,
    width: badgeWidth,
    height: 16,
    color: isPaid ? colors.rotanaLightBg : rgb(0.98, 0.93, 0.93),
  });

  page.drawText(badgeText, {
    x: width - 30 - badgeWidth + 7,
    y: mainY + 3,
    size: 7.5,
    font: fontBold,
    color: isPaid ? colors.rotanaGreen : rgb(0.8, 0.2, 0.2),
  });

  mainY -= 35;

  // --- 3. Items Table ---
  const cols = {
    desc: mainX,
    qty: mainX + mainWidth - 150,
    price: mainX + mainWidth - 90,
    total: mainX + mainWidth,
  };

  page.drawText("ITEM DESCRIPTION", { x: cols.desc, y: mainY, size: 7, font: fontBold, color: colors.mutedText });
  page.drawText("QTY", { x: cols.qty, y: mainY, size: 7, font: fontBold, color: colors.mutedText });

  const priceLabel = "PRICE";
  page.drawText(priceLabel, {
    x: cols.price - fontBold.widthOfTextAtSize(priceLabel, 7),
    y: mainY, size: 7, font: fontBold, color: colors.mutedText
  });

  const totalLabel = "TOTAL";
  page.drawText(totalLabel, {
    x: cols.total - fontBold.widthOfTextAtSize(totalLabel, 7),
    y: mainY, size: 7, font: fontBold, color: colors.mutedText
  });

  mainY -= 8;

  page.drawLine({
    start: { x: mainX, y: mainY },
    end: { x: mainX + mainWidth, y: mainY },
    thickness: 1,
    color: colors.rotanaGreen,
  });

  mainY -= 16;

  for (const item of data.items) {
    const formattedPrice = formatAmount(item.unit_price, data.currency);
    const formattedTotal = formatAmount(item.line_total, data.currency);

    page.drawText(item.description.substring(0, 36), {
      x: cols.desc,
      y: mainY,
      size: 8.5,
      font: fontRegular,
      color: colors.bodyText,
    });

    page.drawText(item.quantity.toString(), {
      x: cols.qty,
      y: mainY,
      size: 8.5,
      font: fontRegular,
      color: colors.bodyText,
    });

    page.drawText(formattedPrice, {
      x: cols.price - fontRegular.widthOfTextAtSize(formattedPrice, 8.5),
      y: mainY,
      size: 8.5,
      font: fontRegular,
      color: colors.bodyText,
    });

    page.drawText(formattedTotal, {
      x: cols.total - fontBold.widthOfTextAtSize(formattedTotal, 8.5),
      y: mainY,
      size: 8.5,
      font: fontBold,
      color: colors.bodyText,
    });

    mainY -= 10;

    page.drawLine({
      start: { x: mainX, y: mainY },
      end: { x: mainX + mainWidth, y: mainY },
      thickness: 0.5,
      color: colors.border,
    });

    mainY -= 14;
  }

  mainY -= 5;

  // --- 4. Totals Summary ---
  const summaryX = mainX + mainWidth - 170;

  const renderRow = (label: string, value: string, isBold = false) => {
    const font = isBold ? fontBold : fontRegular;
    const size = isBold ? 9.5 : 8;
    const textColor = isBold ? colors.rotanaGreen : colors.mutedText;

    page.drawText(label, { x: summaryX, y: mainY, size, font, color: textColor });
    page.drawText(value, {
      x: cols.total - font.widthOfTextAtSize(value, size),
      y: mainY,
      size,
      font,
      color: isBold ? colors.rotanaGreen : colors.bodyText,
    });
    mainY -= 14;
  };

  renderRow("Subtotal", formatAmount(data.subtotal, data.currency));

  if (data.discount > 0) {
    renderRow("Discount", `-${formatAmount(data.discount, data.currency)}`);
  }

  if (data.tax > 0) {
    renderRow("Tax", formatAmount(data.tax, data.currency));
  }

  mainY -= 2;

  page.drawLine({
    start: { x: summaryX, y: mainY + 10 },
    end: { x: cols.total, y: mainY + 10 },
    thickness: 1,
    color: colors.border,
  });

  renderRow("Amount Due", formatAmount(data.amount, data.currency), true);

  if (data.payment_link?.trim()) {
    mainY -= 15;
    const paymentLink = data.payment_link.trim();
    page.drawText("PAYMENT LINK", {
      x: mainX,
      y: mainY,
      size: 7,
      font: fontBold,
      color: colors.mutedText,
    });
    mainY -= 10;
    const paymentLinkLines = wrapText(
      paymentLink,
      45,
    );
    for (const line of paymentLinkLines) {
      page.drawText(line, {
        x: mainX,
        y: mainY,
        size: 7.5,
        font: fontRegular,
        color: colors.rotanaGreen,
        link: paymentLink,
      });
      mainY -= 10;
    }
  }

  // --- 5. Notes ---
  if (data.notes) {
    mainY -= 15;
    page.drawText("NOTES / TERMS", { x: mainX, y: mainY, size: 7, font: fontBold, color: colors.mutedText });
    mainY -= 10;

    const noteLines = wrapText(data.notes, 55);
    for (const line of noteLines) {
      page.drawText(line, { x: mainX, y: mainY, size: 7.5, font: fontRegular, color: colors.mutedText });
      mainY -= 10;
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
    if (word.length > maxChars) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      continue;
    }
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
