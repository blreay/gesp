#!/usr/bin/env python3
"""Fix dark-theme Typora/Chromium PDFs for printing and viewer compatibility.

Usage: python3 fix_dark_pdf.py input.pdf [output.pdf]

Pipeline:
  1. Scan all RGB colors from content streams + XObject Forms
  2. Build brightness-based color mapping (dark→light, light→dark)
  3. Replace colors in all page content streams and XObject Forms
  4. Reprocess with pdftocairo for font compatibility
  5. Copy bookmarks from original to final output
"""

import sys
import os
import re
import subprocess
import tempfile
import pikepdf


def scan_colors(pdf):
    """Collect all unique RGB color strings from all pages and XObjects."""
    colors = set()
    pattern = re.compile(r'([\d.]+\s+[\d.]+\s+[\d.]+)\s+(?:rg|RG)')
    processed_xobjects = set()

    for page in pdf.pages:
        raw = _read_content_stream(page)
        colors.update(pattern.findall(raw.decode('latin-1')))

        resources = page.get('/Resources', {})
        xobjects = resources.get('/XObject', {})
        for _, xref in xobjects.items():
            obj_id = xref.objgen
            if obj_id in processed_xobjects:
                continue
            processed_xobjects.add(obj_id)
            if xref.get('/Subtype') == pikepdf.Name('/Form'):
                xraw = bytes(xref.read_bytes()).decode('latin-1')
                colors.update(pattern.findall(xraw))

    return colors


def brightness(r, g, b):
    """ITU-R BT.601 luminance."""
    return 0.299 * r + 0.587 * g + 0.114 * b


def build_color_map(colors):
    """Classify colors by brightness and create dark→light mapping."""
    cmap = {}
    for color_str in colors:
        parts = color_str.split()
        r, g, b = float(parts[0]), float(parts[1]), float(parts[2])
        br = brightness(r, g, b)

        # Skip pure black and pure white — keep as-is
        if (r <= 0.01 and g <= 0.01 and b <= 0.01) or \
           (r >= 0.99 and g >= 0.99 and b >= 0.99):
            continue

        if br < 0.35:
            # Dark background → pure white
            cmap[color_str] = "1 1 1"
        elif br > 0.65:
            # Light text → dark (invert brightness)
            if br > 0.85:
                target = 0.10
            elif br > 0.75:
                target = 0.20
            else:
                target = 0.30
            if r == g == b or abs(max(r,g,b) - min(r,g,b)) < 0.05:
                cmap[color_str] = f"{target:.2f} {target:.2f} {target:.2f}"
            else:
                scale = target / max(br, 0.01)
                nr = min(r * scale, 1.0)
                ng = min(g * scale, 1.0)
                nb = min(b * scale, 1.0)
                cmap[color_str] = f"{nr:.4f} {ng:.4f} {nb:.4f}"
        else:
            # Accent/mid-range → darken slightly for contrast on white
            if r == g == b or abs(max(r,g,b) - min(r,g,b)) < 0.05:
                target = max(br * 0.7, 0.15)
                cmap[color_str] = f"{target:.2f} {target:.2f} {target:.2f}"
            else:
                scale = max(br * 0.7, 0.15) / max(br, 0.01)
                nr = min(r * scale, 1.0)
                ng = min(g * scale, 1.0)
                nb = min(b * scale, 1.0)
                cmap[color_str] = f"{nr:.4f} {ng:.4f} {nb:.4f}"

    return cmap


def replace_colors(content_bytes, color_map):
    """Replace RGB color values in a PDF content stream."""
    text = content_bytes.decode('latin-1')
    for old_color, new_color in color_map.items():
        text = text.replace(f"{old_color} rg", f"{new_color} rg")
        text = text.replace(f"{old_color} RG", f"{new_color} RG")
    return text.encode('latin-1')


def _read_content_stream(page):
    """Read and concatenate page content stream(s)."""
    contents = page.get('/Contents')
    if isinstance(contents, pikepdf.Array):
        raw = b''
        for s in contents:
            raw += bytes(s.read_bytes())
        return raw
    return bytes(contents.read_bytes())


