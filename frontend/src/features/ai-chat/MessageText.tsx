type MessageBlock = {
  kind: 'paragraph' | 'heading' | 'unordered' | 'ordered';
  content: string[];
};

export function citationLocation(location: string) {
  return location
    .replace(/page\s+(\d+)\s*,\s*chunk\s+(\d+)/i, 'Page $1 · Chunk $2')
    .replace(/^chunk\s+(\d+)/i, 'Chunk $1');
}

function inlineAnswer(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export function MessageText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: MessageBlock[] = [];
  const isStructured = (line: string) => /^(#{1,3}\s+|[-*\u2022]\s+|\d+[.)]\s+)/.test(line.trim());

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', content: [heading[1]] });
      index += 1;
      continue;
    }

    const unordered = line.match(/^[-*\u2022]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-*\u2022]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ kind: 'unordered', content: items });
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ kind: 'ordered', content: items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isStructured(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: 'paragraph', content: [paragraph.join(' ')] });
  }

  return <div className="message-text">{blocks.map((block, index) => {
    if (block.kind === 'heading') return <h3 key={index}>{inlineAnswer(block.content[0])}</h3>;
    if (block.kind === 'unordered') {
      return <ul key={index}>{block.content.map((item, itemIndex) => <li key={itemIndex}>{inlineAnswer(item)}</li>)}</ul>;
    }
    if (block.kind === 'ordered') {
      return <ol key={index}>{block.content.map((item, itemIndex) => <li key={itemIndex}>{inlineAnswer(item)}</li>)}</ol>;
    }
    return <p key={index}>{inlineAnswer(block.content[0])}</p>;
  })}</div>;
}
