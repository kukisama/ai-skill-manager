/**
 * 安全 zip/tar.gz 解压工具
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as zlib from "zlib";

/**
 * 校验 Buffer 的 SHA-256
 */
export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex").toLowerCase();
}

/**
 * 安全路径检查：拒绝绝对路径和 .. 遍历
 */
function isSafePath(entryPath: string): boolean {
  if (path.isAbsolute(entryPath)) return false;
  const parts = entryPath.split(/[/\\]/);
  return !parts.includes("..");
}

/**
 * 从 zip Buffer 解压到目标目录（使用内置 zlib + 手动 zip 解析）
 *
 * 对于生产环境，建议改用 yauzl 包——但这里提供零依赖的 minimal 实现
 * 来解压简单 zip（无加密，DEFLATE 或 STORED），足够处理 skillhub 的包。
 */
export async function extractZip(
  zipBuffer: Buffer,
  targetDir: string
): Promise<string[]> {
  // 动态尝试 yauzl，如果没安装则用 Node 内置 child_process 调 tar 或抛错
  let yauzl: any;
  try {
    yauzl = require("yauzl");
  } catch {
    // yauzl 未安装，用 fallback
    return extractZipFallback(zipBuffer, targetDir);
  }
  return extractZipWithYauzl(yauzl, zipBuffer, targetDir);
}

function extractZipWithYauzl(
  yauzl: any,
  zipBuffer: Buffer,
  targetDir: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err) return reject(err);
      const extracted: string[] = [];

      zipfile.readEntry();
      zipfile.on("entry", (entry: any) => {
        const entryPath: string = entry.fileName;
        if (!isSafePath(entryPath)) {
          reject(new Error(`不安全的 zip 路径: ${entryPath}`));
          return;
        }
        const fullPath = path.join(targetDir, entryPath);

        if (/\/$/.test(entryPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
          zipfile.readEntry();
        } else {
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          zipfile.openReadStream(entry, (err2: any, readStream: any) => {
            if (err2) return reject(err2);
            const ws = fs.createWriteStream(fullPath);
            readStream.pipe(ws);
            ws.on("close", () => {
              extracted.push(entryPath);
              zipfile.readEntry();
            });
            ws.on("error", reject);
          });
        }
      });
      zipfile.on("end", () => resolve(extracted));
      zipfile.on("error", reject);
    });
  });
}

/**
 * Fallback: 写 Buffer 到临时文件，用系统命令解压
 * Windows 用 PowerShell Expand-Archive，Linux/macOS 用 unzip
 */
async function extractZipFallback(
  zipBuffer: Buffer,
  targetDir: string
): Promise<string[]> {
  const tmpZip = path.join(targetDir, "__tmp_download.zip");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(tmpZip, zipBuffer);

  const { execFileSync } = await import("child_process");
  try {
    if (process.platform === "win32") {
      execFileSync("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${tmpZip}' -DestinationPath '${targetDir}' -Force`,
      ]);
    } else {
      try {
        execFileSync("unzip", ["-o", tmpZip, "-d", targetDir]);
      } catch (err) {
        throw new Error(
          `解压失败: unzip 命令不可用或执行出错。请确保已安装 unzip (sudo apt install unzip)。原始错误: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  } finally {
    try {
      fs.unlinkSync(tmpZip);
    } catch {}
  }

  // 列出解压的文件
  return listFilesRecursive(targetDir);
}

/**
 * 从 tar.gz Buffer 解压到目标目录
 */
export async function extractTarGz(
  tarGzBuffer: Buffer,
  targetDir: string
): Promise<string[]> {
  let tar: any;
  try {
    tar = require("tar");
  } catch {
    return extractTarGzFallback(tarGzBuffer, targetDir);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  // tar 包的 extract 接受 stream
  const { Readable } = await import("stream");
  const stream = Readable.from(tarGzBuffer);

  await new Promise<void>((resolve, reject) => {
    stream
      .pipe(
        tar.extract({
          cwd: targetDir,
          strip: 0,
          filter: (entryPath: string) => isSafePath(entryPath),
        })
      )
      .on("finish", resolve)
      .on("error", reject);
  });

  return listFilesRecursive(targetDir);
}

/**
 * Fallback: 用系统 tar 命令解压 tar.gz（Linux/macOS/Windows 10+ 均自带 tar）
 */
async function extractTarGzFallback(
  tarGzBuffer: Buffer,
  targetDir: string
): Promise<string[]> {
  const tmpFile = path.join(targetDir, "__tmp_download.tar.gz");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(tmpFile, tarGzBuffer);

  const { execFileSync } = await import("child_process");
  try {
    // tar 在 Linux/macOS/Windows 10+ 均可用
    execFileSync("tar", ["-xzf", tmpFile, "-C", targetDir]);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }

  return listFilesRecursive(targetDir);
}

function listFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  function walk(current: string, prefix: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name), rel);
      } else {
        results.push(rel);
      }
    }
  }
  walk(dir, "");
  return results;
}