def fix_colors(pdf, color_map):
    """Apply color replacement to all page content streams and XObject Forms."""
    processed_xobjects = set()

    for page in pdf.pages:
        contents = page.get('/Contents')
        if isinstance(contents, pikepdf.Array):
            new_streams = []
            for s in contents:
                raw = bytes(s.read_bytes())
                modified = replace_colors(raw, color_map)
                new_streams.append(pdf.make_stream(modified))
            page['/Contents'] = pikepdf.Array(new_streams)
        else:
            raw = bytes(contents.read_bytes())
            modified = replace_colors(raw, color_map)
            page['/Contents'] = pdf.make_stream(modified)

        resources = page.get('/Resources', {})
        xobjects = resources.get('/XObject', {})
        for _, xref in xobjects.items():
            obj_id = xref.objgen
            if obj_id in processed_xobjects:
                continue
            processed_xobjects.add(obj_id)
            if xref.get('/Subtype') == pikepdf.Name('/Form'):
                raw = bytes(xref.read_bytes())
                modified = replace_colors(raw, color_map)
                if raw != modified:
                    xref.write(modified)

    return len(processed_xobjects)


def reprocess_fonts(input_path, output_path):
    """Run pdftocairo to reprocess font embedding for compatibility."""
    result = subprocess.run(
        ['pdftocairo', '-pdf', input_path, output_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdftocairo failed: {result.stderr}")


def copy_bookmarks(src_pdf, dst_pdf):
    """Copy outline/bookmarks from source to destination PDF, remapping pages."""
    def _copy_recursive(src_p, dst_p, src_items, dst_items):
        for item in src_items:
            title = str(item.title)
            page_num = _find_page_num(src_p, item.destination)

            new_item = pikepdf.OutlineItem(title)
            if page_num is not None and page_num < len(dst_p.pages):
                new_item.destination = pikepdf.Array([
                    dst_p.pages[page_num].obj,
                    pikepdf.Name('/Fit')
                ])
            dst_items.append(new_item)

            if item.children:
                _copy_recursive(src_p, dst_p, item.children, new_item.children)

    def _find_page_num(pdf, dest):
        if dest is None:
            return None
        try:
            if isinstance(dest, pikepdf.Array):
                page_ref = dest[0]
                for i, p in enumerate(pdf.pages):
                    if p.objgen == page_ref.objgen:
                        return i
        except Exception:
            pass
        return None

    with src_pdf.open_outline() as src_ol:
        with dst_pdf.open_outline() as dst_ol:
            _copy_recursive(src_pdf, dst_pdf, src_ol.root, dst_ol.root)


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} input.pdf [output.pdf]")
        sys.exit(1)

    input_path = sys.argv[1]
    if len(sys.argv) >= 3:
        output_path = sys.argv[2]
    else:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_print{ext}"

    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found")
        sys.exit(1)

    print(f"Processing: {input_path}")

    # Step 1-2: Scan and build color map
    pdf = pikepdf.open(input_path)
    colors = scan_colors(pdf)
    print(f"  Found {len(colors)} unique colors")
    color_map = build_color_map(colors)
    print(f"  Mapped {len(color_map)} colors for replacement")

    # Step 3: Replace colors
    n_xobj = fix_colors(pdf, color_map)
    print(f"  Fixed colors in {len(pdf.pages)} pages + {n_xobj} XObjects")

    # Save color-fixed intermediate
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp1:
        tmp1_path = tmp1.name
    pdf.save(tmp1_path)

    # Step 4: Reprocess fonts with pdftocairo
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp2:
        tmp2_path = tmp2.name
    reprocess_fonts(tmp1_path, tmp2_path)
    print(f"  Reprocessed fonts via pdftocairo")

    # Step 5: Copy bookmarks from original to reprocessed
    src_pdf = pikepdf.open(input_path)
    dst_pdf = pikepdf.open(tmp2_path)
    copy_bookmarks(src_pdf, dst_pdf)
    dst_pdf.save(output_path)
    print(f"  Bookmarks copied")

    # Cleanup
    os.unlink(tmp1_path)
    os.unlink(tmp2_path)

    # Summary
    bk_count = 0
    final = pikepdf.open(output_path)
    def _count(items):
        return sum(1 + _count(i.children) for i in items)
    with final.open_outline() as ol:
        bk_count = _count(ol.root)

    in_size = os.path.getsize(input_path) // 1024
    out_size = os.path.getsize(output_path) // 1024
    print(f"\nDone: {output_path}")
    print(f"  {in_size}KB → {out_size}KB, {len(final.pages)} pages, {bk_count} bookmarks")


if __name__ == '__main__':
    main()
