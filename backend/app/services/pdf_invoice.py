"""PDF invoice generation using ReportLab."""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

if TYPE_CHECKING:
    from app.models.invoice import Invoice

# Brand colours
BRAND_DARK = colors.HexColor("#011425")
BRAND_PRIMARY = colors.HexColor("#1F4959")
BRAND_ACCENT = colors.HexColor("#D72B20")
BRAND_LIGHT = colors.HexColor("#F5F7F8")
BRAND_MUTED = colors.HexColor("#5C7C89")
GREY = colors.HexColor("#D9E1E5")

W, H = A4
MARGIN = 15 * mm


def _fmt_currency(amount: Decimal | None) -> str:
    if amount is None:
        return "₹0.00"
    return f"₹{float(amount):,.2f}"


def _fmt_date(d: date | None) -> str:
    if d is None:
        return "-"
    return d.strftime("%d %b %Y")


def _status_color(status: str) -> colors.Color:
    mapping = {
        "PAID": colors.HexColor("#15803D"),
        "PARTIALLY_PAID": colors.HexColor("#B45309"),
        "UNPAID": colors.HexColor("#B42318"),
        "OVERDUE": colors.HexColor("#9F1239"),
        "DRAFT": colors.HexColor("#374151"),
        "CANCELLED": colors.HexColor("#6B7280"),
    }
    return mapping.get(status, BRAND_MUTED)


