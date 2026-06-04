/**
 * 部署配置管理服务
 */
import type { AiClient } from "../ai/client.js";

export interface DeployConfigOutput {
  dockerfile: string;
  dockerCompose: string;
  envVars: Array<{ key: string; value: string; description: string }>;
  buildCommand: string;
  startCommand: string;
  ciCdPipeline?: string;
  notes: string;
}

export interface DeployValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class DeployService {
  constructor(private aiClient: AiClient) {}

  async generateDeployConfig(
    projectContext: { projectName: string; techStack?: string[]; existingFiles?: string[] },
    requirements?: string
  ): Promise<DeployConfigOutput> {
    const systemPrompt = `你是一位 DevOps 工程师。请基于项目信息生成完整的部署配置。

输出要求（严格 JSON 格式）：
{
  "dockerfile": "完整的 Dockerfile 内容",
  "dockerCompose": "完整的 docker-compose.yml 内容",
  "envVars": [{"key": "ENV_KEY", "value": "default_value", "description": "说明"}],
  "buildCommand": "构建命令",
  "startCommand": "启动命令",
  "ciCdPipeline": "GitHub Actions 或 CI/CD 配置（YAML 格式字符串）",
  "notes": "部署注意事项"
}`;

    const userPrompt = `项目：${projectContext.projectName}
技术栈：${projectContext.techStack?.join(", ") ?? "未指定"}
${projectContext.existingFiles?.length ? `已有文件：${projectContext.existingFiles.slice(0, 20).join(", ")}` : ""}
${requirements ? `需求背景：${requirements}` : ""}

请生成部署配置。`;

    const result = await this.aiClient.chatJson<DeployConfigOutput>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    if (!result.data) {
      throw new Error(`部署配置生成失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }

  validateDeployConfig(config: { dockerfile?: string; dockerCompose?: string; buildCommand?: string }): DeployValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Dockerfile 校验
    if (config.dockerfile) {
      if (!config.dockerfile.includes("FROM")) {
        errors.push("Dockerfile 缺少 FROM 指令");
      }
      if (!config.dockerfile.includes("WORKDIR") && config.dockerfile.includes("COPY")) {
        warnings.push("建议在 COPY 前设置 WORKDIR");
      }
      if (config.dockerfile.includes("latest")) {
        warnings.push("建议指定具体的镜像版本而非 latest");
      }
    } else {
      errors.push("缺少 Dockerfile");
    }

    // docker-compose 校验
    if (config.dockerCompose) {
      if (!config.dockerCompose.includes("services:")) {
        errors.push("docker-compose.yml 缺少 services 定义");
      }
      if (!config.dockerCompose.includes("ports:") && !config.dockerCompose.includes("expose:")) {
        warnings.push("未定义端口映射");
      }
    } else {
      warnings.push("未提供 docker-compose.yml");
    }

    // 构建命令校验
    if (!config.buildCommand) {
      errors.push("缺少构建命令");
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
