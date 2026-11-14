import json, re, sys
src, out_jsonl = sys.argv[1], sys.argv[2]
t = open(src, encoding='utf-8-sig').read()
body, tail = t.split('XÁC THỰC VĂN BẢN HỢP NHẤT', 1)

def strip_marks(s):
    s = re.sub(r'(\d+)?\[(\d+)\]', lambda m: '' if (m.group(1) in (None, m.group(2))) else m.group(1), s)
    s = re.sub(r'^(\s*[a-zđ]\))(?=\S)', r'\1 ', s)
    return s

# footnotes 2..6
notes = {}
for line in tail.splitlines():
    m = re.match(r'^\s*(?:\[(\d+)\])?(\d+)?(?:\[(\d+)\])?\s+(\S.*)$', line)
    if m and (m.group(1) or m.group(2) or m.group(3)):
        n = int(m.group(1) or m.group(3) or m.group(2))
        if 2 <= n <= 6 and n not in notes:
            notes[n] = m.group(4).strip()

lines = body.splitlines()
chunks, chuong, ten_chuong, muc, cur = [], '', '', '', None
i = 0
while i < len(lines):
    raw = lines[i]; l = raw.strip()
    mc = re.match(r'^Chương\s+([IVXLC]+)\s*$', l)
    if mc:
        chuong = mc.group(1); ten_chuong = strip_marks(lines[i+1]).strip() if i+1 < len(lines) else ''; muc = ''
        i += 2; continue
    mm = re.match(r'^Mục\s+\d+\.?\s*(.*)$', l)
    if mm and not re.match(r'^Mục\s+\d+\s+Chương', l):
        muc = l; i += 1; continue
    md = re.match(r'^Điều\s+(\d+)\.\s*(.*)$', l)
    if md:
        marks = [int(x) for x in re.findall(r'\[(\d+)\]', raw)]
        cur = {'chunk_id': f"dieu-{md.group(1)}", 'chuong': chuong, 'ten_chuong': ten_chuong, 'muc': muc,
               'dieu': int(md.group(1)), 'tieu_de': strip_marks(md.group(2)).strip(), 'lines': [], 'marks': marks}
        chunks.append(cur); i += 1; continue
    if cur is not None and l:
        cur['marks'] += [int(x) for x in re.findall(r'\[(\d+)\]', raw)]
        cur['lines'].append(strip_marks(l))
    i += 1

out = []
for c in chunks:
    body_txt = '\n'.join(c['lines']).strip()
    sua = [notes[n] for n in c['marks'] if n in notes]
    khoan = len(re.findall(r'(?m)^\d+[a-z]?\.\s', body_txt))
    out.append({'chunk_id': c['chunk_id'], 'chuong': c['chuong'], 'ten_chuong': c['ten_chuong'], 'muc': c['muc'],
                'dieu': c['dieu'], 'tieu_de': c['tieu_de'],
                'noi_dung': f"Điều {c['dieu']}. {c['tieu_de']}\n{body_txt}".strip(),
                'so_khoan': khoan, 'sua_doi': sua,
                'nguon': 'Bộ luật Lao động – VBHN 18/VBHN-VPQH ngày 12/02/2026'})
with open(out_jsonl, 'w', encoding='utf-8') as f:
    for c in out: f.write(json.dumps(c, ensure_ascii=False) + '\n')
print(len(out), 'Điều; footnotes:', sorted(notes))
