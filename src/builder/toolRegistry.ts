// ============================================================================
// GRIOT AI — CONFIGURABLE EXTERNAL CREATION TOOL REGISTRY & RECOMMENDER
// Recommends the simplest suitable creation tool (Lovable, Google Antigravity,
// Replit, n8n/Make, or custom registered tools) based on project category,
// user technical experience level, and budget constraints.
// Never claims direct integration or automated control of external platforms.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

export type ProjectCategory =
  | 'website'
  | 'mobile_application'
  | 'web_application'
  | 'automation'
  | 'business_system'
  | 'ai_tool'
  | 'other';

export type TechnicalExperienceLevel =
  | 'complete_beginner'
  | 'some_experience'
  | 'intermediate'
  | 'advanced';

export type BudgetConstraint = 'free_only' | 'low_budget' | 'flexible_budget';

export interface BuilderToolEntry {
  id: string;
  name: string;
  platformUrl: string;
  supportedProjectTypes: ProjectCategory[];
  beginnerFriendliness: 'high' | 'medium' | 'advanced';
  codingRequirements: 'none' | 'low' | 'moderate' | 'high';
  freeTierAvailability: string;
  costConsiderations: string;
  strengths: string[];
  limitations: string[];
  requiredUserSetup: string[];
  recommendedUseCases: string[];
  navigationGuide: {
    openPlatform: string;
    whereToPastePrompt: string;
    whereToSeeResult: string;
  };
}

export interface ToolRecommendationResult {
  recommendedTool: BuilderToolEntry;
  alternativeTools: BuilderToolEntry[];
  rationale: string;
  setupChecklist: string[];
  transparencyNotice: string;
}

export class BuilderToolRegistry {
  private readonly registryPath: string;
  private tools = new Map<string, BuilderToolEntry>();

  constructor(
    registryPath = path.resolve(process.cwd(), 'config', 'builder.tools.json')
  ) {
    this.registryPath = registryPath;
    this.reloadFromDisk();
  }

  public reloadFromDisk(): void {
    if (!fs.existsSync(this.registryPath)) {
      throw new Error(`Builder tool registry not found at ${this.registryPath}`);
    }
    const raw = fs.readFileSync(this.registryPath, 'utf8');
    const parsed = JSON.parse(raw) as { tools: BuilderToolEntry[] };
    const next = new Map<string, BuilderToolEntry>();
    for (const tool of parsed.tools || []) {
      next.set(tool.id, structuredClone(tool));
    }
    this.tools = next;
  }

  public listTools(): BuilderToolEntry[] {
    return Array.from(this.tools.values());
  }

  public getToolById(toolId: string): BuilderToolEntry | null {
    return this.tools.get(toolId) ? structuredClone(this.tools.get(toolId)!) : null;
  }

  public registerTool(entry: BuilderToolEntry): BuilderToolEntry {
    this.tools.set(entry.id, structuredClone(entry));
    return this.getToolById(entry.id)!;
  }

  /**
   * Recommends the simplest suitable tool for a user's project category, skill level, and budget.
   */
  public recommendTool(params: {
    projectCategory: ProjectCategory;
    technicalExperience: TechnicalExperienceLevel;
    budgetConstraint: BudgetConstraint;
    preferredToolId?: string;
  }): ToolRecommendationResult {
    const allTools = this.listTools();

    if (params.preferredToolId) {
      const explicit = this.getToolById(params.preferredToolId);
      if (explicit) {
        return {
          recommendedTool: explicit,
          alternativeTools: allTools.filter((t) => t.id !== explicit.id).slice(0, 2),
          rationale: `Selected ${explicit.name} based on your explicit tool preference while matching your ${params.projectCategory.replace(/_/g, ' ')} project.`,
          setupChecklist: explicit.requiredUserSetup,
          transparencyNotice:
            `GRIOT does not directly control or modify your ${explicit.name} account. GRIOT generates the exact prompts and step-by-step instructions for you to paste into ${explicit.name}.`,
        };
      }
    }

    const scored = allTools
      .map((tool) => {
        let score = 0;

        // 1. Project category fit
        if (tool.supportedProjectTypes.includes(params.projectCategory)) {
          score += 50;
        } else {
          score -= 40;
        }

        // 2. Recommend the simplest suitable tool based on technical experience
        const isBeginner =
          params.technicalExperience === 'complete_beginner' ||
          params.technicalExperience === 'some_experience';

        if (isBeginner) {
          if (tool.beginnerFriendliness === 'high') score += 45;
          if (tool.codingRequirements === 'none') score += 35;
          else if (tool.codingRequirements === 'low') score += 15;

          // For websites or simple web apps by beginners, Lovable is the simplest visual starting point
          if (
            (params.projectCategory === 'website' ||
              params.projectCategory === 'web_application' ||
              params.projectCategory === 'business_system') &&
            tool.id === 'lovable'
          ) {
            score += 30;
          }
          // For pure automations, n8n/Make is the simplest visual no-code choice
          if (params.projectCategory === 'automation' && tool.id === 'n8n_make') {
            score += 45;
          }
        } else {
          // Intermediate or advanced builders often benefit from full workspace control (Google Antigravity or Replit)
          if (tool.id === 'google_antigravity') score += 40;
          if (tool.id === 'replit') score += 30;
          if (params.projectCategory === 'mobile_application' && tool.id === 'google_antigravity') {
            score += 35;
          }
        }

        // 3. Budget considerations
        if (params.budgetConstraint === 'free_only') {
          if (tool.id === 'google_antigravity' || tool.id === 'replit' || tool.id === 'lovable') {
            score += 15;
          }
          if (params.projectCategory === 'automation' && tool.id === 'n8n_make') {
            score += 20;
          }
        }

        return { tool, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0].tool;
    const alternatives = scored.slice(1, 3).map((s) => s.tool);

    return {
      recommendedTool: best,
      alternativeTools: alternatives,
      rationale: `Recommended ${best.name} as the simplest, most approachable tool for a ${params.technicalExperience.replace(/_/g, ' ')} building a ${params.projectCategory.replace(/_/g, ' ')} under a ${params.budgetConstraint.replace(/_/g, ' ')} budget. (${best.costConsiderations})`,
      setupChecklist: best.requiredUserSetup,
      transparencyNotice: `GRIOT does not directly control or modify your ${best.name} account. GRIOT generates the exact prompts, instructions, and verification steps for you to run inside ${best.name}.`,
    };
  }
}
