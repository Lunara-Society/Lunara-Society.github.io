#!/usr/bin/env python3
"""Fill the outreach template and hand back something ready to send.

The house email is email_outreach.html. Everything that leaves us goes
through here, because doing it by hand is how three rounds of plain-text
letters got sent.

    python3 email_fill.py letter.json > out.html

letter.json is a flat object of the placeholder names listed at the top
of the template:

    {
      "PREHEADER": "...",
      "GREETING":  "Dear Dr Vogel",
      "OPENING":   "...",
      "BODY":      "...",
      "PULL":      "...",
      "ASK":       "...",
      "CTA_LABEL": "Read the briefing",
      "CTA_URL":   "https://lunarasociety.com/briefing.html",
      "OPTOUT":    "Reply with the word stop and we will not write again."
    }

It refuses rather than sends something wrong: a missing placeholder, a
leftover one, a relative image path, or an unfilled brace all stop the
run with a message on stderr and a non-zero exit.
"""

import json
import re
import sys

TEMPLATE = "email_outreach.html"

REQUIRED = [
    "PREHEADER", "GREETING", "OPENING", "BODY",
    "PULL", "ASK", "CTA_LABEL", "CTA_URL", "OPTOUT",
]

# Conditional comments are instructions to Outlook, not notes to
# ourselves, so they stay. Everything else is stripped before sending:
# the template's own commentary is for us and would otherwise travel to
# every recipient, who can read the source.
KEEP = re.compile(r"^\s*\[if\b|^\s*<!\[endif\]|^\s*<!$")


def strip_private_comments(html):
    out, i = [], 0
    for m in re.finditer(r"<!--(.*?)-->", html, re.S):
        if KEEP.search(m.group(1)):
            continue
        out.append(html[i:m.start()])
        i = m.end()
    out.append(html[i:])
    return "".join(out)


def fill(values, template=TEMPLATE):
    missing = [k for k in REQUIRED if not values.get(k, "").strip()]
    if missing:
        raise SystemExit("nothing sent: no value for " + ", ".join(missing))

    unknown = [k for k in values if k not in REQUIRED]
    if unknown:
        raise SystemExit("nothing sent: unrecognised key " + ", ".join(unknown))

    with open(template, encoding="utf-8") as fh:
        html = strip_private_comments(fh.read())

    for key in REQUIRED:
        html = html.replace("{{" + key + "}}", values[key])

    left = re.findall(r"\{\{[A-Z_]+\}\}", html)
    if left:
        raise SystemExit("nothing sent: template still holds " + ", ".join(sorted(set(left))))

    # A relative src resolves against mail.google.com and shows a broken
    # image. Every asset has to be absolute.
    for src in re.findall(r'<img[^>]+src="([^"]+)"', html):
        if not src.startswith("https://"):
            raise SystemExit("nothing sent: image is not absolute https — " + src)

    if "{{" in html or "}}" in html:
        raise SystemExit("nothing sent: a stray brace survived")

    return html


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as fh:
        sys.stdout.write(fill(json.load(fh)))
