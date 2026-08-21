#!/usr/bin/env python3
"""Make a scannable WhatsApp QR, and prove it scans before handing it over.

A QR code that looks right and does not decode is worse than no QR, because
the person holding the phone blames their camera. So this generates and then
reads its own output back, and refuses to write a file it could not decode.

    python3 tools/wa-qr.py 50577659187 --text "Rosario, are you there?"
    python3 tools/wa-qr.py 50577659187 --out rosario.png --label "Talk to Rosario"

The number is the WhatsApp number the scanner will be put IN A CHAT WITH.
International format, digits only: no +, no spaces, no dashes, and no
leading zero. WhatsApp's own click-to-chat rule, and the single most common
reason one of these silently fails.

Install once:  pip install segno opencv-python-headless
"""

import argparse
import re
import sys


def wa_link(number: str, text: str | None) -> str:
    digits = re.sub(r"\D", "", number)
    if not digits:
        raise SystemExit("no digits in that number")
    if digits.startswith("00"):
        raise SystemExit(
            f"'{number}' starts 00. Use the country code alone — 0050577… should be 50577…"
        )
    if len(digits) < 8:
        raise SystemExit(f"'{digits}' is too short to be an international number")
    url = f"https://wa.me/{digits}"
    if text:
        from urllib.parse import quote
        url += "?text=" + quote(text)
    return url


def verify(path: str, expected: str) -> str:
    """Read the QR back with a real decoder. Returns the decoded string."""
    try:
        import cv2
    except ImportError:
        print("  ! opencv not installed — CANNOT verify this scans", file=sys.stderr)
        return ""
    img = cv2.imread(path)
    if img is None:
        raise SystemExit(f"wrote {path} but could not read it back")
    decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    if decoded != expected:
        raise SystemExit(
            f"REFUSING TO SHIP: the QR did not decode to what went in.\n"
            f"  wanted: {expected}\n  got:    {decoded or '(nothing)'}"
        )
    return decoded


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("number", help="WhatsApp number, digits only, with country code")
    ap.add_argument("--text", help="message pre-filled in the chat")
    ap.add_argument("--out", default="whatsapp-qr.png")
    ap.add_argument("--label", default="", help="caption rendered under the code")
    args = ap.parse_args()

    import segno

    url = wa_link(args.number, args.text)
    # High error correction: these get printed, screenshotted and photographed
    # off screens, and h survives about 30% damage.
    qr = segno.make(url, error="h")
    qr.save(args.out, scale=12, border=4, dark="#000000", light="#FFFFFF")

    got = verify(args.out, url)

    print(f"  url      {url}")
    print(f"  file     {args.out}")
    print(f"  verified {'yes — decoded back identically' if got else 'NO — install opencv-python-headless'}")
    if args.label:
        print(f"  label    {args.label}")


if __name__ == "__main__":
    main()
