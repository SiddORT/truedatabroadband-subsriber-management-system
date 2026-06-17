"""PDF invoice generation — A4 portrait, professional full-width layout."""

from __future__ import annotations

import io
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

if TYPE_CHECKING:
    from app.models.invoice import Invoice, InvoiceSubscriptionItem

# ── Fonts ─────────────────────────────────────────────────────────────────────
import os as _os

_FONT_DIR = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "assets", "fonts")
_NOTO_REG  = _os.path.join(_FONT_DIR, "NotoSans-Regular.ttf")
_NOTO_BOLD = _os.path.join(_FONT_DIR, "NotoSans-Bold.ttf")
_NOTO_ITAL = _os.path.join(_FONT_DIR, "NotoSans-Italic.ttf")

try:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    # Noto Sans: full Unicode coverage including ₹ (U+20B9)
    pdfmetrics.registerFont(TTFont("NS",      _NOTO_REG))
    pdfmetrics.registerFont(TTFont("NS-Bold", _NOTO_BOLD))
    pdfmetrics.registerFont(TTFont("NS-Ital", _NOTO_ITAL))
    pdfmetrics.registerFontFamily("NS", normal="NS", bold="NS-Bold", italic="NS-Ital")
    _F, _FB, _FI = "NS", "NS-Bold", "NS-Ital"
except Exception:
    _F, _FB, _FI = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"

# ── Colors ────────────────────────────────────────────────────────────────────
C_PRIMARY  = colors.HexColor("#1F4959")
C_DARK     = colors.HexColor("#011425")
C_SECOND   = colors.HexColor("#5C7C89")
C_BORDER   = colors.HexColor("#D9E1E5")
C_TEXT     = colors.HexColor("#242424")
C_LIGHT    = colors.HexColor("#F5F7F8")
C_PLAN_BG  = colors.HexColor("#EDF3F6")
C_ACCENT   = colors.HexColor("#D72B20")
C_GREEN    = colors.HexColor("#15803D")
C_ORANGE   = colors.HexColor("#B45309")
C_BLUE     = colors.HexColor("#1D4ED8")
C_RED      = colors.HexColor("#B42318")
C_GREY     = colors.HexColor("#6B7280")
C_WHITE    = colors.white

# ── Layout ────────────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4                        # 595.27 × 841.89 pts
MARGIN   = 20 * mm                         # 56.69 pts each side
CW       = PAGE_W - 2 * MARGIN            # content width ≈ 481.89 pts
FOOTER_H = 16 * mm


# ─────────────────────────────────────────────────────────────────────────────
# Small helpers
# ─────────────────────────────────────────────────────────────────────────────
def _fmt_indian(val: float) -> str:
    """Indian number formatting: last 3 digits then pairs."""
    int_part  = int(val)
    dec_cents = round((val - int_part) * 100)
    s = str(int_part)
    if len(s) <= 3:
        return f"{s}.{dec_cents:02d}"
    result, s = s[-3:], s[:-3]
    while s:
        result, s = s[-2:] + "," + result, s[:-2]
    return f"{result}.{dec_cents:02d}"


def _cur(v) -> str:
    if v is None:
        return "\u20b90.00"
    return "\u20b9" + _fmt_indian(float(v))


def _date(d) -> str:
    if d is None:
        return "\u2014"
    return d.strftime("%d %b %Y")


def _p(text: object, style: ParagraphStyle) -> Paragraph:
    return Paragraph(str(text or ""), style)


def _s(name: str = "_", **kw) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName  = kw.pop("fontName",  _F),
        fontSize  = kw.pop("fontSize",  8),
        leading   = kw.pop("leading",   11),
        textColor = kw.pop("textColor", C_TEXT),
        **kw,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Amount in Words (Indian system)
# ─────────────────────────────────────────────────────────────────────────────
def _amount_in_words(amount) -> str:
    ONES = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen",
    ]
    TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def _two(n: int) -> str:
        if n < 20:
            return ONES[n]
        t = TENS[n // 10]
        o = ONES[n % 10]
        return (t + " " + o).strip() if o else t

    def _three(n: int) -> str:
        if n == 0:
            return ""
        if n < 100:
            return _two(n)
        h = ONES[n // 100] + " Hundred"
        r = _two(n % 100)
        return (h + " " + r).strip() if r else h

    total_p   = int(round(float(amount) * 100))
    rupees    = total_p // 100
    paise     = total_p  % 100

    if rupees == 0:
        words = "Zero"
    else:
        parts: list[str] = []
        crores    = rupees // 10_000_000;  rupees %= 10_000_000
        lakhs     = rupees //    100_000;  rupees %=    100_000
        thousands = rupees //      1_000;  rupees %=      1_000
        if crores:    parts.append(_two(crores)    + " Crore")
        if lakhs:     parts.append(_two(lakhs)     + " Lakh")
        if thousands: parts.append(_two(thousands) + " Thousand")
        if rupees:    parts.append(_three(rupees))
        words = " ".join(parts)

    result = "Rupees " + words
    if paise:
        result += " and " + _two(paise) + " Paise"
    return result + " Only"


# ─────────────────────────────────────────────────────────────────────────────
# Status badge
# ─────────────────────────────────────────────────────────────────────────────
_STATUS_COLOR = {
    "PAID":           C_GREEN,
    "UNPAID":         C_ORANGE,
    "PARTIALLY_PAID": C_BLUE,
    "OVERDUE":        C_RED,
    "DRAFT":          C_GREY,
    "CANCELLED":      C_GREY,
}


def _status_badge(status: str) -> Table:
    label = status.replace("_", " ")
    col   = _STATUS_COLOR.get(status, C_GREY)
    t = Table(
        [[_p(label, _s("sb", fontName=_FB, fontSize=8, textColor=C_WHITE, alignment=TA_CENTER))]],
        colWidths=[28 * mm],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), col),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS",(0, 0), (-1, -1), [col]),
    ]))
    return t


