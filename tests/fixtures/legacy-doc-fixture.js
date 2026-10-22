import XLSX from 'xlsx';
export const { CFB } = XLSX;

// A small, real Unicode Word97 piece table inside a real compound file.
// Its independent literal clauses make decoding and boundary failures observable.
export function createLegacyDocFixture({ body = '示例维修项目\r工期：28日历天。\r', flags = 0x1000, nFib = 0x00c1, notes = {}, objects = [], macro = false, extraStreams = [], missingTable = false, corruptPiece = false } = {}) {
  const stories = [
    ['body', body, 0x4c], ['footnotes', notes.footnotes ? `${notes.footnotes}\r` : '', 0x50],
    ['headers', '', 0x54], ['annotations', notes.annotations ? `${notes.annotations}\r` : '', 0x5c],
    ['endnotes', notes.endnotes ? `${notes.endnotes}\r` : '', 0x60],
    ['bodyTextboxes', notes.bodyTextboxes ? `${notes.bodyTextboxes}\r` : '', 0x64],
    ['headerTextboxes', notes.headerTextboxes ? `${notes.headerTextboxes}\r` : '', 0x68],
  ];
  const combined = stories.map(([, text]) => text).join('');
  const encoded = Buffer.from(combined, 'utf16le');
  const word = Buffer.alloc(Math.max(4096, 1024 + encoded.length));
  word.writeUInt16LE(0xa5ec, 0); word.writeUInt16LE(nFib, 2); word.writeUInt16LE(flags, 10);
  word.writeUInt16LE(14, 0x20); word.writeUInt16LE(22, 0x3e); word.writeUInt16LE(93, 0x98);
  word.writeUInt32LE(1024, 0x18); word.writeUInt32LE(1024 + encoded.length, 0x1c);
  for (const [, value, offset] of stories) word.writeUInt32LE(value.length, offset);
  word.writeUInt32LE(0, 0x1a2); word.writeUInt32LE(21, 0x1a6);
  encoded.copy(word, 1024);
  const table = Buffer.alloc(4096);
  table[0] = 2; table.writeUInt32LE(16, 1);
  table.writeUInt32LE(0, 5); table.writeUInt32LE(combined.length, 9);
  table.writeUInt32LE(corruptPiece ? word.length + 200 : 1024, 15);
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, 'WordDocument', word);
  if (!missingTable) CFB.utils.cfb_add(cfb, flags & 0x0200 ? '1Table' : '0Table', table);
  for (let i = 0; i < objects.length; i++) CFB.utils.cfb_add(cfb, `ObjectPool/item${i}/\x01Ole10Native`, objects[i]);
  if (macro) CFB.utils.cfb_add(cfb, 'Macros/VBA/ThisDocument', Buffer.from('Sub AutoOpen()\rShell "should-never-run"\rEnd Sub'));
  for (const [name, content] of extraStreams) CFB.utils.cfb_add(cfb, name, content);
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }));
}

export function createLegacyNativeObject(name, payload, { unicodeName = name, badSize = false } = {}) {
  const asciiName = Buffer.from(name, 'utf8');
  const sourcePath = Buffer.from('C:\\PRIVATE\\source.bin\0', 'utf8');
  const command = Buffer.from('C:\\PRIVATE\\temp.bin\0', 'utf8');
  const short = Buffer.alloc(2); short.writeUInt16LE(2);
  const length = n => { const value = Buffer.alloc(4); value.writeUInt32LE(n); return value; };
  const utf = text => Buffer.concat([length(text.length), Buffer.from(text, 'utf16le')]);
  const fields = Buffer.concat([
    short, asciiName, Buffer.from([0]), sourcePath, Buffer.alloc(4), length(command.length), command,
    length(badSize ? payload.length + 100000 : payload.length), payload,
    utf('C:\\PRIVATE\\temp.bin'), utf(unicodeName), utf('C:\\PRIVATE\\source.bin'),
  ]);
  return Buffer.concat([length(fields.length), fields]);
}

