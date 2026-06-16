"""PDF invoice generation — two-column sidebar layout with logo & ₹ support."""

from __future__ import annotations

import io
from decimal import Decimal
from typing import TYPE_CHECKING

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    FrameBreak,
    HRFlowable,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

if TYPE_CHECKING:
    from app.models.invoice import Invoice

# ── Register Unicode fonts (DejaVu Sans supports the ₹ glyph) ────────────────
_DEJAVU         = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
_DEJAVU_BOLD    = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
_DEJAVU_ITALIC  = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"

try:
    pdfmetrics.registerFont(TTFont("DV",      _DEJAVU))
    pdfmetrics.registerFont(TTFont("DV-Bold", _DEJAVU_BOLD))
    pdfmetrics.registerFont(TTFont("DV-Ital", _DEJAVU_ITALIC))
    pdfmetrics.registerFontFamily("DV", normal="DV", bold="DV-Bold", italic="DV-Ital")
    _FONT     = "DV"
    _FONT_BD  = "DV-Bold"
except Exception:
    _FONT     = "Helvetica"
    _FONT_BD  = "Helvetica-Bold"

# ── Colours ───────────────────────────────────────────────────────────────────
DARK    = colors.HexColor("#011425")
PRIMARY = colors.HexColor("#1F4959")
ACCENT  = colors.HexColor("#D72B20")
MUTED   = colors.HexColor("#5C7C89")
SIDEBAR = colors.HexColor("#D6E4EE")
LIGHT   = colors.HexColor("#F9FAFB")
GREY    = colors.HexColor("#D9E1E5")
WHITE   = colors.white
BLACK   = colors.HexColor("#0D1B2A")

# ── Geometry (A4 = 595 × 842 pts) ────────────────────────────────────────────
W, H       = A4
HEADER_H   = 36 * mm
FOOTER_H   = 11 * mm
SIDEBAR_W  = 57 * mm
INNER_PAD  = 5  * mm
OUTER_PAD  = 9  * mm
GAP        = 5  * mm

CONTENT_X  = SIDEBAR_W + GAP
CONTENT_W  = W - CONTENT_X - OUTER_PAD
BODY_BOT   = FOOTER_H + 4 * mm
BODY_TOP   = H - HEADER_H - 4 * mm
BODY_H     = BODY_TOP - BODY_BOT


# ── Helpers ───────────────────────────────────────────────────────────────────
def _cur(v) -> str:
    if v is None:
        return "\u20b90.00"
    return f"\u20b9{float(v):,.2f}"


def _date(d) -> str:
    if d is None:
        return "\u2014"
    return d.strftime("%d %b %Y")


def _p(text, style) -> Paragraph:
    return Paragraph(str(text or ""), style)


def _s(name: str = "_", parent=None, **kw) -> ParagraphStyle:
    if parent:
        return ParagraphStyle(name, parent=parent, **kw)
    return ParagraphStyle(
        name,
        fontName=kw.pop("fontName", _FONT),
        fontSize=kw.pop("fontSize", 8),
        leading=kw.pop("leading", 11),
        textColor=kw.pop("textColor", BLACK),
        **kw,
    )