# ─────────────────────────────────────────────────────────────────────────────
# Footer callback
# ─────────────────────────────────────────────────────────────────────────────
def _make_footer(invoice: "Invoice", gen_time: datetime):
    footer_text = invoice.invoice_footer_snapshot or ""
    pow_txt     = "Powered by ORT"

    def on_page(canv, doc):
        canv.saveState()
        # Dark bar
        canv.setFillColor(C_DARK)
        canv.rect(0, 0, PAGE_W, FOOTER_H, fill=1, stroke=0)

        y_top = FOOTER_H - 5 * mm
        y_bot = 3 * mm

        canv.setFillColor(C_WHITE)
        canv.setFont(_FB, 7)
        if footer_text:
            canv.drawCentredString(PAGE_W / 2, y_top, footer_text)
        canv.setFont(_F, 6.5)
        canv.drawString(MARGIN, y_bot, f"Generated on: {gen_time.strftime('%d %b %Y %H:%M')} UTC")
        canv.drawCentredString(PAGE_W / 2, y_bot, pow_txt)
        canv.drawRightString(PAGE_W - MARGIN, y_bot, f"Page {doc.page}")
        canv.restoreState()

    return on_page


# ─────────────────────────────────────────────────────────────────────────────
# Section builders
# ─────────────────────────────────────────────────────────────────────────────

def _sec_header(invoice: "Invoice", logo_path: str | None) -> list:
    """Full-width 2-column header: company info left, invoice details right."""
    # ── Left: branding + company ──────────────────────────────────────────
    left_parts: list[object] = []

    if logo_path:
        try:
            from reportlab.platypus import Image as RLImage
            from reportlab.lib.utils import ImageReader
            ir = ImageReader(logo_path)
            iw, ih = ir.getSize()
            logo_h = 16 * mm
            logo_w = min(logo_h * (iw / ih), 55 * mm)
            left_parts.append(RLImage(logo_path, width=logo_w, height=logo_h))
            left_parts.append(Spacer(1, 2 * mm))
        except Exception:
            pass

    company = invoice.company_name_snapshot or "True Data Broadband Services Pvt. Ltd."
    left_parts.append(_p(
        company,
        _s("co", fontName=_FB, fontSize=10, leading=13, textColor=C_DARK),
    ))
    if invoice.company_address_snapshot:
        left_parts.append(_p(
            invoice.company_address_snapshot.replace("\n", "<br/>"),
            _s("ca", fontSize=7, leading=10, textColor=C_GREY),
        ))
        left_parts.append(Spacer(1, 1 * mm))

    details: list[str] = []
    if invoice.gst_number_snapshot:
        details.append(f"GSTIN: {invoice.gst_number_snapshot}")
    if invoice.pan_number_snapshot:
        details.append(f"PAN: {invoice.pan_number_snapshot}")
    if details:
        left_parts.append(_p("  |  ".join(details), _s("cd", fontSize=7, leading=10, textColor=C_SECOND)))
    contact: list[str] = []
    if invoice.support_email_snapshot:
        contact.append(invoice.support_email_snapshot)
    if invoice.support_phone_snapshot:
        contact.append(invoice.support_phone_snapshot)
    if contact:
        left_parts.append(_p("  |  ".join(contact), _s("cc", fontSize=7, leading=10, textColor=C_SECOND)))

    # ── Right: INVOICE title + meta ───────────────────────────────────────
    invoice_type = getattr(invoice, "invoice_type", "SINGLE")
    inv_title = "CONSOLIDATED INVOICE" if invoice_type == "CONSOLIDATED" else "INVOICE"
    right_parts: list[object] = [
        _p(inv_title, _s("ititle", fontName=_FB, fontSize=22 if invoice_type == "CONSOLIDATED" else 26,
                         leading=28, textColor=C_PRIMARY, alignment=TA_RIGHT)),
        Spacer(1, 3 * mm),
    ]
    for lbl, val in [
        ("Invoice No.", invoice.invoice_number),
        ("Date",        _date(invoice.invoice_date)),
        ("Due Date",    _date(invoice.due_date)),
    ]:
        right_parts.append(Table(
            [[
                _p(lbl, _s(f"rl{lbl}", fontSize=7, textColor=C_GREY, alignment=TA_RIGHT)),
                _p(str(val), _s(f"rv{lbl}", fontName=_FB, fontSize=7.5, textColor=C_DARK, alignment=TA_RIGHT)),
            ]],
            colWidths=[CW * 0.18, CW * 0.22],
            style=TableStyle([
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ("TOPPADDING",    (0, 0), (-1, -1), 1),
                ("LEFTPADDING",   (0, 0), (-1, -1), 0),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ]),
        ))
    right_parts.append(Spacer(1, 2 * mm))
    right_parts.append(Table(
        [[None, _status_badge(invoice.status)]],
        colWidths=[CW * 0.28, CW * 0.12],
        style=TableStyle([("ALIGN", (1, 0), (1, 0), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                          ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                          ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]),
    ))

    tbl = Table(
        [[left_parts, right_parts]],
        colWidths=[CW * 0.55, CW * 0.45],
    )
    tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("ALIGN",         (1, 0), (1, 0),   "RIGHT"),
    ]))
    return [KeepTogether([tbl])]


