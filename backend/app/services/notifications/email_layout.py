"""Branded HTML email wrapper.

Wraps any template body (inner HTML) in a polished layout containing:
- Dark header with company logo + name
- White card for the body content
- Footer with support contact and powered-by note

All CSS is inlined — required for Gmail/Outlook compatibility.
"""
from __future__ import annotations

import html as _html


_PRIMARY = "#1F4959"
_DARK = "#011425"
_BG = "#F5F7F8"
_TEXT = "#2d3748"
_MUTED = "#718096"
_BORDER = "#e2e8f0"


def render_email_html(
    inner_html: str,
    *,
    company_name: str = "True Data Broadband Pvt. Ltd.",
    support_email: str | None = None,
    support_phone: str | None = None,
    address_line: str | None = None,
    logo_url: str | None = None,
) -> str:
    """Return a fully self-contained branded HTML email."""

    safe_company = _html.escape(company_name)

    # ── Header content ────────────────────────────────────────────────────
    if logo_url:
        header_img = (
            f'<div style="display:inline-block;background:#ffffff;'
            f'border-radius:10px;padding:10px 20px;margin-bottom:14px;">'
            f'<img src="{logo_url}" alt="{safe_company}" '
            f'style="max-height:44px;max-width:180px;display:block;" />'
            f'</div>'
        )
    else:
        header_img = ""

    header_name = (
        f'<div style="font-size:20px;font-weight:700;color:#ffffff;'
        f'letter-spacing:-0.3px;text-align:center;">{safe_company}</div>'
    )

    # ── Footer lines ──────────────────────────────────────────────────────
    footer_parts: list[str] = []
    if support_email:
        footer_parts.append(
            f'<a href="mailto:{_html.escape(support_email)}" '
            f'style="color:{_PRIMARY};text-decoration:none;">'
            f'{_html.escape(support_email)}</a>'
        )
    if support_phone:
        footer_parts.append(_html.escape(support_phone))
    if address_line:
        footer_parts.append(_html.escape(address_line))

    footer_contact = (
        '<br/>'.join(footer_parts)
        if footer_parts
        else ""
    )

    footer_contact_block = (
        f'<p style="margin:0 0 6px;font-size:13px;color:{_MUTED};">'
        f'{footer_contact}</p>'
        if footer_contact else ""
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>{safe_company}</title>
</head>
<body style="margin:0;padding:0;background-color:{_BG};font-family:'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"
       style="width:100%;background-color:{_BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Card -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:580px;border-radius:16px;
                    overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background-color:{_DARK};padding:28px 32px;text-align:center;">
            {header_img}
            {header_name}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:36px 36px 28px;">
            <div style="font-size:15px;line-height:1.7;color:{_TEXT};">
              {inner_html}
            </div>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="background-color:#ffffff;padding:0 36px;">
            <hr style="border:none;border-top:1px solid {_BORDER};margin:0;" />
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#ffffff;padding:20px 36px 28px;text-align:center;">
            {footer_contact_block}
            <p style="margin:0;font-size:12px;color:{_MUTED};">
              &copy; {company_name} &nbsp;&middot;&nbsp;
              <span style="color:#adb5bd;">Powered by
                <strong style="color:{_PRIMARY};">ORT</strong>
              </span>
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td>
  </tr>
</table>
</body>
</html>"""


def wrap_from_settings(inner_html: str, settings: object, base_url: str = "") -> str:
    """Convenience wrapper: pull branding fields straight from a CompanySettings ORM object."""
    logo_url: str | None = None
    if base_url:
        if getattr(settings, "logo_path", None):
            # Custom logo uploaded to company settings
            logo_url = f"{base_url.rstrip('/')}/api/v1/settings/company/logo"
        else:
            # Fall back to the default sidebar logo served from the backend static dir
            logo_url = f"{base_url.rstrip('/')}/static/logo.png"

    addr_parts = [
        getattr(settings, "address_line_1", None),
        getattr(settings, "city", None),
        getattr(settings, "state", None),
        getattr(settings, "pincode", None),
    ]
    address_line = ", ".join(p for p in addr_parts if p) or None

    return render_email_html(
        inner_html,
        company_name=getattr(settings, "company_name", "True Data Broadband Pvt. Ltd."),
        support_email=getattr(settings, "support_email", None),
        support_phone=getattr(settings, "support_phone", None),
        address_line=address_line,
        logo_url=logo_url,
    )
