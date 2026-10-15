"""Parse explicitly supplied records. Never reads WeChat databases or executes files."""
import csv
import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

MAX_BYTES = 24 * 1024 * 1024
MAX_FILES = 300
MAX_MESSAGES = 4000
TEXT_TYPES = {'.txt', '.md', '.json', '.jsonl', '.csv', '.xml', '.html', '.htm'}


class TextHTML(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('p', 'div', 'br', 'li', 'tr'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.hidden: self.hidden -= 1
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)


def decode(data):
    if data.startswith((b'\xff\xfe', b'\xfe\xff')): return data.decode('utf-16')
    for encoding in ('utf-8-sig', 'gb18030'):
        try: return data.decode(encoding)
        except UnicodeDecodeError: pass
    raise ValueError('文件不是可识别的文本编码')


def first(row, names):
    for key in names:
        value = row.get(key)
        if isinstance(value, (str, int, float)) and str(value).strip(): return str(value).strip()
    return None


def json_rows(value, depth=0):
    if depth > 24: raise ValueError('JSON 层级超过限制')
    if isinstance(value, list):
        for item in value: yield from json_rows(item, depth + 1)
    elif isinstance(value, dict):
        text = first(value, ['text', 'content', 'message', 'msgContent', 'msg_content', 'strContent', 'body', '消息', '内容'])
        if text:
            yield {'text': text,
                   'sender': first(value, ['senderName', 'sender_name', 'senderDisplayName', 'sender', 'from_name', 'display_name', '发送人', '发言人']),
                   'timestamp': first(value, ['timestamp', 'time', 'create_time', 'createTime', 'datetime', '时间']),
                   'sourceId': first(value, ['local_id', 'localId', 'msg_id', 'messageId', 'id'])}
            return
        for item in value.values():
            if isinstance(item, (list, dict)): yield from json_rows(item, depth + 1)


def xml_rows(text):
    if re.search(r'<!\s*(DOCTYPE|ENTITY)', text, re.I): raise ValueError('不接受 XML 外部实体或 DTD')
    root = ET.fromstring(text)
    found = False
    for item in root.iter('dataitem'):
        body = item.findtext('datadesc') or item.findtext('des') or item.findtext('datatitle')
        if body:
            found = True
            yield {'text': body, 'sender': item.findtext('dataitemsource/sourcename') or item.findtext('datasource/sourcename'),
                   'timestamp': item.findtext('dataitemsource/sourcetime') or item.findtext('datasource/sourcetime')}
    if not found:
        for item in root.iter():
            body = item.findtext('content') or item.findtext('text')
            if body:
                yield {'text': body, 'sender': item.findtext('sender'), 'timestamp': item.findtext('time')}


def plain_rows(text):
    # Native macOS WeChat 4.1.13 merged-forward TXT; MIT source reference in README.
    text = text.replace('\r\n', '\n').replace('\r', '\n').lstrip('\ufeff')
    native = list(re.finditer(r'(?m)^·([^\n]+)\n(\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2})\n', text))
    if native and native[0].start() == 0:
        return [{'sender': hit[1].strip(), 'timestamp': hit[2],
                 'text': text[hit.end():native[i+1].start() if i+1 < len(native) else len(text)].strip()}
                for i, hit in enumerate(native)]
    # Unknown formats remain one quoted source; do not invent speakers/dates.
    header = re.compile(r'^(.{1,60}?)\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*$')
    rows = []; current = None; before = []
    for line in text.splitlines():
        hit = header.match(line)
        if hit:
            if current: rows.append(current)
            current = {'sender': hit[1], 'timestamp': hit[2], 'text': ''}
        elif current: current['text'] += line + '\n'
        else: before.append(line)
    if current: rows.append(current)
    if any(line.strip() for line in before): rows.insert(0, {'text': '\n'.join(before)})
    return rows


def parse_one(name, data):
    if b'\x00' in data[:2048] and not data.startswith((b'\xff\xfe', b'\xfe\xff')):
        raise ValueError('文件不是可读的聊天文本')
    text = decode(data)
    suffix = PurePosixPath(name).suffix.lower()
    if suffix == '.jsonl':
        return [row for line in text.splitlines() if line.strip() for row in json_rows(json.loads(line))]
    if suffix == '.json' or text.lstrip().startswith(('{', '[')):
        return list(json_rows(json.loads(text)))
    if suffix == '.csv': return list(json_rows(list(csv.DictReader(io.StringIO(text)))))
    if suffix == '.xml' or text.lstrip().startswith(('<?xml', '<recordinfo')): return list(xml_rows(text))
    if suffix in ('.html', '.htm'):
        parser = TextHTML(); parser.feed(text); text = ''.join(parser.parts)
    elif suffix not in TEXT_TYPES:
        raise ValueError('尚不支持该记录文件格式，请提供文本或含文本的 ZIP')
    return plain_rows(text)


def parse(path, name_hint=None):
    path = Path(path)
    if path.stat().st_size > MAX_BYTES: raise ValueError('文件超过 24 MB 限制')
    messages = []; warnings = []; skipped = []; sources = []; total = 0
    def add(name, data):
        nonlocal total
        total += len(data)
        if total > MAX_BYTES: raise ValueError('文本展开后超过 24 MB 限制')
        try: rows = parse_one(name, data)
        except (ValueError, ET.ParseError) as error:
            warnings.append({'file': name, 'reason': str(error)[:160]}); return
        for row in rows:
            body = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', row.get('text', '')).strip()
            if not body: continue
            if len(messages) >= MAX_MESSAGES: raise ValueError('超过 4000 条记录，请分批导入')
            number = len(messages) + 1
            messages.append({'id': 'm' + str(number), 'text': body, 'sender': row.get('sender'),
                             'timestamp': row.get('timestamp'), 'sourceId': row.get('sourceId'), 'sourceFile': name})
        sources.append(name)
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            if len(archive.infolist()) > MAX_FILES: raise ValueError('压缩包文件数量超过限制')
            entries = archive.infolist()
            native_records = [item for item in entries if PurePosixPath(item.filename).name == '聊天记录.txt']
            for item in entries:
                name = item.filename; parts = PurePosixPath(name).parts
                if name.startswith('/') or '..' in parts or '\\' in name: raise ValueError('压缩包含不安全的文件路径')
                if item.is_dir() or name.startswith('__MACOSX/') or PurePosixPath(name).name.startswith('.'): continue
                if item.flag_bits & 1: raise ValueError('压缩包已加密，需先提供可读的导出记录')
                if item.file_size > MAX_BYTES or item.file_size / max(1, item.compress_size) > 300: raise ValueError('压缩包展开比例超过限制')
                if PurePosixPath(name).suffix.lower() not in TEXT_TYPES:
                    skipped.append(name); continue
                if native_records and item not in native_records:
                    skipped.append(name); continue
                add(name, archive.read(item))
    else: add(name_hint or path.name, path.read_bytes())
    if not messages: raise ValueError('未找到可解析的聊天文本；该分享包的格式仍需适配')
    if skipped: warnings.append({'reason': f'有 {len(skipped)} 个媒体或其他文件未参与文字总结'})
    if any(not row['sender'] or not row['timestamp'] for row in messages): warnings.append({'reason': '部分记录未提供署名或完整时间，结果中保留为未明确'})
    return {'messages': messages, 'recordCount': len(messages), 'sourceFiles': sources, 'skippedFiles': skipped, 'warnings': warnings,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == '__main__':
    try: print(json.dumps({'ok': True, 'value': parse(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)}, ensure_ascii=False))
    except Exception as error: print(json.dumps({'ok': False, 'error': str(error)[:240]}, ensure_ascii=False)); sys.exit(1)