def _sec_customer(invoice: "Invoice") -> list:
    """Two bordered cards: Bill To | Connection Details."""
    pad = 8
    invoice_type = getattr(invoice, "invoice_type", "SINGLE")

    def _card(title: str, rows: list[tuple[str, str | None]]) -> list:
        items: list[object] = [
            _p(title, _s(f"ct{title}", fontName=_FB, fontSize=7, textColor=C_PRIMARY,
                         leading=10, spaceAfter=3)),
        ]
        for lbl, val in rows:
            if val:
                items.append(_p(
                    f'<font name="{_FB}">{lbl}: </font>{val}' if lbl else val,
                    _s(f"cr{lbl}", fontSize=7.5, leading=11),
                ))
        return items

    bill_to = _card("BILL TO", [
        ("",     invoice.customer_name_snapshot),
        ("Code", invoice.customer_code_snapshot),
        ("Email", getattr(invoice, "customer_email_snapshot", None)),
        ("Mobile", getattr(invoice, "customer_mobile_snapshot", None)),
    ])

    if invoice_type == "CONSOLIDATED":
        sub_count = len(getattr(invoice, "subscription_items", []) or [])
        billing_period = f"{_date(invoice.billing_period_start)} \u2013 {_date(invoice.billing_period_end)}"
        right_card = _card("CONSOLIDATED INVOICE DETAILS", [
            ("Subscriptions",   str(sub_count)),
            ("Billing Period",  billing_period),
        ])
    else:
        right_card = _card("CONNECTION DETAILS", [
            ("",          invoice.connection_name_snapshot),
            ("Sub. Code", invoice.connection_name_snapshot),
            ("Address",   invoice.installation_address_snapshot),
        ])

    col_w = (CW - 4 * mm) / 2
    tbl = Table([[bill_to, right_card]], colWidths=[col_w, col_w])
    tbl.setStyle(TableStyle([
        ("BOX",           (0, 0), (0, 0), 0.6, C_BORDER),
        ("BOX",           (1, 0), (1, 0), 0.6, C_BORDER),
        ("BACKGROUND",    (0, 0), (0, 0), C_WHITE),
        ("BACKGROUND",    (1, 0), (1, 0), C_WHITE),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), pad),
        ("RIGHTPADDING",  (0, 0), (-1, -1), pad),
        ("TOPPADDING",    (0, 0), (-1, -1), pad),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
    ]))
    return [tbl]


def _sec_plan(invoice: "Invoice") -> list:
    """Highlighted plan info box."""
    cycle   = (invoice.billing_cycle_snapshot or "").replace("_", " ").title()
    dp      = invoice.data_policy_snapshot or ""
    fup_txt = f" · FUP {invoice.fup_limit_gb_snapshot} GB" if invoice.fup_limit_gb_snapshot else ""
    period  = f"{_date(invoice.billing_period_start)} \u2013 {_date(invoice.billing_period_end)}"

    grid = [
        [
            _p("Plan",          _s("phl", fontName=_FB, fontSize=7, textColor=C_SECOND)),
            _p("Speed",         _s("phs", fontName=_FB, fontSize=7, textColor=C_SECOND)),
            _p("Data Policy",   _s("phd", fontName=_FB, fontSize=7, textColor=C_SECOND)),
            _p("Billing Cycle", _s("phc", fontName=_FB, fontSize=7, textColor=C_SECOND)),
        ],
        [
            _p(invoice.plan_name_snapshot,  _s("pvl", fontName=_FB, fontSize=8.5, textColor=C_DARK)),
            _p(f"{invoice.speed_mbps_snapshot} Mbps", _s("pvs", fontSize=8, textColor=C_DARK)),
            _p(f"{dp}{fup_txt}",            _s("pvd", fontSize=8, textColor=C_DARK)),
            _p(cycle,                       _s("pvc", fontSize=8, textColor=C_DARK)),
        ],
        [
            _p(f"Billing Period: {period}",
               _s("pbp", fontSize=7.5, textColor=C_SECOND, alignment=TA_LEFT)),
            None, None, None,
        ],
    ]
    cws = [CW * 0.36, CW * 0.18, CW * 0.22, CW * 0.24]
    tbl = Table(grid, colWidths=cws)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_PLAN_BG),
        ("BOX",           (0, 0), (-1, -1), 0.6, C_BORDER),
        ("LINEBELOW",     (0, 0), (-1, 0),  0.3, C_BORDER),
        ("SPAN",          (0, 2), (-1, 2)),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 7),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [tbl]


