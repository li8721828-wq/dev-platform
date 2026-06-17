/**
 * Git 仓库服务
 * 通过 Git CLI 实现仓库克隆、文件浏览、分支管理等功能
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, symlink, mkdir } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

export class GitService {
  constructor(private storageRoot: string) {}

  // 获取项目仓库路径
  getRepoPath(projectId: string): string {
    return path.join(this.storageRoot, projectId, "repo");
  }

  // 克隆 Git 仓库
  async clone(projectId: string, gitUrl: string, branch?: string): Promise<{ success: boolean; message: string }> {
    const repoPath = this.getRepoPath(projectId);

    if (existsSync(repoPath)) {
      return { success: false, message: "Repository already exists" };
    }

    try {
      const args = ["clone"];
      if (branch) {
        args.push("-b", branch);
      }
      args.push("--depth", "1", gitUrl, repoPath);

      await execFileAsync("git", args, { timeout: 120000 });
      return { success: true, message: "Repository cloned successfully" };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Clone failed: ${errMsg}` };
    }
  }

  // 获取文件树
  async getFileTree(projectId: string, dirPath: string = "", maxDepth: number = 2): Promise<FileNode[]> {
    const repoPath = this.getRepoPath(projectId);
    const targetPath = path.join(repoPath, dirPath);

    if (!existsSync(targetPath)) {
      return [];
    }

    return this.readDirectory(targetPath, repoPath, 0, maxDepth);
  }

  // 读取目录内容
  private async readDirectory(dirPath: string, basePath: string, depth: number, maxDepth: number): Promise<FileNode[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    // 过滤掉 .git 和 node_modules 等目录
    const ignorePatterns = [".git", "node_modules", ".next", "dist", ".cache", "__pycache__", ".venv", "venv"];

    for (const entry of entries) {
      if (ignorePatterns.includes(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.isDirectory()) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        const node: FileNode = {
          name: entry.name,
          path: relativePath,
          type: "directory",
          children: depth < maxDepth ? await this.readDirectory(fullPath, basePath, depth + 1, maxDepth) : undefined
        };
        nodes.push(node);
      } else {
        const stats = await stat(fullPath);
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "file",
          size: stats.size
        });
      }
    }

    // 排序：目录在前，文件在后；同类型按名称排序
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // 读取文件内容
  async readFileContent(projectId: string, filePath: string): Promise<{ content: string; encoding: string } | null> {
    const repoPath = this.getRepoPath(projectId);
    const fullPath = path.join(repoPath, filePath);

    if (!existsSync(fullPath)) {
      return null;
    }

    // 检查文件大小，超过 1MB 不读取
    const stats = await stat(fullPath);
    if (stats.size > 1024 * 1024) {
      return { content: "[File too large to display]", encoding: "text" };
    }

    try {
      const content = await readFile(fullPath, "utf-8");
      return { content, encoding: "utf-8" };
    } catch {
      // 可能是二进制文件
      return { content: "[Binary file]", encoding: "binary" };
    }
  }

  // 获取分支列表
  async getBranches(projectId: string): Promise<BranchInfo[]> {
    const repoPath = this.getRepoPath(projectId);

    if (!existsSync(repoPath)) {
      return [];
    }

    try {
      const { stdout } = await execFileAsync("git", ["branch", "-a", "--format=%(refname:short) %(HEAD)"], {
        cwd: repoPath
      });

      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(" ");
          const name = parts[0];
          const isCurrent = parts[1] === "*";
          const isRemote = name.startsWith("origin/") || name.includes("/");
          return { name, isCurrent, isRemote };
        });
    } catch {
      return [];
    }
  }

  // 获取仓库状态
  async getStatus(projectId: string): Promise<GitStatus | null> {
    const repoPath = this.getRepoPath(projectId);

    if (!existsSync(repoPath)) {
      return null;
    }

    try {
      // 获取当前分支
      const { stdout: branchOutput } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: repoPath
      });
      const branch = branchOutput.trim();

      // 获取文件状态
      const { stdout: statusOutput } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoPath });

      const modified: string[] = [];
      const added: string[] = [];
      const deleted: string[] = [];
      const untracked: string[] = [];

      statusOutput.split("\n").forEach((line) => {
        if (!line) return;
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status === "??") untracked.push(file);
        else if (status.includes("M")) modified.push(file);
        else if (status.includes("A")) added.push(file);
        else if (status.includes("D")) deleted.push(file);
      });

      return { branch, ahead: 0, behind: 0, modified, added, deleted, untracked };
    } catch {
      return null;
    }
  }

  // 通过符号链接挂载本地项目目录
  async linkLocal(projectId: string, localPath: string, branch?: string): Promise<{ success: boolean; message: string }> {
    const repoPath = this.getRepoPath(projectId);

    // 验证本地路径存在且为目录
    if (!existsSync(localPath)) {
      return { success: false, message: `路径不存在: ${localPath}` };
    }
    try {
      const stats = await stat(localPath);
      if (!stats.isDirectory()) {
        return { success: false, message: `路径不是目录: ${localPath}` };
      }
    } catch {
      return { success: false, message: `无法访问路径: ${localPath}` };
    }

    // 如果 repoPath 已存在，报错
    if (existsSync(repoPath)) {
      return { success: false, message: "项目目录已存在，请先删除或选择其他项目" };
    }

    try {
      // 确保父目录存在
      await mkdir(path.dirname(repoPath), { recursive: true });
      // 创建符号链接（Windows 需要 junction 类型来链接目录）
      await symlink(localPath, repoPath, "junction");

      // 如果指定了分支，尝试切换
      if (branch) {
        try {
          await execFileAsync("git", ["checkout", branch], { cwd: repoPath, timeout: 30000 });
        } catch {
          // 分支切换失败不影响主流程，可能分支名不对或不是 git 仓库
          return { success: true, message: `本地项目导入成功，但无法切换到分支 ${branch}（可能不存在）` };
        }
      }

      return { success: true, message: "本地项目导入成功" };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `符号链接创建失败: ${errMsg}` };
    }
  }

  // 检查仓库是否存在
  repoExists(projectId: string): boolean {
    const repoPath = this.getRepoPath(projectId);
    return existsSync(path.join(repoPath, ".git")) || existsSync(repoPath);
  }
}