def generate_invoice_pdf(invoice: "Invoice") -> bytes:
    """Return a PDF byte string for the given invoice."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )
    styles = getSampleStyleSheet()
    story = []

    def _p(text: str, style: ParagraphStyle) -> Paragraph:
        return Paragraph(text or "", style)

    normal = styles["Normal"]
    normal.fontName = "Helvetica"
    normal.fontSize = 9

    small = ParagraphStyle(
        "small", parent=normal, fontSize=8, textColor=BRAND_MUTED
    )
    bold = ParagraphStyle("bold", parent=normal, fontName="Helvetica-Bold")
    heading = ParagraphStyle(
        "heading",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=BRAND_PRIMARY,
    )
    title_style = ParagraphStyle(
        "title_style",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=18,
        textColor=BRAND_DARK,
    )
    label = ParagraphStyle(
        "label", parent=small, textColor=BRAND_MUTED, fontName="Helvetica"
    )
    accent_small = ParagraphStyle(
        "accent_small", parent=small, textColor=BRAND_ACCENT
    )
    accent_bold = ParagraphStyle(
        "accent_bold", parent=bold, textColor=BRAND_ACCENT
    )

    col_w = (W - 2 * MARGIN) / 2  # half-page column

    # ── Header: Company left, Invoice right ───────────────────────────────
    company_lines = [
        _p(invoice.company_name_snapshot, ParagraphStyle("co", parent=bold, fontSize=13, textColor=BRAND_DARK)),
    ]
    if invoice.legal_name_snapshot and invoice.legal_name_snapshot != invoice.company_name_snapshot:
        company_lines.append(_p(invoice.legal_name_snapshot, small))
    if invoice.company_address_snapshot:
        company_lines.append(_p(invoice.company_address_snapshot.replace("\n", "<br/>"), small))
    if invoice.gst_number_snapshot:
        company_lines.append(_p(f"GSTIN: {invoice.gst_number_snapshot}", small))
    if invoice.pan_number_snapshot:
        company_lines.append(_p(f"PAN: {invoice.pan_number_snapshot}", small))
    if invoice.support_email_snapshot:
        company_lines.append(_p(f"Email: {invoice.support_email_snapshot}", small))
    if invoice.support_phone_snapshot:
        company_lines.append(_p(f"Phone: {invoice.support_phone_snapshot}", small))

    inv_info = Table(
        [
            [_p("INVOICE", title_style), ""],
            [_p("Invoice No:", label), _p(invoice.invoice_number, bold)],
            [_p("Invoice Date:", label), _p(_fmt_date(invoice.invoice_date), normal)],
            [_p("Due Date:", label), _p(_fmt_date(invoice.due_date), normal)],
            [
                _p("Status:", label),
                _p(
                    f'<font color="{_status_color(invoice.status).hexval()}">'
                    f"<b>{invoice.status.replace('_', ' ')}</b></font>",
                    normal,
                ),
            ],
        ],
        colWidths=[col_w * 0.4, col_w * 0.6],
    )
    inv_info.setStyle(
        TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("SPAN", (0, 0), (1, 0)),
        ])
    )

    header_table = Table(
        [[company_lines, inv_info]],
        colWidths=[col_w, col_w],
    )
    header_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    story.append(header_table)
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=2, color=BRAND_ACCENT, spaceAfter=4 * mm))

    # ── Customer / Connection info ─────────────────────────────────────────
    full_w = W - 2 * MARGIN
    cust_data = [
        [_p("BILL TO", heading), _p("CONNECTION DETAILS", heading)],
        [_p(invoice.customer_name_snapshot, bold), _p(f"Connection: {invoice.connection_name_snapshot}", normal)],
        [_p(f"Code: {invoice.customer_code_snapshot}", small), _p(f"Plan: {invoice.plan_name_snapshot}", normal)],
        [
            _p(invoice.installation_address_snapshot or "", small),
            _p(f"Speed: {invoice.speed_mbps_snapshot} Mbps  |  Cycle: {invoice.billing_cycle_snapshot.replace('_', ' ').title()}", small),
        ],
    ]
    cust_table = Table(cust_data, colWidths=[col_w, col_w])
    cust_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
            ("TEXTCOLOR", (0, 0), (-1, 0), BRAND_PRIMARY),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.25, GREY),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )
    story.append(cust_table)
    story.append(Spacer(1, 4 * mm))

    # ── Billing period ────────────────────────────────────────────────────
    period_text = (
        f"Billing Period: <b>{_fmt_date(invoice.billing_period_start)}</b>"
        f" to <b>{_fmt_date(invoice.billing_period_end)}</b>"
    )
    story.append(_p(period_text, ParagraphStyle("period", parent=normal, textColor=BRAND_MUTED)))
    story.append(Spacer(1, 4 * mm))

    # ── Line items table ──────────────────────────────────────────────────
    item_header = [_p("Description", bold), _p("Amount", bold)]
    data_policy = invoice.data_policy_snapshot
    fup_text = f" (FUP: {invoice.fup_limit_gb_snapshot} GB)" if invoice.fup_limit_gb_snapshot else ""
    plan_description = (
        f"{invoice.plan_name_snapshot}<br/>"
        f"<font color='#5C7C89' size='8'>"
        f"{invoice.speed_mbps_snapshot} Mbps · {data_policy}{fup_text} · "
        f"{invoice.billing_cycle_snapshot.replace('_', ' ').title()}"
        f"</font>"
    )
    rows = [
        item_header,
        [_p(plan_description, normal), _p(_fmt_currency(invoice.base_amount), normal)],
    ]

    # Discount row
    discount_amount = getattr(invoice, "discount_amount", None) or Decimal("0")
    if discount_amount > 0:
        disc_label_str = getattr(invoice, "discount_label", None) or ""
        disc_type = getattr(invoice, "discount_type", None) or ""
        disc_value = getattr(invoice, "discount_value", None)
        if disc_type == "percentage" and disc_value:
            disc_desc = f"Discount ({float(disc_value):.2g}%)"
        else:
            disc_desc = "Discount"
        if disc_label_str:
            disc_desc += f" — {disc_label_str}"
        effective_base = invoice.base_amount - discount_amount
        rows.append([
            _p(disc_desc, accent_small),
            _p(f"−{_fmt_currency(discount_amount)}", accent_small),
        ])
        rows.append([
            _p("Taxable Base", small),
            _p(_fmt_currency(effective_base), small),
        ])

    # GST row
    rows.append([
        _p(f"GST @ {float(invoice.gst_percentage):.0f}%", small),
        _p(_fmt_currency(invoice.gst_amount), small),
    ])

    # Custom line items
    line_items = getattr(invoice, "line_items", None) or []
    for item in line_items:
        rows.append([
            _p(item.get("description", ""), normal),
            _p(_fmt_currency(Decimal(str(item.get("amount", "0")))), normal),
        ])

    # Row styles
    item_style = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, BRAND_DARK),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, GREY),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    item_table = Table(rows, colWidths=[full_w * 0.75, full_w * 0.25])
    item_table.setStyle(TableStyle(item_style))
    story.append(item_table)

    # ── Totals ────────────────────────────────────────────────────────────
    total_rows: list = []

    # Base plan amount
    total_rows.append(["", _p("Plan Base Amount", label), _p(_fmt_currency(invoice.base_amount), normal)])

    # Discount
    if discount_amount > 0:
        total_rows.append([
            "",
            _p(disc_desc, accent_small),  # type: ignore[possibly-undefined]
            _p(f"−{_fmt_currency(discount_amount)}", accent_small),
        ])

    # GST
    total_rows.append([
        "",
        _p(f"GST ({float(invoice.gst_percentage):.0f}%)", label),
        _p(_fmt_currency(invoice.gst_amount), normal),
    ])

    # Line items subtotal (if any)
    line_items_total = getattr(invoice, "line_items_total", None) or Decimal("0")
    if line_items_total > 0:
        for item in line_items:
            total_rows.append([
                "",
                _p(item.get("description", "Charge"), label),
                _p(_fmt_currency(Decimal(str(item.get("amount", "0")))), normal),
            ])

    # Total
    total_rows.append([
        "",
        _p("Total", ParagraphStyle("tot", parent=bold, fontSize=11)),
        _p(_fmt_currency(invoice.total_amount), ParagraphStyle("totv", parent=bold, fontSize=11, textColor=BRAND_ACCENT)),
    ])
    # Paid
    total_rows.append([
        "",
        _p("Paid Amount", label),
        _p(_fmt_currency(invoice.paid_amount), ParagraphStyle("paid", parent=normal, textColor=colors.HexColor("#15803D"))),
    ])
    # Balance
    total_rows.append([
        "",
        _p("Balance Due", ParagraphStyle("bal", parent=bold, textColor=BRAND_ACCENT)),
        _p(_fmt_currency(invoice.balance_amount), ParagraphStyle("balv", parent=bold, textColor=BRAND_ACCENT)),
    ])

    total_idx_total = len(total_rows) - 3  # row index of "Total"
    total_idx_balance = len(total_rows) - 1

    total_table = Table(total_rows, colWidths=[full_w * 0.45, full_w * 0.3, full_w * 0.25])
    total_table.setStyle(
        TableStyle([
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("LINEABOVE", (1, total_idx_total), (2, total_idx_total), 0.5, GREY),
            ("LINEABOVE", (1, total_idx_balance), (2, total_idx_balance), 1, BRAND_ACCENT),
            ("LINEBELOW", (1, total_idx_balance), (2, total_idx_balance), 1, BRAND_ACCENT),
        ])
    )
    story.append(total_table)
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY, spaceAfter=4 * mm))

    # ── Footer text ───────────────────────────────────────────────────────
    if invoice.invoice_footer_snapshot:
        story.append(_p(invoice.invoice_footer_snapshot.replace("\n", "<br/>"), small))
        story.append(Spacer(1, 3 * mm))

    if invoice.terms_snapshot:
        story.append(_p("Terms & Conditions", ParagraphStyle("tc_h", parent=bold, fontSize=9)))
        story.append(_p(invoice.terms_snapshot.replace("\n", "<br/>"), small))

    doc.build(story)
    return buf.getvalue()
