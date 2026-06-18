/**
 * 文件读取服务
 * 负责从本地路径读取各种格式的文件并提取文本内容
 */

import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createUnzip } from "node:zlib";

// 支持的文本格式（可直接读取）
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".xml", ".json", ".yaml", ".yml", ".csv",
  ".sql", ".properties", ".html", ".htm", ".log", ".cfg",
  ".ini", ".conf", ".sh", ".bat", ".java", ".ts", ".js",
  ".py", ".go", ".rs", ".c", ".cpp", ".h", ".hpp", ".cs",
  ".rb", ".php", ".swift", ".kt", ".scala", ".groovy",
  ".css", ".scss", ".less", ".sass", ".vue", ".jsx", ".tsx",
  ".graphql", ".proto", ".toml", ".env", ".gitignore",
  ".dockerignore", ".editorconfig", ".prettierrc", ".eslintrc"
]);

// 最大单文件内容字符数（完整读取时不截断）
const MAX_CONTENT_LENGTH = 500000;
// 文件夹递归最大深度
const MAX_DIR_DEPTH = 3;

export interface FileContent {
  path: string;
  name: string;
  content: string;
  size: number;
  format: string;
  contentType?: "text" | "html" | "table" | "pdf" | "binary";
}

export class FileReaderService {
  /**
   * 读取文件路径（可以是文件或文件夹）
   * 返回提取的文本内容列表
   */
  async readPaths(paths: string[]): Promise<FileContent[]> {
    const results: FileContent[] = [];

    for (const p of paths) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      if (!existsSync(trimmed)) {
        results.push({
          path: trimmed,
          name: path.basename(trimmed),
          content: `[错误] 路径不存在: ${trimmed}`,
          size: 0,
          format: "error"
        });
        continue;
      }

      try {
        const stats = await stat(trimmed);
        if (stats.isDirectory()) {
          const dirFiles = await this.readDirectory(trimmed, 0);
          results.push(...dirFiles);
        } else if (stats.isFile()) {
          const file = await this.readSingleFile(trimmed);
          results.push(file);
        }
      } catch (err) {
        results.push({
          path: trimmed,
          name: path.basename(trimmed),
          content: `[错误] 无法读取: ${err instanceof Error ? err.message : String(err)}`,
          size: 0,
          format: "error"
        });
      }
    }

