import fitz, os, sys

# Find the menu PDF
fname = None
for f in os.listdir('.'):
    if f.endswith('.pdf') and '일정' not in f and 'group' not in f.lower() and 'nbt' not in f.lower() and 'bio' not in f.lower():
        fname = f
        break

if not fname:
    print("PDF not found"); sys.exit(1)

print(f"File: {fname}\n")

doc = fitz.open(fname)
for page_num, page in enumerate(doc):
    print(f"=== Page {page_num+1} ===")
    # Extract plain text
    text = page.get_text("text")
    print(text)
    print()
    # Try block extraction (better for tables)
    print("--- BLOCKS ---")
    blocks = page.get_text("blocks")
    for b in blocks:
        txt = b[4].strip()
        if txt:
            print(repr(txt))
doc.close()