def _sec_charges(invoice: "Invoice") -> list:
    """5-column charges table + right-aligned totals block."""
    discount_amount = getattr(invoice, "discount_amount", None) or Decimal("0")
    discount_scope  = getattr(invoice, "discount_scope",  None) or "base"
    line_items      = getattr(invoice, "line_items",      None) or []

    # Column widths
    cw = [CW * 0.35, CW * 0.24, CW * 0.07, CW * 0.17, CW * 0.17]

    th = _s("th", fontName=_FB, fontSize=7.5, textColor=C_WHITE)
    th_r = _s("thr", fontName=_FB, fontSize=7.5, textColor=C_WHITE, alignment=TA_RIGHT)
    tc   = _s("tc",  fontSize=8,   leading=11)
    tc_r = _s("tcr", fontSize=8,   leading=11, alignment=TA_RIGHT)
    tc_m = _s("tcm", fontSize=7.5, leading=10, textColor=C_GREY)
    tc_disc = _s("tcd", fontSize=7.5, leading=10, textColor=C_ACCENT)

    period_txt = f"{_date(invoice.billing_period_start)} \u2013 {_date(invoice.billing_period_end)}"
    fup        = f" · FUP {invoice.fup_limit_gb_snapshot} GB" if invoice.fup_limit_gb_snapshot else ""

    header_row = [
        _p("DESCRIPTION",  th),
        _p("BILLING PERIOD", th),
        _p("QTY", th),
        _p("UNIT PRICE", th_r),
        _p("AMOUNT",     th_r),
    ]
    rows = [header_row]

    # Plan row
    plan_desc = f'{invoice.plan_name_snapshot}\n<font size="7" color="#6B7280">{invoice.speed_mbps_snapshot} Mbps · {invoice.data_policy_snapshot or ""}{fup}</font>'
    rows.append([
        _p(plan_desc, _s("pd", fontName=_FB, fontSize=8.5, leading=12)),
        _p(period_txt, tc_m),
        _p("1", tc),
        _p(_cur(invoice.base_amount), tc_r),
        _p(_cur(invoice.base_amount), tc_r),
    ])

    # Base-scope discount
    if discount_amount > 0 and discount_scope != "overall":
        disc_type  = getattr(invoice, "discount_type",  None) or ""
        disc_value = getattr(invoice, "discount_value", None)
        disc_label = getattr(invoice, "discount_label", None) or ""
        if disc_type == "percentage" and disc_value:
            dlbl = f"Discount ({float(disc_value):.2g}%) \u2014 Base Plan"
        else:
            dlbl = "Discount \u2014 Base Plan"
        if disc_label:
            dlbl += f" · {disc_label}"
        rows.append([
            _p(dlbl, tc_disc), _p("", tc_m), _p("", tc), _p("", tc_r),
            _p(f"\u2212{_cur(discount_amount)}", _s("dd", fontSize=8, textColor=C_ACCENT, alignment=TA_RIGHT)),
        ])

    # GST row
    rows.append([
        _p(f"GST @ {float(invoice.gst_percentage):.0f}%",
           _s("gt", fontName=_FB, fontSize=8)),
        _p("Tax on broadband services", tc_m),
        _p("1", tc), _p("", tc_r),
        _p(_cur(invoice.gst_amount), tc_r),
    ])

    # Line items (with optional per-item discount sub-rows)
    for item in line_items:
        net_amt    = Decimal(str(item.get("amount", "0")))
        orig_amt   = item.get("original_amount")
        item_disc  = item.get("discount_amount")
        item_dtype = item.get("discount_type", "")
        item_dval  = item.get("discount_value", "")
        has_disc   = orig_amt and item_disc and Decimal(str(item_disc)) > 0

        if has_disc:
            rows.append([
                _p(item.get("description", ""), _s("lid", fontName=_FB, fontSize=8)),
                _p("", tc_m), _p("1", tc),
                _p(_cur(Decimal(str(orig_amt))), _s("lo", fontSize=7.5, textColor=C_GREY, alignment=TA_RIGHT)),
                _p(_cur(Decimal(str(orig_amt))), _s("la", fontSize=7.5, textColor=C_GREY, alignment=TA_RIGHT)),
            ])
            disc_lbl = (
                f"  Item discount ({item_dval}%)"
                if item_dtype == "percentage" else "  Item discount"
            )
            rows.append([
                _p(disc_lbl, tc_disc), _p("", tc_m), _p("", tc), _p("", tc_r),
                _p(f"\u2212{_cur(Decimal(str(item_disc)))}", _s("ld2", fontSize=7.5, textColor=C_ACCENT, alignment=TA_RIGHT)),
            ])
            rows.append([
                _p("  Net amount", _s("ln", fontName=_FB, fontSize=7.5)), _p("", tc_m), _p("", tc), _p("", tc_r),
                _p(_cur(net_amt), tc_r),
            ])
        else:
            rows.append([
                _p(item.get("description", ""), _s("li", fontName=_FB, fontSize=8)),
                _p("", tc_m), _p("1", tc), _p(_cur(net_amt), tc_r), _p(_cur(net_amt), tc_r),
            ])

    # Overall-scope discount
    if discount_amount > 0 and discount_scope == "overall":
        disc_type  = getattr(invoice, "discount_type",  None) or ""
        disc_value = getattr(invoice, "discount_value", None)
        disc_label = getattr(invoice, "discount_label", None) or ""
        if disc_type == "percentage" and disc_value:
            dlbl = f"Discount ({float(disc_value):.2g}%) \u2014 Overall Total"
        else:
            dlbl = "Discount \u2014 Overall Total"
        if disc_label:
            dlbl += f" · {disc_label}"
        rows.append([
            _p(dlbl, tc_disc), _p("", tc_m), _p("", tc), _p("", tc_r),
            _p(f"\u2212{_cur(discount_amount)}", _s("od", fontSize=8, textColor=C_ACCENT, alignment=TA_RIGHT)),
        ])

    n = len(rows)
    charges_tbl = Table(rows, colWidths=cw, repeatRows=1)
    charges_tbl.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),     C_PRIMARY),
        ("VALIGN",         (0, 0), (-1, -1),    "MIDDLE"),
        ("ALIGN",          (3, 0), (4, -1),     "RIGHT"),
        ("TOPPADDING",     (0, 0), (-1, -1),    5),
        ("BOTTOMPADDING",  (0, 0), (-1, -1),    5),
        ("LEFTPADDING",    (0, 0), (-1, -1),    6),
        ("RIGHTPADDING",   (0, 0), (-1, -1),    6),
        ("LINEBELOW",      (0, 1), (-1, n - 1), 0.3, C_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, n - 1), [C_WHITE, C_LIGHT]),
    ]))

    # ── Totals block (right-aligned) ────────────────────────────────────────
    tl  = _s("tl",  fontSize=8,   leading=11, textColor=C_GREY)
    tv  = _s("tv",  fontSize=8,   leading=11, alignment=TA_RIGHT)
    tw_l = _s("twl", fontName=_FB, fontSize=10, leading=13, textColor=C_WHITE)
    tw_v = _s("twv", fontName=_FB, fontSize=10, leading=13, textColor=C_WHITE, alignment=TA_RIGHT)
    tb_l = _s("tbl", fontName=_FB, fontSize=8.5, textColor=C_ACCENT)
    tb_v = _s("tbv", fontName=_FB, fontSize=8.5, textColor=C_ACCENT, alignment=TA_RIGHT)

    paid = getattr(invoice, "paid_amount", None) or Decimal("0")
    bal  = getattr(invoice, "balance_amount", None) or Decimal("0")
    lit  = getattr(invoice, "line_items_total", None) or Decimal("0")

    t_rows: list = [
        [_p("Subtotal",                   tl), _p(_cur(invoice.base_amount), tv)],
    ]
    if discount_amount > 0:
        t_rows.append([
            _p("Discount",  tl),
            _p(f"\u2212{_cur(discount_amount)}",
               _s("dv2", fontSize=8, textColor=C_ACCENT, alignment=TA_RIGHT)),
        ])
    t_rows.append([_p(f"GST ({float(invoice.gst_percentage):.0f}%)", tl), _p(_cur(invoice.gst_amount), tv)])
    if float(lit) > 0:
        t_rows.append([_p("Other Charges", tl), _p(_cur(lit), tv)])
    if float(paid) > 0:
        t_rows.append([
            _p("Paid Amount", tl),
            _p(f"\u2212{_cur(paid)}", _s("pv2", fontSize=8, textColor=C_GREEN, alignment=TA_RIGHT)),
        ])

    sep_idx = len(t_rows)
    t_rows.append([_p("GRAND TOTAL", tw_l), _p(_cur(invoice.total_amount), tw_v)])

    if float(bal) > 0 and float(paid) > 0:
        t_rows.append([_p("Balance Due", tb_l), _p(_cur(bal), tb_v)])

    tot_w = CW * 0.48
    tc1, tc2 = tot_w * 0.55, tot_w * 0.45
    totals_tbl = Table(t_rows, colWidths=[tc1, tc2])
    totals_tbl.setStyle(TableStyle([
        ("ALIGN",         (1, 0), (1, -1),         "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1),         "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1),         3),
        ("TOPPADDING",    (0, 0), (-1, -1),         3),
        ("LEFTPADDING",   (0, 0), (-1, -1),         7),
        ("RIGHTPADDING",  (0, 0), (-1, -1),         7),
        ("LINEABOVE",     (0, sep_idx), (-1, sep_idx), 0.5, C_BORDER),
        ("BACKGROUND",    (0, sep_idx), (-1, sep_idx), C_DARK),
        ("LINEBELOW",     (0, -1),      (-1, -1),       0.3, C_BORDER),
    ]))

    layout = Table(
        [[None, totals_tbl]],
        colWidths=[CW * 0.52, CW * 0.48],
    )
    layout.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    return [charges_tbl, Spacer(1, 5 * mm), layout]