    return results;
  }

  /**
   * 读取单个文件
   */
  private async readSingleFile(filePath: string): Promise<FileContent> {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    const stats = await stat(filePath);

    // 文本格式 - 直接读取
    if (TEXT_EXTENSIONS.has(ext) || ext === "") {
      try {
        let content = await readFile(filePath, "utf-8");
        if (content.length > MAX_CONTENT_LENGTH) {
          content = content.substring(0, MAX_CONTENT_LENGTH) + "\n...[内容已截断]";
        }
        return { path: filePath, name, content, size: stats.size, format: ext || "text" };
      } catch {
        return { path: filePath, name, content: "[错误] 文件编码不是 UTF-8", size: stats.size, format: ext };
      }
    }

    // Word 文档
    if (ext === ".docx") {
      return this.readDocx(filePath, name, stats.size);
    }

    // PDF
    if (ext === ".pdf") {
      return this.readPdf(filePath, name, stats.size);
    }

    // Excel
    if (ext === ".xlsx" || ext === ".xls") {
      return this.readExcel(filePath, name, stats.size);
    }

    // ZIP 压缩包
    if (ext === ".zip") {
      return this.readZip(filePath, name, stats.size);
    }

    // 不支持的格式
    return {
      path: filePath,
      name,
      content: `[二进制文件] 格式 ${ext} 暂不支持提取文本，文件大小: ${this.formatSize(stats.size)}`,
      size: stats.size,
      format: ext
    };
  }

  /**
   * 从 docx 中提取指定索引的嵌入文件的实际数据
   */
  async extractEmbeddedFileData(docxPath: string, index: number): Promise<{ data: Buffer; fileName: string; format: string; mime: string } | null> {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const cfb = await import("cfb");
      const zip = new AdmZip(docxPath);
      const entries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.startsWith("word/embeddings/") && !e.entryName.endsWith(".rels"));
      const entry = entries[index];
      if (!entry) return null;

      const rawName = entry.entryName.split("/").pop() || "file";

      if (rawName.endsWith(".bin")) {
        const cf = cfb.read(entry.getData(), { type: "buffer" });

        // Package 流（名称可能有前缀字符）
        const pkg = cf.FileIndex.find((f: any) => f.name.toLowerCase().includes("package") && f.type === 2);
        if (pkg?.content) {
          const buf = Buffer.from(pkg.content as any);
          const fmt = this.detectFormat(buf);
          return { data: buf, fileName: rawName.replace(/\.bin$/, fmt.ext), format: fmt.ext, mime: fmt.mime };
        }

        // Ole10Native 流（名称可能有 \u0001 前缀）
        const native = cf.FileIndex.find((f: any) => f.name.toLowerCase().includes("ole10native") && f.type === 2);
        if (native?.content) {
          const result = await this.parseOle10Native(Buffer.from(native.content as any));
          if (result) {
            const fmt = this.detectFormat(result.data);
            return { data: result.data, fileName: result.fileName || rawName.replace(/\.bin$/, fmt.ext), format: fmt.ext, mime: fmt.mime };
          }
        }
      }

      // 非 OLE 文件，直接返回
      const ext = "." + rawName.split(".").pop();
      return { data: entry.getData(), fileName: rawName, format: ext, mime: "application/octet-stream" };
    } catch {
      return null;
    }
  }

  /**
   * 读取 Word 文档 - 转为 HTML 保留格式，图片转 base64
   */
  private async readDocx(filePath: string, name: string, size: number): Promise<FileContent> {
    try {
      const mammoth = await import("mammoth");

      // 图片转 base64 data URI
      const options = {
        path: filePath,
        convertImage: mammoth.images.imgElement(async (image: any) => {
          const buffer = await image.read();
          const base64 = buffer.toString("base64");
          const mimeType = image.contentType || "image/png";
          return { src: `data:${mimeType};base64,${base64}` };
        })
      };

      const result = await mammoth.convertToHtml(options);
      let content = result.value;

      // 提取嵌入的文件（Excel、OLE 对象等）
      const embeddedFiles = await this.extractEmbeddedFiles(filePath);
      if (embeddedFiles.length > 0) {
        const embeddedHtml = embeddedFiles.map((f, i) =>
          `<div class="embedded-file" data-embed-index="${i}" data-format="${f.format}" data-filename="${f.fileName}">` +
          `<span class="embedded-file-icon">${this.embeddedFileIcon(f.format)}</span>` +
          `<span class="embedded-file-name">${f.fileName}</span>` +
          `<span class="embedded-file-size">${f.sizeLabel}</span>` +
          `<button class="embedded-file-view-btn">👁️ 查看</button>` +
          `<a class="embedded-file-download-btn" data-embed-index="${i}" title="下载">⬇️</a>` +
          `</div>`
        ).join("\n");
        content += `\n<div class="embedded-files-section"><h4>📎 嵌入的附件 (${embeddedFiles.length})</h4><p class="embedded-hint">点击下方「查看」可在线预览文件内容</p>${embeddedHtml}</div>`;
      }

      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) + "\n<p>...[内容已截断]</p>";
      }
      return { path: filePath, name, content, size, format: ".docx", contentType: "html" };
    } catch (err) {
      return { path: filePath, name, content: `[错误] Word 解析失败: ${err instanceof Error ? err.message : String(err)}`, size, format: ".docx" };
    }
  }

  /**
   * 从 docx 中提取嵌入的文件（支持 OLE 对象解析）
   */
  private async extractEmbeddedFiles(docxPath: string): Promise<Array<{ fileName: string; format: string; sizeLabel: string; entryPath: string }>> {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const cfb = await import("cfb");
      const zip = new AdmZip(docxPath);
      const entries = zip.getEntries();
      const embedded: Array<{ fileName: string; format: string; sizeLabel: string; entryPath: string }> = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryPath = entry.entryName;

        if (entryPath.startsWith("word/embeddings/")) {
          const fileName = entryPath.split("/").pop() || entryPath;

          if (fileName.endsWith(".bin")) {
            // OLE 对象 - 解析内部结构
            try {
              const oleData = entry.getData();
              const cf = cfb.read(oleData, { type: "buffer" });

              // 尝试 Package 流
              const pkg = cf.FileIndex.find((f: any) => f.name.toLowerCase().includes("package") && f.type === 2);
              if (pkg && pkg.content) {
                const buf = Buffer.from(pkg.content as any);
                const fmt = this.detectFormat(buf);
                embedded.push({
                  fileName: fileName.replace(/\.bin$/, fmt.ext),
                  format: fmt.ext,
                  sizeLabel: this.formatSize(buf.length),
                  entryPath
                });
                continue;
              }

              // 尝试 Ole10Native 流
              const native = cf.FileIndex.find((f: any) => f.name.toLowerCase().includes("ole10native") && f.type === 2);
              if (native && native.content) {
                const result = await this.parseOle10Native(Buffer.from(native.content as any));
                if (result) {
                  const fmt = this.detectFormat(result.data);
                  embedded.push({
                    fileName: result.fileName || fileName.replace(/\.bin$/, fmt.ext),
                    format: fmt.ext,
                    sizeLabel: this.formatSize(result.data.length),
                    entryPath
                  });
                  continue;
                }
              }

              // 其他 OLE 类型
              embedded.push({ fileName: fileName.replace(/\.bin$/, " (OLE)"), format: ".ole", sizeLabel: this.formatSize(entry.header.size), entryPath });
            } catch {
              embedded.push({ fileName: fileName.replace(/\.bin$/, " (OLE)"), format: ".ole", sizeLabel: this.formatSize(entry.header.size), entryPath });
            }
          } else if (!fileName.endsWith(".rels") && entry.header.size > 0) {
            const ext = "." + fileName.split(".").pop();
            embedded.push({ fileName, format: ext, sizeLabel: this.formatSize(entry.header.size), entryPath });
          }
        }
      }

      return embedded;
    } catch {
      return [];
    }
  }

  /**
   * 解析 Ole10Native 格式，提取实际文件数据
   */
  private async parseOle10Native(buf: Buffer): Promise<{ fileName: string; data: Buffer } | null> {
    try {
      const totalSize = buf.readUInt32LE(0);
      const contentEnd = totalSize + 4; // Ole10Native 内容结束位置

      let p = 6; // skip size(4) + flags(2)
      // 跳过 label
      while (p < buf.length && buf[p] !== 0) p++;
      p++;
      // 读取 filename（Ole10Native 中文件名通常是 GBK 编码）
      const fnStart = p;
      while (p < buf.length && buf[p] !== 0) p++;
      const fnBuf = buf.slice(fnStart, p);
      p++; // skip null
      // 尝试用 iconv-lite 解码 GBK 文件名
      let fileName = "";
      try {
        const iconvModule = await import("iconv-lite");
        const iconv = (iconvModule as any).default || iconvModule;
        fileName = iconv.decode(fnBuf, "gbk");
      } catch {
        fileName = fnBuf.toString("utf-8");
      }
      p += 2; // skip flags

      // 从 filename 之后到 contentEnd 之间，找到数据段
      // 策略：取最后一个 data size 使得 data 恰好到 contentEnd
      let bestData: Buffer | null = null;
      let bestFileName = fileName;

      // 第一优先：找 data 恰好填满到 contentEnd 的位置
      for (let pos = p; pos < contentEnd - 4; pos++) {
        const dataSize = buf.readUInt32LE(pos);
        const dataStart = pos + 4;
        const dataEnd = dataStart + dataSize;
        if (dataSize >= 100 && dataEnd >= contentEnd - 4 && dataEnd <= contentEnd) {
          bestData = buf.slice(dataStart, Math.min(dataEnd, buf.length));
          // 不 break，继续找更好的匹配（取最后一个）
        }
      }

      // 备用：取最后一个 dataSize 合理的
      if (!bestData) {
        for (let pos = p; pos < contentEnd - 4; pos++) {
          const dataSize = buf.readUInt32LE(pos);
          if (dataSize >= 100 && dataSize <= contentEnd - pos - 4) {
            bestData = buf.slice(pos + 4, pos + 4 + dataSize);
          }
        }
      }

      if (bestData) {
        return { fileName: bestFileName, data: bestData };
      }

      // 备用：直接取 filename 之后的所有剩余内容作为数据
      const remaining = buf.slice(p, contentEnd);
      if (remaining.length > 100) {
        return { fileName, data: remaining };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 通过文件头魔术字节检测格式
   */
  private detectFormat(buf: Buffer): { ext: string; mime: string } {
    if (buf[0] === 0x50 && buf[1] === 0x4b) return { ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    if (buf[0] === 0xd0 && buf[1] === 0xcf) return { ext: ".xls", mime: "application/vnd.ms-excel" };
    if (buf[0] === 0x25 && buf[1] === 0x50) return { ext: ".pdf", mime: "application/pdf" };
    if (buf[0] === 0x89 && buf[1] === 0x50) return { ext: ".png", mime: "image/png" };
    if (buf[0] === 0xff && buf[1] === 0xd8) return { ext: ".jpg", mime: "image/jpeg" };
    if (buf[0] === 0x47 && buf[1] === 0x49) return { ext: ".gif", mime: "image/gif" };
    // 检查是否为文本内容
    if (this.isLikelyText(buf)) return { ext: ".txt", mime: "text/plain" };
    return { ext: ".bin", mime: "application/octet-stream" };
  }

  private isLikelyText(buf: Buffer): boolean {
    const checkLen = Math.min(buf.length, 512);
    let nonPrintable = 0;
    for (let i = 0; i < checkLen; i++) {
      const b = buf[i];
      if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b)) nonPrintable++;
    }
    return nonPrintable < checkLen * 0.1; // 少于 10% 不可打印字符则视为文本
  }

  private embeddedFileIcon(format: string): string {
    const icons: Record<string, string> = {
      ".xlsx": "📊", ".xls": "📊", ".csv": "📊",
      ".pdf": "📑", ".pptx": "📽️", ".docx": "📄",
      ".zip": "🗜️", ".rar": "🗜️", ".ole": "📦"
    };
    return icons[format] || "📎";
  }

  /**
   * 读取 PDF 文件
   */
  private async readPdf(filePath: string, name: string, size: number): Promise<FileContent> {
    try {
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const buffer = await readFile(filePath);
      const data = await pdfParse(buffer);
      let content = data.text;
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) + "\n...[内容已截断]";
      }
      return { path: filePath, name, content, size, format: ".pdf", contentType: "pdf" };
    } catch (err) {
      return { path: filePath, name, content: `[错误] PDF 解析失败: ${err instanceof Error ? err.message : String(err)}`, size, format: ".pdf" };
    }
  }

  /**
   * 读取 Excel 文件 - 转为 HTML 表格
   */
  private async readExcel(filePath: string, name: string, size: number): Promise<FileContent> {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.readFile(filePath);
      const sheets: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const html = XLSX.utils.sheet_to_html(sheet);
        sheets.push(`<div class="sheet-title">Sheet: ${sheetName}</div>${html}`);
      }
      let content = sheets.join("\n");
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) + "\n<p>...[内容已截断]</p>";
      }
      return { path: filePath, name, content, size, format: ".xlsx", contentType: "table" };
    } catch (err) {
      return { path: filePath, name, content: `[错误] Excel 解析失败: ${err instanceof Error ? err.message : String(err)}`, size, format: ".xlsx" };
    }
  }

  /**
   * 读取 ZIP 压缩包 - HTML 格式展示
   */
  private async readZip(filePath: string, name: string, size: number): Promise<FileContent> {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();

      // 文件列表 HTML
      const fileRows = entries.filter((e: any) => !e.isDirectory).map((e: any) => {
        const ext = path.extname(e.entryName).toLowerCase();
        const icon = this.embeddedFileIcon(ext);
        return `<tr><td>${icon} ${e.entryName}</td><td>${this.formatSize(e.header.size)}</td></tr>`;
      });

      let content = `<h4>📦 ZIP 文件内容 (${fileRows.length} 个文件)</h4>`;
      content += `<table><thead><tr><th>文件</th><th>大小</th></tr></thead><tbody>${fileRows.join("\n")}</tbody></table>`;

      // 读取文本文件内容
      const textContents: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const ext = path.extname(entry.entryName).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext) && entry.header.size < 100000) {
          const text = entry.getData().toString("utf-8");
          textContents.push(`<h5>${entry.entryName}</h5><pre>${text.substring(0, 10000)}${text.length > 10000 ? "\n...[截断]" : ""}</pre>`);
        }
      }
      if (textContents.length > 0) {
        content += `<h4>📝 文本文件内容</h4>${textContents.join("\n")}`;
      }

      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) + "\n<p>...[内容已截断]</p>";
      }
      return { path: filePath, name, content, size, format: ".zip", contentType: "html" };
    } catch (err) {
      return { path: filePath, name, content: `[错误] ZIP 读取失败: ${err instanceof Error ? err.message : String(err)}`, size, format: ".zip" };
    }
  }

  /**
   * 递归读取文件夹
   */
  private async readDirectory(dirPath: string, depth: number): Promise<FileContent[]> {
    if (depth > MAX_DIR_DEPTH) return [];

    const results: FileContent[] = [];
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // 跳过隐藏文件和常见忽略目录
      if (entry.name.startsWith(".") || ["node_modules", "dist", "build", "__pycache__", ".git"].includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await this.readDirectory(fullPath, depth + 1);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        try {
          const file = await this.readSingleFile(fullPath);
          results.push(file);
        } catch {
          // 跳过无法读取的文件
        }
      }
    }

    return results;
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
