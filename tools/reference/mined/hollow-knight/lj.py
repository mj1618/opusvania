import json, re
def lj(f):
    out = []
    for line in open(f, encoding="utf-8-sig"):
        # drop // comments outside strings
        q = False; i = 0; cut = len(line)
        while i < len(line):
            c = line[i]
            if c == '"' and (i == 0 or line[i-1] != '\\'): q = not q
            if not q and line.startswith('//', i): cut = i; break
            i += 1
        out.append(line[:cut])
    s = re.sub(r',(\s*[\]}])', r'\1', "\n".join(out))
    return json.loads(s)