# ─────────────────────────────────────────────────────────────────────────────
# Consolidated: per-subscription section
# ─────────────────────────────────────────────────────────────────────────────

def _sec_sub_item(item: "InvoiceSubscriptionItem", idx: int, total: int) -> list:
    """Render one subscription's section for CONSOLIDATED invoices."""
    story: list = []

    cycle  = (item.billing_cycle_snapshot or "").replace("_", " ").title()
    period = f"{_date(item.billing_period_start)} \u2013 {_date(item.billing_period_end)}"
    fup    = f" · FUP {item.fup_limit_gb_snapshot} GB" if item.fup_limit_gb_snapshot else ""

    # ── Sub-section header ──────────────────────────────────────────────
    header_tbl = Table([[
        _p(f"Subscription {idx + 1} of {total}: {item.connection_name_snapshot}",
           _s("ssh", fontName=_FB, fontSize=8.5, textColor=C_WHITE)),
        _p(f"{item.plan_name_snapshot}  ·  {item.speed_mbps_snapshot} Mbps  ·  {item.data_policy_snapshot or ''}{fup}  ·  {cycle}",
           _s("ssd", fontSize=7.5, textColor=C_WHITE, alignment=TA_RIGHT)),
    ]], colWidths=[CW * 0.5, CW * 0.5])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_PRIMARY),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(header_tbl)

    # ── Mini charges table ───────────────────────────────────────────────
    cw = [CW * 0.52, CW * 0.08, CW * 0.20, CW * 0.20]
    th   = _s(f"th{idx}", fontName=_FB, fontSize=7, textColor=C_WHITE)
    th_r = _s(f"thr{idx}", fontName=_FB, fontSize=7, textColor=C_WHITE, alignment=TA_RIGHT)
    tc   = _s(f"tc{idx}",  fontSize=7.5, leading=10)
    tc_r = _s(f"tcr{idx}", fontSize=7.5, leading=10, alignment=TA_RIGHT)
    tc_m = _s(f"tcm{idx}", fontSize=7, leading=10, textColor=C_GREY)
    tc_d = _s(f"tcd{idx}", fontSize=7, leading=10, textColor=C_ACCENT)

    rows = [[
        _p("DESCRIPTION", th),
        _p("QTY", th),
        _p("UNIT PRICE", th_r),
        _p("AMOUNT", th_r),
    ]]

    disc_amt   = getattr(item, "discount_amount", Decimal("0")) or Decimal("0")
    disc_scope = getattr(item, "discount_scope", "base") or "base"
    disc_type  = getattr(item, "discount_type", None)
    disc_value = getattr(item, "discount_value", None)
    disc_label = getattr(item, "discount_label", None) or ""
    line_items = getattr(item, "line_items", None) or []

    # Plan row
    rows.append([
        _p(f'{item.plan_name_snapshot}<br/><font size="6" color="#6B7280">Period: {period}</font>',
           _s(f"pd{idx}", fontName=_FB, fontSize=8, leading=11)),
        _p("1", tc),
        _p(_cur(item.base_amount), tc_r),
        _p(_cur(item.base_amount), tc_r),
    ])

    # Base-scope discount
    if disc_amt > 0 and disc_scope != "overall":
        if disc_type == "percentage" and disc_value:
            dlbl = f"Discount ({float(disc_value):.2g}%)"
        else:
            dlbl = "Discount"
        if disc_label:
            dlbl += f" · {disc_label}"
        rows.append([
            _p(dlbl, tc_d), _p("", tc), _p("", tc_r),
            _p(f"\u2212{_cur(disc_amt)}", _s(f"dd{idx}", fontSize=7.5, textColor=C_ACCENT, alignment=TA_RIGHT)),
        ])

    # GST row
    rows.append([
        _p(f"GST @ {float(item.gst_percentage):.0f}%", _s(f"gt{idx}", fontName=_FB, fontSize=7.5)),
        _p("1", tc), _p("", tc_r),
        _p(_cur(item.gst_amount), tc_r),
    ])

    # Line items
    for li in line_items:
        net_amt    = Decimal(str(li.get("amount", "0")))
        orig_amt   = li.get("original_amount")
        li_disc    = li.get("discount_amount")
        li_dtype   = li.get("discount_type", "")
        li_dval    = li.get("discount_value", "")
        has_disc   = orig_amt and li_disc and Decimal(str(li_disc)) > 0

        if has_disc:
            rows.append([
                _p(li.get("description", ""), _s(f"lid{idx}", fontName=_FB, fontSize=7.5)),
                _p("1", tc),
                _p(_cur(Decimal(str(orig_amt))), _s(f"lo{idx}", fontSize=7, textColor=C_GREY, alignment=TA_RIGHT)),
                _p(_cur(Decimal(str(orig_amt))), _s(f"la{idx}", fontSize=7, textColor=C_GREY, alignment=TA_RIGHT)),
            ])
            dlbl2 = f"  Discount ({li_dval}%)" if li_dtype == "percentage" else "  Discount"
            rows.append([
                _p(dlbl2, tc_d), _p("", tc), _p("", tc_r),
                _p(f"\u2212{_cur(Decimal(str(li_disc)))}", _s(f"ld{idx}", fontSize=7, textColor=C_ACCENT, alignment=TA_RIGHT)),
            ])
            rows.append([
                _p("  Net", _s(f"ln{idx}", fontName=_FB, fontSize=7)), _p("", tc), _p("", tc_r),
                _p(_cur(net_amt), tc_r),
            ])
        else:
            rows.append([
                _p(li.get("description", ""), _s(f"li{idx}", fontName=_FB, fontSize=7.5)),
                _p("1", tc), _p(_cur(net_amt), tc_r), _p(_cur(net_amt), tc_r),
            ])

    # Overall-scope discount
    if disc_amt > 0 and disc_scope == "overall":
        if disc_type == "percentage" and disc_value:
            dlbl = f"Overall Discount ({float(disc_value):.2g}%)"
        else:
            dlbl = "Overall Discount"
        if disc_label:
            dlbl += f" · {disc_label}"
        rows.append([
            _p(dlbl, tc_d), _p("", tc), _p("", tc_r),
            _p(f"\u2212{_cur(disc_amt)}", _s(f"od{idx}", fontSize=7.5, textColor=C_ACCENT, alignment=TA_RIGHT)),
        ])

    # Sub-total row
    rows.append([
        _p(f"SUB-TOTAL — {item.connection_name_snapshot}",
           _s(f"st{idx}", fontName=_FB, fontSize=7.5, textColor=C_WHITE)),
        _p("", _s(f"stb{idx}", textColor=C_WHITE)),
        _p("", _s(f"stc{idx}", textColor=C_WHITE)),
        _p(_cur(item.total_amount), _s(f"stv{idx}", fontName=_FB, fontSize=8, textColor=C_WHITE, alignment=TA_RIGHT)),
    ])

    n = len(rows)
    mini_tbl = Table(rows, colWidths=cw)
    mini_tbl.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),         C_SECOND),
        ("BACKGROUND",     (0, n-1), (-1, n-1),     C_DARK),
        ("VALIGN",         (0, 0), (-1, -1),         "MIDDLE"),
        ("ALIGN",          (1, 0), (3, -1),          "RIGHT"),
        ("TOPPADDING",     (0, 0), (-1, -1),         4),
        ("BOTTOMPADDING",  (0, 0), (-1, -1),         4),
        ("LEFTPADDING",    (0, 0), (-1, -1),         6),
        ("RIGHTPADDING",   (0, 0), (-1, -1),         6),
        ("LINEBELOW",      (0, 1), (-1, n - 2),      0.3, C_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, n - 2),      [C_WHITE, C_LIGHT]),
    ]))
    story.append(mini_tbl)
    story.append(Spacer(1, 3 * mm))

    return [KeepTogether(story)]


