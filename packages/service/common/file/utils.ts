/**
 * 文件处理工具
 */

/**
 * 解析 CSV 文件（正确处理引号内的换行符）
 */
export function parseCSV(content: string): string[][] {
  const result: string[][] = [];
  const rows: string[] = [];
  let currentRow = '';
  let inQuotes = false;

  // 首先，正确地按行分割（考虑引号内的换行）
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      inQuotes = !inQuotes;
      currentRow += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // 换行符在引号外，这是真正的行分隔符
      if (currentRow.trim()) {
        rows.push(currentRow);
      }
      currentRow = '';
      // 跳过 \r\n 中的 \n
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentRow += char;
    }
  }

  // 添加最后一行
  if (currentRow.trim()) {
    rows.push(currentRow);
  }

  // 然后解析每一行的字段
  for (const line of rows) {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // 检查是否是转义的引号 ""
        if (inQuotes && line[i + 1] === '"') {
          currentField += '"';
          i++; // 跳过下一个引号
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }

    // 添加最后一个字段
    fields.push(currentField.trim());

    result.push(fields);
  }

  return result;
}

/**
 * 生成 CSV 内容
 */
export function generateCSV(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((field) => {
          // 如果字段包含逗号或引号，需要用引号包裹
          if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        })
        .join(',')
    )
    .join('\n');
}