# ── Page chrome ───────────────────────────────────────────────────────────────
def _make_on_page(invoice: "Invoice", logo_path: str | None):
    company  = invoice.company_name_snapshot or ""
    email    = invoice.support_email_snapshot or ""
    phone    = invoice.support_phone_snapshot or ""
    website  = getattr(invoice, "support_website_snapshot", "") or ""
    gstin    = invoice.gst_number_snapshot or ""

    # Pre-load image once
    logo_img = None
    if logo_path:
        try:
            logo_img = ImageReader(logo_path)
        except Exception:
            logo_img = None

    def on_page(canv, doc):
        canv.saveState()

        # ── Header bar ───────────────────────────────────────────────────────
        canv.setFillColor(DARK)
        canv.rect(0, H - HEADER_H, W, HEADER_H, fill=1, stroke=0)

        # Logo box
        lx = INNER_PAD
        lw = SIDEBAR_W - 2 * INNER_PAD
        ly = H - HEADER_H + INNER_PAD
        lh = HEADER_H - 2 * INNER_PAD

        canv.setFillColor(WHITE)
        canv.roundRect(lx, ly, lw, lh, 4, fill=1, stroke=0)

        if logo_img:
            # Fit logo inside the white box with small padding
            pad = 2 * mm
            img_x = lx + pad
            img_y = ly + pad
            img_w = lw - 2 * pad
            img_h = lh - 2 * pad
            canv.drawImage(
                logo_img, img_x, img_y, img_w, img_h,
                preserveAspectRatio=True, anchor="c", mask="auto",
            )
        else:
            # Text fallback
            canv.setFillColor(DARK)
            canv.setFont(_FONT_BD, 8)
            mid_x = lx + lw / 2
            mid_y = ly + lh / 2 + (4 if gstin else 0)
            canv.drawCentredString(mid_x, mid_y, company)
            if gstin:
                canv.setFont(_FONT, 6)
                canv.setFillColor(MUTED)
                canv.drawCentredString(mid_x, mid_y - 9, f"GSTIN: {gstin}")

        # "INVOICE" title
        canv.setFillColor(WHITE)
        canv.setFont(_FONT_BD, 28)
        canv.drawRightString(
            W - OUTER_PAD,
            H - HEADER_H + (HEADER_H - 28) / 2 + 2,
            "INVOICE",
        )

        # ── Sidebar background ────────────────────────────────────────────────
        canv.setFillColor(SIDEBAR)
        canv.rect(0, FOOTER_H, SIDEBAR_W, H - HEADER_H - FOOTER_H, fill=1, stroke=0)

        # ── Footer bar ────────────────────────────────────────────────────────
        canv.setFillColor(DARK)
        canv.rect(0, 0, W, FOOTER_H, fill=1, stroke=0)

        canv.setFillColor(WHITE)
        canv.setFont(_FONT, 7)
        footer_y = FOOTER_H / 2 - 3
        third = W / 3
        if email:
            canv.drawCentredString(third * 0.5, footer_y, email)
        if phone:
            canv.drawCentredString(third * 1.5, footer_y, phone)
        if website:
            canv.drawCentredString(third * 2.5, footer_y, website)

        canv.restoreState()

    return on_page