def _sec_consolidated_totals(invoice: "Invoice") -> list:
    """Grand total row for consolidated invoices."""
    tw_l = _s("ctw_l", fontName=_FB, fontSize=10, leading=13, textColor=C_WHITE)
    tw_v = _s("ctw_v", fontName=_FB, fontSize=10, leading=13, textColor=C_WHITE, alignment=TA_RIGHT)
    tb_l = _s("ctb_l", fontName=_FB, fontSize=8.5, textColor=C_ACCENT)
    tb_v = _s("ctb_v", fontName=_FB, fontSize=8.5, textColor=C_ACCENT, alignment=TA_RIGHT)
    tl   = _s("ctl",   fontSize=8, leading=11, textColor=C_GREY)
    tv   = _s("ctv",   fontSize=8, leading=11, alignment=TA_RIGHT)

    paid = getattr(invoice, "paid_amount", None) or Decimal("0")
    bal  = getattr(invoice, "balance_amount", None) or Decimal("0")
    gst  = getattr(invoice, "gst_amount", Decimal("0")) or Decimal("0")
    lit  = getattr(invoice, "line_items_total", Decimal("0")) or Decimal("0")
    disc = getattr(invoice, "discount_amount", Decimal("0")) or Decimal("0")
    base = getattr(invoice, "base_amount", Decimal("0")) or Decimal("0")

    t_rows: list = [
        [_p("Total Plan Charges", tl), _p(_cur(base), tv)],
        [_p("Total GST",          tl), _p(_cur(gst),  tv)],
    ]
    if float(lit) > 0:
        t_rows.append([_p("Other Charges", tl), _p(_cur(lit), tv)])
    if float(disc) > 0:
        t_rows.append([
            _p("Total Discounts", tl),
            _p(f"\u2212{_cur(disc)}", _s("ctd", fontSize=8, textColor=C_ACCENT, alignment=TA_RIGHT)),
        ])
    if float(paid) > 0:
        t_rows.append([
            _p("Paid Amount", tl),
            _p(f"\u2212{_cur(paid)}", _s("ctp", fontSize=8, textColor=C_GREEN, alignment=TA_RIGHT)),
        ])

    sep_idx = len(t_rows)
    t_rows.append([_p("GRAND TOTAL", tw_l), _p(_cur(invoice.total_amount), tw_v)])

    if float(bal) > 0 and float(paid) > 0:
        t_rows.append([_p("Balance Due", tb_l), _p(_cur(bal), tb_v)])

    tot_w = CW * 0.48
    tc1, tc2 = tot_w * 0.55, tot_w * 0.45
    totals_tbl = Table(t_rows, colWidths=[tc1, tc2])
    totals_tbl.setStyle(TableStyle([
        ("ALIGN",         (1, 0), (1, -1),             "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1),             "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1),             3),
        ("TOPPADDING",    (0, 0), (-1, -1),             3),
        ("LEFTPADDING",   (0, 0), (-1, -1),             7),
        ("RIGHTPADDING",  (0, 0), (-1, -1),             7),
        ("LINEABOVE",     (0, sep_idx), (-1, sep_idx), 0.5, C_BORDER),
        ("BACKGROUND",    (0, sep_idx), (-1, sep_idx), C_DARK),
        ("LINEBELOW",     (0, -1),      (-1, -1),       0.3, C_BORDER),
    ]))

    layout = Table(
        [[None, totals_tbl]],
        colWidths=[CW * 0.52, CW * 0.48],
    )
    layout.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    return [layout]


