#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""read_menu.py

주간 메뉴 PDF에서 텍스트와 표(블록) 정보를 추출합니다.

- PDF 파일을 자동으로 찾거나, 명시적으로 지정할 수 있습니다.
- 추출된 텍스트와 블록은 각각 파일(`*_text.txt`, `*_blocks.tsv`)에 저장됩니다.
- 오류 발생 시 친절한 메시지를 출력하고, 리소스를 안전하게 정리합니다.
"""

import os
import sys
import argparse

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.stderr.write("PyMuPDF (fitz) is not installed. Install it with: pip install PyMuPDF\n")
    sys.exit(1)


def find_pdf(search_dir: str) -> str:
    """디렉터리에서 가장 가능성이 높은 메뉴 PDF 파일을 반환.
    조건에 맞는 파일이 없으면 FileNotFoundError 를 발생시킵니다.
    """
    candidates = [
        f for f in os.listdir(search_dir)
        if f.lower().endswith('.pdf')
        and '일정' not in f
        and 'group' not in f.lower()
        and 'nbt' not in f.lower()
        and 'bio' not in f.lower()
    ]
    if not candidates:
        raise FileNotFoundError('Menu PDF not found in the current directory.')
    # 가장 최신 파일을 선택 (파일명에 날짜가 포함돼 있을 가능성)
    return max(candidates, key=lambda x: os.path.getmtime(os.path.join(search_dir, x)))


def extract(pdf_path: str, out_dir: str) -> None:
    """PDF 를 열어 페이지별 텍스트와 블록을 파일로 저장합니다."""
    os.makedirs(out_dir, exist_ok=True)
    with fitz.open(pdf_path) as doc:
        for page_no, page in enumerate(doc, start=1):
            # ---- plain text ----
            txt = page.get_text('text')
            txt_file = os.path.join(out_dir, f'page_{page_no:02d}_text.txt')
            with open(txt_file, 'w', encoding='utf-8') as f:
                f.write(txt)

            # ---- block (table) extraction ----
            blocks = page.get_text('blocks')
            block_file = os.path.join(out_dir, f'page_{page_no:02d}_blocks.tsv')
            with open(block_file, 'w', encoding='utf-8') as f:
                f.write('x0\ty0\tx1\ty1\ttext\n')
                for b in blocks:
                    txt = b[4].strip()
                    if txt:
                        f.write(f"{b[0]}\t{b[1]}\t{b[2]}\t{b[3]}\t{txt}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description='주간 메뉴 PDF에서 텍스트와 블록을 추출합니다.')
    parser.add_argument('-p', '--pdf', help='읽을 PDF 파일명 (지정하지 않으면 자동 탐색)', default=None)
    parser.add_argument('-o', '--out', help='결과를 저장할 디렉터리', default='menu_extracted')
    args = parser.parse_args()

    try:
        pdf_path = args.pdf or find_pdf('.')
        print(f'Processing PDF: {pdf_path}')
        extract(pdf_path, args.out)
        print(f'Extraction completed. Results saved in "{os.path.abspath(args.out)}"')
    except Exception as e:
        sys.stderr.write(f'Error: {e}\n')
        sys.exit(1)


if __name__ == '__main__':
    main()