# ── Main generator ─────────────────────────────────────────────────────────────
def generate_invoice_pdf(invoice: "Invoice", logo_path: str | None = None) -> bytes:
    buf = io.BytesIO()

    sidebar_frame = Frame(
        INNER_PAD, BODY_BOT,
        SIDEBAR_W - 2 * INNER_PAD, BODY_H,
        leftPadding=3, rightPadding=3, topPadding=4, bottomPadding=4,
        id="sidebar",
    )
    content_frame = Frame(
        CONTENT_X, BODY_BOT,
        CONTENT_W, BODY_H,
        leftPadding=0, rightPadding=0, topPadding=4, bottomPadding=4,
        id="content",
    )
    page_tmpl = PageTemplate(
        id="main",
        frames=[sidebar_frame, content_frame],
        onPage=_make_on_page(invoice, logo_path),
    )
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        pageTemplates=[page_tmpl],
        leftMargin=0, rightMargin=0, topMargin=0, bottomMargin=0,
    )

    # ── Shared styles ──────────────────────────────────────────────────────
    base_s = _s("base")
    sm_s   = _s("sm",   fontSize=7, leading=10, textColor=MUTED)
    bold_s = _s("bd",   fontName=_FONT_BD)
    hd_s   = _s("hd",   fontName=_FONT_BD, fontSize=7, leading=10, textColor=DARK)
    acc_bd = _s("acb",  fontName=_FONT_BD, fontSize=7.5, leading=10, textColor=ACCENT)

    story = []

    # ═══════════════════════════════════════════════════════════════════════
    # SIDEBAR
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 3 * mm))

    story.append(_p("BILL TO:", hd_s))
    story.append(Spacer(1, 1 * mm))
    story.append(_p(
        invoice.customer_name_snapshot,
        _s("cname", fontName=_FONT_BD, fontSize=9, leading=12, textColor=DARK),
    ))
    story.append(_p(invoice.customer_code_snapshot, sm_s))
    if invoice.installation_address_snapshot:
        story.append(Spacer(1, 1 * mm))
        story.append(_p(
            invoice.installation_address_snapshot.replace("\n", "<br/>"), sm_s,
        ))

    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MUTED, spaceAfter=4 * mm))

    for lbl, val in [
        ("INVOICE #",     invoice.invoice_number),
        ("DATE OF ISSUE", _date(invoice.invoice_date)),
        ("DUE DATE",      _date(invoice.due_date)),
    ]:
        story.append(_p(lbl, hd_s))
        story.append(_p(val, bold_s))
        story.append(Spacer(1, 3 * mm))

    story.append(_p("STATUS", hd_s))
    sc_map = {
        "PAID": "#15803D", "PARTIALLY_PAID": "#B45309", "UNPAID": "#B42318",
        "OVERDUE": "#9F1239", "DRAFT": "#374151", "CANCELLED": "#6B7280",
    }
    sc = sc_map.get(invoice.status, "#374151")
    story.append(_p(
        f'<font color="{sc}"><b>{invoice.status.replace("_", " ")}</b></font>',
        base_s,
    ))

    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MUTED, spaceAfter=4 * mm))

    story.append(_p("CONNECTION:", hd_s))
    story.append(Spacer(1, 1 * mm))
    story.append(_p(invoice.connection_name_snapshot, bold_s))
    story.append(_p(invoice.plan_name_snapshot, sm_s))
    story.append(_p(f"{invoice.speed_mbps_snapshot} Mbps", sm_s))
    story.append(Spacer(1, 1 * mm))
    story.append(_p("BILLING PERIOD:", hd_s))
    story.append(_p(
        f"{_date(invoice.billing_period_start)}<br/>to {_date(invoice.billing_period_end)}",
        sm_s,
    ))

    story.append(FrameBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # CONTENT FRAME
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 3 * mm))

    discount_amount = getattr(invoice, "discount_amount", None) or Decimal("0")
    line_items      = getattr(invoice, "line_items", None) or []

    # Table header style
    th   = _s("th",  fontName=_FONT_BD, fontSize=7.5, leading=10, textColor=WHITE)
    tc   = _s("tc",  fontSize=8, leading=11)
    tc_sm = _s("tcsm", fontSize=7, leading=10, textColor=MUTED)
    tc_r  = _s("tcr",  fontSize=8, leading=11, alignment=2)

    c1 = CONTENT_W * 0.38
    c2 = CONTENT_W * 0.38
    c3 = CONTENT_W * 0.24

    header_row = [_p("ITEM / SERVICE", th), _p("DESCRIPTION", th), _p("AMOUNT", th)]

    fup_txt = f" \u00b7 FUP {invoice.fup_limit_gb_snapshot} GB" if invoice.fup_limit_gb_snapshot else ""
    data_policy = invoice.data_policy_snapshot or ""
    plan_row = [
        _p(invoice.plan_name_snapshot, _s("pn", fontName=_FONT_BD, fontSize=8.5, leading=12)),
        _p(
            f"{invoice.billing_cycle_snapshot.replace('_', ' ').title()} plan\n"
            f"{invoice.speed_mbps_snapshot} Mbps \u00b7 {data_policy}{fup_txt}",
            tc_sm,
        ),
        _p(_cur(invoice.base_amount), tc_r),
    ]
    rows = [header_row, plan_row]

    disc_desc = ""
    if discount_amount > 0:
        disc_type  = getattr(invoice, "discount_type",  None) or ""
        disc_value = getattr(invoice, "discount_value", None)
        disc_label = getattr(invoice, "discount_label", None) or ""
        if disc_type == "percentage" and disc_value:
            disc_desc = f"Discount ({float(disc_value):.2g}%)"
        else:
            disc_desc = "Discount"
        if disc_label:
            disc_desc += f" \u2014 {disc_label}"
        rows.append([
            _p(disc_desc, acc_bd),
            _p("", tc_sm),
            _p(f"\u2212{_cur(discount_amount)}", _s("dar", fontSize=7.5, textColor=ACCENT, alignment=2)),
        ])

    rows.append([
        _p(f"GST @ {float(invoice.gst_percentage):.0f}%", _s("gt", fontName=_FONT_BD, fontSize=8)),
        _p("Tax on broadband services", tc_sm),
        _p(_cur(invoice.gst_amount), tc_r),
    ])

    for item in line_items:
        rows.append([
            _p(item.get("description", ""), _s("li", fontName=_FONT_BD, fontSize=8)),
            _p("", tc_sm),
            _p(_cur(Decimal(str(item.get("amount", "0")))), tc_r),
        ])

    n = len(rows)
    item_table = Table(rows, colWidths=[c1, c2, c3])
    item_table.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),     DARK),
        ("TEXTCOLOR",      (0, 0), (-1, 0),     WHITE),
        ("ALIGN",          (2, 0), (2, -1),     "RIGHT"),
        ("VALIGN",         (0, 0), (-1, -1),    "MIDDLE"),
        ("BOTTOMPADDING",  (0, 0), (-1, -1),    5),
        ("TOPPADDING",     (0, 0), (-1, -1),    5),
        ("LEFTPADDING",    (0, 0), (-1, -1),    6),
        ("RIGHTPADDING",   (0, 0), (-1, -1),    6),
        ("LINEBELOW",      (0, 1), (-1, n - 1), 0.3, GREY),
        ("ROWBACKGROUNDS", (0, 1), (-1, n - 1), [WHITE, LIGHT]),
    ]))
    story.append(item_table)
    story.append(Spacer(1, 5 * mm))

    # ── Totals block ──────────────────────────────────────────────────────
    tl  = _s("tl",  fontSize=8, leading=11)
    tv  = _s("tv",  fontSize=8, leading=11, alignment=2)
    tw_l = _s("twl", fontName=_FONT_BD, fontSize=9.5, leading=12, textColor=WHITE)
    tw_v = _s("twv", fontName=_FONT_BD, fontSize=9.5, leading=12, textColor=WHITE, alignment=2)

    t_rows: list = []
    t_rows.append([_p("Subtotal", tl), _p(_cur(invoice.base_amount), tv)])
    if discount_amount > 0:
        t_rows.append([
            _p("Discount", tl),
            _p(f"\u2212{_cur(discount_amount)}", _s("dv", fontSize=8, textColor=ACCENT, alignment=2)),
        ])
    t_rows.append([_p("Tax Rate", tl), _p(f"{float(invoice.gst_percentage):.0f}%", tv)])
    t_rows.append([_p("GST",      tl), _p(_cur(invoice.gst_amount), tv)])
    for item in line_items:
        t_rows.append([
            _p(item.get("description", "Charge"), tl),
            _p(_cur(Decimal(str(item.get("amount", "0")))), tv),
        ])
    paid = getattr(invoice, "paid_amount", None) or Decimal("0")
    if float(paid) > 0:
        t_rows.append([
            _p("Paid", tl),
            _p(_cur(paid), _s("pv", fontSize=8, textColor=colors.HexColor("#15803D"), alignment=2)),
        ])

    sep_idx = len(t_rows)
    t_rows.append([_p("TOTAL", tw_l), _p(_cur(invoice.total_amount), tw_v)])

    bal = getattr(invoice, "balance_amount", None) or Decimal("0")
    if float(bal) > 0 and float(paid) > 0:
        t_rows.append([
            _p("Balance Due", _s("bl", fontName=_FONT_BD, fontSize=8, textColor=ACCENT)),
            _p(_cur(bal), _s("bv", fontName=_FONT_BD, fontSize=8, textColor=ACCENT, alignment=2)),
        ])

    tot_w = CONTENT_W * 0.58
    tot_c1, tot_c2 = tot_w * 0.56, tot_w * 0.44
    totals_table = Table(t_rows, colWidths=[tot_c1, tot_c2])
    totals_table.setStyle(TableStyle([
        ("ALIGN",         (1, 0), (1, -1),       "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1),       "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1),       3),
        ("TOPPADDING",    (0, 0), (-1, -1),       3),
        ("LEFTPADDING",   (0, 0), (-1, -1),       7),
        ("RIGHTPADDING",  (0, 0), (-1, -1),       7),
        ("LINEABOVE",     (0, sep_idx), (-1, sep_idx), 0.5, GREY),
        ("BACKGROUND",    (0, sep_idx), (-1, sep_idx), DARK),
        ("LINEBELOW",     (0, -1), (-1, -1),      0.3, GREY),
    ]))

    terms_paras: list = []
    if invoice.terms_snapshot:
        terms_paras += [
            _p("TERMS", _s("termsh", fontName=_FONT_BD, fontSize=8, textColor=DARK)),
            Spacer(1, 2 * mm),
            _p(
                invoice.terms_snapshot.replace("\n", "<br/>"),
                _s("termsb", fontSize=7.5, textColor=MUTED, leading=11),
            ),
        ]

    terms_w = CONTENT_W - tot_w - 3 * mm
    bottom = Table(
        [[terms_paras or [_p("", base_s)], totals_table]],
        colWidths=[terms_w, tot_w],
    )
    bottom.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
    ]))
    story.append(bottom)

    # ── Conditions / footer note ───────────────────────────────────────────
    if invoice.invoice_footer_snapshot:
        story.append(Spacer(1, 6 * mm))
        story.append(HRFlowable(width="100%", thickness=0.4, color=GREY, spaceAfter=3 * mm))
        story.append(_p(
            "CONDITIONS / INSTRUCTIONS",
            _s("cih", fontName=_FONT_BD, fontSize=8, textColor=DARK),
        ))
        story.append(Spacer(1, 2 * mm))
        story.append(_p(
            invoice.invoice_footer_snapshot.replace("\n", "<br/>"),
            _s("cib", fontSize=7.5, textColor=MUTED, leading=11),
        ))

    doc.build(story)
    return buf.getvalue()