def _sec_payment_summary(invoice: "Invoice") -> list:
    """3-card payment summary: Total | Paid | Outstanding."""
    paid = getattr(invoice, "paid_amount", None) or Decimal("0")
    bal  = getattr(invoice, "balance_amount", None) or Decimal("0")

    paid_in_full = float(bal) <= 0

    lbl_s  = _s("psl", fontSize=7, textColor=C_GREY, alignment=TA_CENTER)
    val_s  = _s("psv", fontName=_FB, fontSize=12, leading=15, textColor=C_DARK, alignment=TA_CENTER)
    out_s  = _s("pso", fontName=_FB, fontSize=12, leading=15, textColor=C_RED if not paid_in_full else C_GREEN, alignment=TA_CENTER)
    pif_s  = _s("pif", fontName=_FB, fontSize=9, textColor=C_GREEN, alignment=TA_CENTER)

    def _card_cells(label: str, value: str, highlight: bool = False, paid_full: bool = False) -> list:
        v_style = out_s if highlight else val_s
        items: list[object] = [
            _p(label, lbl_s),
            _p(value, v_style),
        ]
        if paid_full:
            items.append(_p("\u2714 PAID IN FULL", pif_s))
        return items

    card_w = (CW - 2 * 3 * mm) / 3
    tbl = Table([[
        _card_cells("Total Amount",       _cur(invoice.total_amount)),
        _card_cells("Paid Amount",        _cur(paid)),
        _card_cells("Outstanding Amount", _cur(bal), highlight=True, paid_full=paid_in_full),
    ]], colWidths=[card_w, card_w, card_w])

    tbl.setStyle(TableStyle([
        ("BOX",           (0, 0), (0, 0), 0.5, C_BORDER),
        ("BOX",           (1, 0), (1, 0), 0.5, C_BORDER),
        ("BOX",           (2, 0), (2, 0), 0.8, C_ACCENT if not paid_in_full else C_GREEN),
        ("BACKGROUND",    (2, 0), (2, 0), C_LIGHT),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return [tbl]


def _sec_amount_words(invoice: "Invoice") -> list:
    words = _amount_in_words(invoice.total_amount)
    tbl = Table(
        [[_p("AMOUNT IN WORDS", _s("awl", fontName=_FB, fontSize=7, textColor=C_SECOND)),
          _p(words, _s("awv", fontName=_FI, fontSize=8.5, textColor=C_DARK))]],
        colWidths=[CW * 0.22, CW * 0.78],
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_PLAN_BG),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return [tbl]


def _sec_payment_instructions(invoice: "Invoice") -> list:
    """Bank details left + QR placeholder right."""
    bank   = getattr(invoice, "bank_name_snapshot",      None)
    acname = getattr(invoice, "account_name_snapshot",   None)
    acnum  = getattr(invoice, "account_number_snapshot", None)
    ifsc   = getattr(invoice, "ifsc_code_snapshot",      None)
    upi    = getattr(invoice, "upi_id_snapshot",         None)

    hd_s = _s("pdh", fontName=_FB, fontSize=7, textColor=C_PRIMARY)
    lbl_s = _s("pdl", fontSize=7, textColor=C_GREY)
    val_s = _s("pdv", fontName=_FB, fontSize=7.5, textColor=C_DARK)

    bank_rows: list[object] = [_p("PAYMENT DETAILS", hd_s), Spacer(1, 3 * mm)]
    for lbl, val in [("Bank", bank), ("Account Name", acname), ("Account No.", acnum),
                     ("IFSC Code", ifsc), ("UPI ID", upi)]:
        if val:
            bank_rows.append(_p(lbl, lbl_s))
            bank_rows.append(_p(val, val_s))
            bank_rows.append(Spacer(1, 1 * mm))

    qr_rows: list[object] = [
        _p("QR CODE", _s("qrh", fontName=_FB, fontSize=7, textColor=C_PRIMARY)),
        Spacer(1, 3 * mm),
        _p("Online payment QR code\nwill appear here.",
           _s("qrb", fontSize=8, textColor=C_GREY, alignment=TA_CENTER, leading=12)),
    ]

    col_w = (CW - 4 * mm) / 2
    tbl = Table([[bank_rows, qr_rows]], colWidths=[col_w, col_w])
    tbl.setStyle(TableStyle([
        ("BOX",           (0, 0), (0, 0), 0.5, C_BORDER),
        ("BOX",           (1, 0), (1, 0), 0.5, C_BORDER),
        ("BACKGROUND",    (1, 0), (1, 0), C_LIGHT),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("ALIGN",         (1, 0), (1, 0),   "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return [tbl]


def _has_bank_details(invoice: "Invoice") -> bool:
    return any(
        getattr(invoice, f, None)
        for f in ("bank_name_snapshot", "account_number_snapshot", "ifsc_code_snapshot", "upi_id_snapshot")
    )


def _sec_terms(invoice: "Invoice") -> list:
    terms = invoice.terms_snapshot or ""
    lines = [ln.strip() for ln in terms.splitlines() if ln.strip()][:5]
    bullet_html = "".join(f"\u2022 {ln}<br/>" for ln in lines)
    return [
        _p("TERMS &amp; CONDITIONS",
           _s("termsh", fontName=_FB, fontSize=7.5, textColor=C_DARK, spaceAfter=3)),
        _p(bullet_html, _s("termsb", fontSize=7.5, textColor=C_GREY, leading=12)),
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
def generate_invoice_pdf(invoice: "Invoice", logo_path: str | None = None) -> bytes:
    buf      = io.BytesIO()
    gen_time = datetime.now(timezone.utc)
    footer   = _make_footer(invoice, gen_time)

    doc = SimpleDocTemplate(
        buf,
        pagesize     = A4,
        leftMargin   = MARGIN,
        rightMargin  = MARGIN,
        topMargin    = MARGIN,
        bottomMargin = FOOTER_H + 3 * mm,
        title        = f"Invoice {invoice.invoice_number}",
        author       = invoice.company_name_snapshot or "True Data",
    )

    invoice_type = getattr(invoice, "invoice_type", "SINGLE")
    is_consolidated = invoice_type == "CONSOLIDATED"
    subscription_items = getattr(invoice, "subscription_items", []) or []

    story: list = []

    # 1. Header
    story.extend(_sec_header(invoice, logo_path))
    story.append(HRFlowable(width="100%", thickness=0.6, color=C_PRIMARY, spaceAfter=4 * mm, spaceBefore=4 * mm))

    # 2. Customer cards
    story.extend(_sec_customer(invoice))
    story.append(Spacer(1, 4 * mm))

    if is_consolidated and subscription_items:
        # 3. Per-subscription billing sections
        for idx, item in enumerate(subscription_items):
            story.extend(_sec_sub_item(item, idx, len(subscription_items)))

        # 4. Grand total block
        story.append(HRFlowable(width="100%", thickness=0.4, color=C_BORDER, spaceAfter=3 * mm, spaceBefore=2 * mm))
        story.extend(_sec_consolidated_totals(invoice))
        story.append(Spacer(1, 5 * mm))
    else:
        # 3. Plan info box
        story.extend(_sec_plan(invoice))
        story.append(Spacer(1, 5 * mm))

        # 4. Charges table + totals
        story.extend(_sec_charges(invoice))
        story.append(Spacer(1, 5 * mm))

    # 5. Payment summary
    story.extend(_sec_payment_summary(invoice))
    story.append(Spacer(1, 4 * mm))

    # 6. Amount in words
    story.extend(_sec_amount_words(invoice))
    story.append(Spacer(1, 4 * mm))

    # 7. Payment instructions (only if bank details captured)
    if _has_bank_details(invoice):
        story.extend(_sec_payment_instructions(invoice))
        story.append(Spacer(1, 4 * mm))

    # 8. Terms & conditions
    if invoice.terms_snapshot:
        story.extend(_sec_terms(invoice))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
