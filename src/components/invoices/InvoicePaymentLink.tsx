type InvoicePaymentLinkProps = {
  paymentLink?: string | null;
};

export function InvoicePaymentLink({
  paymentLink,
}: InvoicePaymentLinkProps) {
  const href = paymentLink?.trim();

  if (!href) {
    return null;
  }

  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold">
        Payment Link
      </h3>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all text-sm text-primary underline underline-offset-4"
      >
        {href}
      </a>
    </section>
  );
}
