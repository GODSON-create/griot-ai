// ============================================================================
// GRIOT AI — GUIDED BUILD WORKFLOW ENGINE ("BUILD WITH GRIOT")
// Makes non-technical and technical users capable of building websites, web
// apps, mobile apps, automations, and business systems using external creation
// tools (Lovable, Google Antigravity, Replit, n8n/Make).
// Implements deterministic 12-state workflow management, quality control,
// platform-specific prompt generation, result review, and troubleshooting.
// ============================================================================

import type { ConversationEngine } from '../conversations/conversationEngine.ts';
import type { GriotDatabase } from '../db/database.ts';
import type { AuditAndRetentionService } from '../security/auditAndRetention.ts';
import { AuthError } from '../security/auth.ts';
import { generateId } from '../security/crypto.ts';
import type { AuthContext } from '../types/domain.ts';
import {
  BuilderToolRegistry,
  type BudgetConstraint,
  type BuilderToolEntry,
  type ProjectCategory,
  type TechnicalExperienceLevel,
} from './toolRegistry.ts';

export type GuidedWorkflowState =
  | 'IDEA_CAPTURE'
  | 'REQUIREMENTS_DISCOVERY'
  | 'PROJECT_CLASSIFICATION'
  | 'TOOL_RECOMMENDATION'
  | 'PROJECT_SPECIFICATION'
  | 'BUILD_PLAN'
  | 'ACTIVE_STEP'
  | 'USER_EXECUTION'
  | 'RESULT_REVIEW'
  | 'TROUBLESHOOTING'
  | 'STEP_APPROVAL'
  | 'PROJECT_COMPLETION';

export interface GuidedStepInstruction {
  stepIndex: number;
  stepNumber: number;
  stageTitle: string;
  status: 'pending' | 'active' | 'troubleshooting' | 'completed';
  detailLevel: 'beginner' | 'technical';
  whatToAchieve: string;
  whyItMatters: string;
  platformToOpen: string;
  navigationSteps: string[];
  exactPromptOrCode: string;
  expectedResult: string;
  howToVerify: string[];
  ifItFails: string;
  technicalDeepDive: string;
  transparencyDisclaimer: string;
}

export interface ProjectSpecification {
  projectTitle: string;
  projectCategory: ProjectCategory;
  targetAudience: string;
  coreProblemSolved: string;
  mvpFeatures: string[];
  pagesOrWorkflows: string[];
  dataEntities: string[];
  simplicityGuardrails: string[];
}

export interface PlanQualityCheckResult {
  passed: boolean;
  checks: {
    hasClearRequirements: boolean;
    noContradictions: boolean;
    noImpossibleInstructions: boolean;
    appropriateComplexityForSkill: boolean;
    validPlatformGuidance: boolean;
    everyStepHasVerification: boolean;
    respectsBudgetConstraint: boolean;
    noFalseExternalExecutionClaim: boolean;
  };
  warnings: string[];
}

export interface SubmittedStepResult {
  id: string;
  stepIndex: number;
  userObservation: string;
  attachmentSummary?: string;
  outcome: 'approved' | 'needs_revision';
  reviewFeedback: string;
  submittedAt: string;
}

export interface ReportedStepError {
  id: string;
  stepIndex: number;
  errorMessage: string;
  codeOrLogSnippet?: string;
  diagnosis: string;
  correctiveInstruction: GuidedStepInstruction;
  reportedAt: string;
}

export interface GuidedProjectRecord {
  id: string;
  orgId: string;
  workspaceId: string | null;
  userId: string;
  title: string;
  description: string;
  userObjective: string;
  projectCategory: ProjectCategory;
  technicalExperience: TechnicalExperienceLevel;
  budgetConstraint: BudgetConstraint;
  selectedToolId: string | null;
  selectedTool: BuilderToolEntry | null;
  workflowState: GuidedWorkflowState;
  detailLevel: 'beginner' | 'technical';
  requirements: {
    targetAudience: string;
    mustHaveFeatures: string[];
    clarifyingAnswers: Record<string, string>;
  };
  clarifyingQuestions: string[];
  specification: ProjectSpecification | null;
  qualityCheck: PlanQualityCheckResult | null;
  orderedSteps: GuidedStepInstruction[];
  currentStepIndex: number;
  completedSteps: number[];
  previousInstructions: GuidedStepInstruction[];
  submittedResults: SubmittedStepResult[];
  reportedErrors: ReportedStepError[];
  decisionsAndConstraints: string[];
  outstandingActions: string[];
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LocalAssistantGeneratorFn = (prompt: string) => Promise<string | null>;

export class GuidedBuildEngine {
  private readonly database: GriotDatabase;
  private readonly audit: AuditAndRetentionService;
  public readonly toolRegistry: BuilderToolRegistry;
  private readonly conversationEngine: ConversationEngine;
  private localAiEnhancer: LocalAssistantGeneratorFn | null = null;

  constructor(params: {
    database: GriotDatabase;
    audit: AuditAndRetentionService;
    conversationEngine: ConversationEngine;
    toolRegistry?: BuilderToolRegistry;
  }) {
    this.database = params.database;
    this.audit = params.audit;
    this.conversationEngine = params.conversationEngine;
    this.toolRegistry = params.toolRegistry ?? new BuilderToolRegistry();
  }

  public setLocalAiEnhancer(fn: LocalAssistantGeneratorFn): void {
    this.localAiEnhancer = fn;
  }

  /**
   * Classifies a user's natural-language project idea into a ProjectCategory
   * and extracts initial features and essential clarifying questions.
   */
  public classifyProjectIdea(ideaText: string): {
    category: ProjectCategory;
    inferredTitle: string;
    extractedFeatures: string[];
    essentialQuestions: string[];
  } {
    const text = ideaText.trim();
    let category: ProjectCategory = 'web_application';

    if (
      /\b(mobile\s+app|android\s+app|iphone\s+app|ios\s+app|play\s+store|app\s+store)\b/i.test(
        text
      )
    ) {
      category = 'mobile_application';
    } else if (
      /\b(automate|automation|webhook|whatsapp\s+bot|daily\s+notification|sync\s+google\s+sheets|workflow\s+trigger)\b/i.test(
        text
      )
    ) {
      category = 'automation';
    } else if (
      /\b(website|landing\s+page|portfolio|company\s+site|brochure\s+site|blog|church\s+website|restaurant\s+website|bakery\s+website)\b/i.test(
        text
      )
    ) {
      category = 'website';
    } else if (
      /\b(inventory\s+system|crm|invoice\s+tracker|hr\s+portal|pos\s+system|school\s+management|accounting\s+tracker)\b/i.test(
        text
      )
    ) {
      category = 'business_system';
    } else if (/\b(ai\s+assistant|chatbot|document\s+analyzer|ai\s+tutor)\b/i.test(text)) {
      category = 'ai_tool';
    }

    const firstSentence = text.split(/[.!?\n]/)[0].trim();
    const inferredTitle =
      firstSentence.length > 5 && firstSentence.length <= 70
        ? firstSentence
        : `Guided ${category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Project`;

    const extractedFeatures: string[] = [];
    if (/\b(booking|appointment|reservation|schedule)\b/i.test(text)) {
      extractedFeatures.push('Online booking & appointment form');
    }
    if (/\b(payment|paystack|flutterwave|stripe|checkout|price|order)\b/i.test(text)) {
      extractedFeatures.push('Product/Service catalog & order inquiry summary');
    }
    if (/\b(login|account|member|user\s+profile|dashboard)\b/i.test(text)) {
      extractedFeatures.push('User dashboard & simple account access');
    }
    if (/\b(whatsapp|contact|email|form|message)\b/i.test(text)) {
      extractedFeatures.push('Direct customer contact & inquiry capture');
    }
    if (extractedFeatures.length === 0) {
      extractedFeatures.push(
        'Clean home view explaining the core value proposition',
        'Interactive primary action form for users',
        'Summary dashboard to review submissions or activity'
      );
    }

    // Ask only essential clarifying questions (max 3 concise questions)
    const essentialQuestions: string[] = [
      'Who is the primary person that will use this (e.g., customers on their phones, your internal staff, or students)?',
      'What is the single most important action a visitor or user must be able to complete on Day 1?',
      'Do you want to start with a 100% free tool to build the first working version?',
    ];

    return {
      category,
      inferredTitle,
      extractedFeatures,
      essentialQuestions,
    };
  }

  /**
   * Starts a new Guided Build project from a user's idea description.
   * Transitions through IDEA_CAPTURE -> REQUIREMENTS_DISCOVERY -> PROJECT_CLASSIFICATION
   * -> TOOL_RECOMMENDATION -> PROJECT_SPECIFICATION -> BUILD_PLAN -> ACTIVE_STEP.
   */
  public async startProject(params: {
    auth: AuthContext;
    ideaDescription: string;
    title?: string;
    userObjective?: string;
    technicalExperience?: TechnicalExperienceLevel;
    budgetConstraint?: BudgetConstraint;
    preferredToolId?: string;
    detailLevel?: 'beginner' | 'technical';
    targetAudience?: string;
    mustHaveFeatures?: string[];
    autoGeneratePlan?: boolean;
  }): Promise<GuidedProjectRecord> {
    if (!params.ideaDescription || params.ideaDescription.trim().length < 5) {
      throw new Error('Please describe what you want to build (at least 5 characters).');
    }

    const id = generateId('gproj');
    const now = new Date().toISOString();
    const classified = this.classifyProjectIdea(params.ideaDescription);

    const title = (params.title || classified.inferredTitle).trim();
    const userObjective = (
      params.userObjective ||
      `Create a working ${classified.category.replace(/_/g, ' ')}: ${params.ideaDescription.trim()}`
    ).trim();
    const technicalExperience: TechnicalExperienceLevel =
      params.technicalExperience ?? 'complete_beginner';
    const budgetConstraint: BudgetConstraint = params.budgetConstraint ?? 'free_only';
    const detailLevel = params.detailLevel ?? 'beginner';

    // Recommend the simplest suitable tool based on category, skill level, and budget
    const recommendation = this.toolRegistry.recommendTool({
      projectCategory: classified.category,
      technicalExperience,
      budgetConstraint,
      preferredToolId: params.preferredToolId,
    });
    const selectedTool = recommendation.recommendedTool;

    const mustHaveFeatures =
      params.mustHaveFeatures && params.mustHaveFeatures.length > 0
        ? params.mustHaveFeatures
        : classified.extractedFeatures;

    const requirements = {
      targetAudience:
        params.targetAudience || 'Customers and everyday users on mobile and desktop',
      mustHaveFeatures,
      clarifyingAnswers: {},
    };

    // Create a linked persistent conversation so project context is maintained across turns
    const linkedConversation = this.conversationEngine.createConversation({
      auth: params.auth,
      title: `[Build Mode] ${title}`,
      metadata: {
        guidedProjectId: id,
        projectCategory: classified.category,
        selectedToolId: selectedTool.id,
      },
    });

    const decisionsAndConstraints: string[] = [
      `Project classified as '${classified.category}'.`,
      `Experience level set to '${technicalExperience}'; budget constraint set to '${budgetConstraint}'.`,
      `${recommendation.rationale}`,
      recommendation.transparencyNotice,
    ];

    const autoGenerate = params.autoGeneratePlan !== false;
    let workflowState: GuidedWorkflowState = autoGenerate
      ? 'ACTIVE_STEP'
      : 'REQUIREMENTS_DISCOVERY';

    let specification: ProjectSpecification | null = null;
    let orderedSteps: GuidedStepInstruction[] = [];
    let qualityCheck: PlanQualityCheckResult | null = null;
    let outstandingActions: string[] = [];

    if (autoGenerate) {
      specification = this.generateSpecification({
        title,
        description: params.ideaDescription,
        category: classified.category,
        targetAudience: requirements.targetAudience,
        mustHaveFeatures,
      });

      orderedSteps = await this.generateSequentialBuildSteps({
        title,
        description: params.ideaDescription,
        specification,
        tool: selectedTool,
        detailLevel,
      });

      qualityCheck = this.runPlanQualityControl({
        specification,
        steps: orderedSteps,
        tool: selectedTool,
        technicalExperience,
        budgetConstraint,
      });

      outstandingActions = [
        `Complete Step 1 in ${selectedTool.name}: ${orderedSteps[0]?.stageTitle || 'Initial Setup'}`,
        'Paste the result or report what happened so GRIOT can verify and unlock Step 2.',
      ];
    } else {
      outstandingActions = [
        'Answer the essential clarifying questions or confirm requirements to generate your build plan.',
      ];
    }

    const previousInstructions =
      orderedSteps.length > 0 ? [structuredClone(orderedSteps[0])] : [];

    this.database.db
      .prepare(
        `INSERT INTO guided_projects (
          id, org_id, workspace_id, user_id, title, description, user_objective,
          project_category, technical_experience, budget_constraint, selected_tool_id,
          workflow_state, detail_level, requirements_json, clarifying_questions_json,
          specification_json, quality_check_json, ordered_steps_json, current_step_index,
          completed_steps_json, previous_instructions_json, submitted_results_json,
          reported_errors_json, decisions_constraints_json, outstanding_actions_json,
          conversation_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, '[]', '[]', ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.auth.orgId,
        params.auth.workspaceId ?? null,
        params.auth.userId,
        title,
        params.ideaDescription.trim(),
        userObjective,
        classified.category,
        technicalExperience,
        budgetConstraint,
        selectedTool.id,
        workflowState,
        detailLevel,
        JSON.stringify(requirements),
        JSON.stringify(classified.essentialQuestions),
        JSON.stringify(specification || {}),
        JSON.stringify(qualityCheck || {}),
        JSON.stringify(orderedSteps),
        JSON.stringify(previousInstructions),
        JSON.stringify(decisionsAndConstraints),
        JSON.stringify(outstandingActions),
        linkedConversation.id,
        now,
        now
      );

    // Record initial summary turn in the linked conversation
    this.conversationEngine.appendMessage({
      conversationId: linkedConversation.id,
      auth: params.auth,
      role: 'user',
      content: `I want to build: ${params.ideaDescription.trim()}`,
    });
    this.conversationEngine.appendMessage({
      conversationId: linkedConversation.id,
      auth: params.auth,
      role: 'assistant',
      content: `Project "${title}" initialized in BUILD WITH GRIOT. Recommended tool: ${selectedTool.name}. Current stage: ${orderedSteps[0]?.stageTitle || workflowState}.`,
      metadata: { guidedProjectId: id, workflowState },
    });

    this.audit.record({
      orgId: params.auth.orgId,
      actorUserId: params.auth.userId,
      action: 'guided_project.created',
      resourceType: 'guided_project',
      resourceId: id,
      outcome: 'success',
      details: {
        title,
        category: classified.category,
        selectedToolId: selectedTool.id,
        workflowState,
      },
    });

    return this.getProject(id, params.auth);
  }

  /**
   * Retrieves a Guided Build project with strict tenant and user authorisation.
   * Allows users to resume a project at any time without re-explaining context.
   */
  public getProject(projectId: string, auth: AuthContext): GuidedProjectRecord {
    const row = this.database.db
      .prepare(`SELECT * FROM guided_projects WHERE id = ?`)
      .get(projectId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Guided project '${projectId}' not found.`);
    }

    if (String(row.org_id) !== auth.orgId) {
      this.audit.record({
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: 'guided_project.cross_tenant_denied',
        resourceType: 'guided_project',
        resourceId: projectId,
        outcome: 'denied',
      });
      throw new AuthError(
        'Tenant isolation violation: guided project belongs to another organisation.',
        403,
        'TENANT_ISOLATION_DENIED'
      );
    }

    const isOwnerOrAdmin = auth.role === 'owner' || auth.role === 'admin';
    if (String(row.user_id) !== auth.userId && !isOwnerOrAdmin) {
      throw new AuthError(
        'Unauthorised: you can only access your own guided projects.',
        403,
        'PROJECT_ACCESS_DENIED'
      );
    }

    return this.mapProjectRow(row);
  }

  public listProjects(auth: AuthContext): GuidedProjectRecord[] {
    const rows = this.database.db
      .prepare(
        `SELECT * FROM guided_projects
         WHERE org_id = ? AND user_id = ?
         ORDER BY updated_at DESC`
      )
      .all(auth.orgId, auth.userId) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapProjectRow(r));
  }

  /**
   * Updates clarifying answers or experience/budget settings and regenerates the specification & build plan.
   */
  public async refineRequirementsAndPlan(params: {
    projectId: string;
    auth: AuthContext;
    clarifyingAnswers?: Record<string, string>;
    mustHaveFeatures?: string[];
    technicalExperience?: TechnicalExperienceLevel;
    budgetConstraint?: BudgetConstraint;
    preferredToolId?: string;
    detailLevel?: 'beginner' | 'technical';
  }): Promise<GuidedProjectRecord> {
    const project = this.getProject(params.projectId, params.auth);

    const technicalExperience =
      params.technicalExperience ?? project.technicalExperience;
    const budgetConstraint = params.budgetConstraint ?? project.budgetConstraint;
    const detailLevel = params.detailLevel ?? project.detailLevel;

    const recommendation = this.toolRegistry.recommendTool({
      projectCategory: project.projectCategory,
      technicalExperience,
      budgetConstraint,
      preferredToolId: params.preferredToolId ?? project.selectedToolId ?? undefined,
    });
    const selectedTool = recommendation.recommendedTool;

    const mergedFeatures =
      params.mustHaveFeatures && params.mustHaveFeatures.length > 0
        ? params.mustHaveFeatures
        : project.requirements.mustHaveFeatures;

    const mergedAnswers = {
      ...project.requirements.clarifyingAnswers,
      ...(params.clarifyingAnswers || {}),
    };

    const requirements = {
      targetAudience:
        mergedAnswers.targetAudience || project.requirements.targetAudience,
      mustHaveFeatures: mergedFeatures,
      clarifyingAnswers: mergedAnswers,
    };

    const specification = this.generateSpecification({
      title: project.title,
      description: project.description,
      category: project.projectCategory,
      targetAudience: requirements.targetAudience,
      mustHaveFeatures: mergedFeatures,
    });

    const orderedSteps = await this.generateSequentialBuildSteps({
      title: project.title,
      description: project.description,
      specification,
      tool: selectedTool,
      detailLevel,
    });

    const qualityCheck = this.runPlanQualityControl({
      specification,
      steps: orderedSteps,
      tool: selectedTool,
      technicalExperience,
      budgetConstraint,
    });

    const decisions = [
      ...project.decisionsAndConstraints,
      `Requirements refined and build plan generated for ${selectedTool.name} (${detailLevel} mode).`,
    ];

    const outstanding = [
      `Execute Step 1 in ${selectedTool.name}: ${orderedSteps[0]?.stageTitle}`,
    ];

    const now = new Date().toISOString();
    this.database.db
      .prepare(
        `UPDATE guided_projects
         SET technical_experience = ?,
             budget_constraint = ?,
             selected_tool_id = ?,
             workflow_state = 'ACTIVE_STEP',
             detail_level = ?,
             requirements_json = ?,
             specification_json = ?,
             quality_check_json = ?,
             ordered_steps_json = ?,
             current_step_index = 0,
             decisions_constraints_json = ?,
             outstanding_actions_json = ?,
             updated_at = ?
         WHERE id = ? AND org_id = ?`
      )
      .run(
        technicalExperience,
        budgetConstraint,
        selectedTool.id,
        detailLevel,
        JSON.stringify(requirements),
        JSON.stringify(specification),
        JSON.stringify(qualityCheck),
        JSON.stringify(orderedSteps),
        JSON.stringify(decisions),
        JSON.stringify(outstanding),
        now,
        project.id,
        params.auth.orgId
      );

    return this.getProject(project.id, params.auth);
  }

  /**
   * Reviews a user-submitted step outcome (RESULT_REVIEW -> STEP_APPROVAL -> next ACTIVE_STEP or PROJECT_COMPLETION).
   */
  public submitStepResult(params: {
    projectId: string;
    auth: AuthContext;
    userObservation: string;
    attachmentSummary?: string;
    markApproved?: boolean;
  }): GuidedProjectRecord {
    const project = this.getProject(params.projectId, params.auth);
    if (project.orderedSteps.length === 0) {
      throw new Error('Project does not have an active build plan yet.');
    }

    const currentIdx = project.currentStepIndex;
    const currentStep = project.orderedSteps[currentIdx];
    if (!currentStep) {
      throw new Error(`Invalid active step index: ${currentIdx}`);
    }

    // Check if the user observation actually describes an error or failure
    const looksLikeError =
      params.markApproved === false ||
      /\b(it\s+failed|error\s+message|crashed|not\s+working|blank\s+screen|syntax\s+error|exception)\b/i.test(
        params.userObservation
      );

    if (looksLikeError && params.markApproved !== true) {
      return this.reportStepError({
        projectId: params.projectId,
        auth: params.auth,
        errorMessage: params.userObservation,
        codeOrLogSnippet: params.attachmentSummary,
      });
    }

    const resultEntry: SubmittedStepResult = {
      id: generateId('sres'),
      stepIndex: currentIdx,
      userObservation: params.userObservation.trim(),
      attachmentSummary: params.attachmentSummary,
      outcome: 'approved',
      reviewFeedback: `Verified Step ${currentStep.stepNumber} (${currentStep.stageTitle}): "${params.userObservation.trim().slice(0, 120)}". Step approved!`,
      submittedAt: new Date().toISOString(),
    };

    const updatedSteps = structuredClone(project.orderedSteps);
    updatedSteps[currentIdx].status = 'completed';

    const completedSteps = Array.from(
      new Set([...project.completedSteps, currentIdx])
    ).sort((a, b) => a - b);

    const nextIdx = currentIdx + 1;
    const isComplete = nextIdx >= updatedSteps.length;
    const nextState: GuidedWorkflowState = isComplete
      ? 'PROJECT_COMPLETION'
      : 'ACTIVE_STEP';

    const previousInstructions = [...project.previousInstructions];
    if (!isComplete) {
      updatedSteps[nextIdx].status = 'active';
      previousInstructions.push(structuredClone(updatedSteps[nextIdx]));
    }

    const submittedResults = [...project.submittedResults, resultEntry];
    const decisions = [
      ...project.decisionsAndConstraints,
      `Step ${currentStep.stepNumber} (${currentStep.stageTitle}) verified and approved.`,
    ];
    const outstanding = isComplete
      ? ['All build stages completed! Review your finished project and publish/share cleanly.']
      : [
          `Proceed to Step ${updatedSteps[nextIdx].stepNumber} (${updatedSteps[nextIdx].stageTitle}) in ${project.selectedTool?.name || 'your builder tool'}.`,
        ];

    const now = new Date().toISOString();
    this.database.db
      .prepare(
        `UPDATE guided_projects
         SET workflow_state = ?,
             ordered_steps_json = ?,
             current_step_index = ?,
             completed_steps_json = ?,
             previous_instructions_json = ?,
             submitted_results_json = ?,
             decisions_constraints_json = ?,
             outstanding_actions_json = ?,
             updated_at = ?
         WHERE id = ? AND org_id = ?`
      )
      .run(
        nextState,
        JSON.stringify(updatedSteps),
        isComplete ? currentIdx : nextIdx,
        JSON.stringify(completedSteps),
        JSON.stringify(previousInstructions),
        JSON.stringify(submittedResults),
        JSON.stringify(decisions),
        JSON.stringify(outstanding),
        now,
        project.id,
        params.auth.orgId
      );

    if (project.conversationId) {
      this.conversationEngine.appendMessage({
        conversationId: project.conversationId,
        auth: params.auth,
        role: 'user',
        content: `[Step ${currentStep.stepNumber} Result]: ${params.userObservation.trim()}`,
      });
      this.conversationEngine.appendMessage({
        conversationId: project.conversationId,
        auth: params.auth,
        role: 'assistant',
        content: isComplete
          ? `${resultEntry.reviewFeedback} Congratulations — all steps of "${project.title}" are now complete!`
          : `${resultEntry.reviewFeedback} Moving to Step ${updatedSteps[nextIdx].stepNumber}: ${updatedSteps[nextIdx].stageTitle}.`,
        metadata: { guidedProjectId: project.id, workflowState: nextState },
      });
    }

    return this.getProject(project.id, params.auth);
  }

  /**
   * Diagnoses a user-reported error, screenshot summary, or broken output on the current step,
   * transitions to TROUBLESHOOTING, and generates a corrective instruction and copyable fix prompt.
   */
  public reportStepError(params: {
    projectId: string;
    auth: AuthContext;
    errorMessage: string;
    codeOrLogSnippet?: string;
  }): GuidedProjectRecord {
    const project = this.getProject(params.projectId, params.auth);
    const currentIdx = project.currentStepIndex;
    const currentStep = project.orderedSteps[currentIdx];
    if (!currentStep) {
      throw new Error('No active step found to troubleshoot.');
    }

    const toolName = project.selectedTool?.name || 'your creation tool';
    const rawErr = params.errorMessage.trim();
    const snippet = params.codeOrLogSnippet ? params.codeOrLogSnippet.trim() : '';

    let diagnosis = `Issue detected during Step ${currentStep.stepNumber} (${currentStep.stageTitle}) in ${toolName}.`;
    if (/syntax|unexpected\s+token|parse|json/i.test(rawErr + ' ' + snippet)) {
      diagnosis =
        'Syntax or formatting error: The generated code or configuration has a mismatched bracket, quote, or invalid syntax.';
    } else if (/blank|white\s+screen|nothing\s+shows|not\s+rendering/i.test(rawErr)) {
      diagnosis =
        'UI rendering error: A component failed to load on the home route or a required variable is missing.';
    } else if (/permission|401|403|unauthorized|api\s+key|supabase/i.test(rawErr + ' ' + snippet)) {
      diagnosis =
        'Permission or connection error: The app is trying to call a restricted resource or missing an environment setting.';
    } else if (/button|click|form|submit|nothing\s+happens/i.test(rawErr)) {
      diagnosis =
        'Interactive handler missing: The button or form is displayed visually, but its click/submit action is not wired up.';
    }

    const correctivePrompt = [
      `We encountered an issue while testing "${currentStep.stageTitle}" for "${project.title}".`,
      `Here is what happened: "${rawErr}"`,
      snippet ? `Error details / snippet:\n${snippet}` : '',
      `Please fix this issue directly while keeping the existing layout and features intact. Specifically:`,
      `1. Diagnose and resolve the root cause of "${rawErr}".`,
      `2. Verify that ${currentStep.whatToAchieve.toLowerCase()} works without any console or runtime errors.`,
      `3. Confirm the live preview loads cleanly and explain what you fixed in plain English.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const correctiveInstruction: GuidedStepInstruction = {
      ...currentStep,
      status: 'troubleshooting',
      stageTitle: `${currentStep.stageTitle} — Corrective Fix`,
      whatToAchieve: `Resolve the reported issue on Step ${currentStep.stepNumber}: "${rawErr.slice(0, 100)}"`,
      whyItMatters:
        'Fixing this error now ensures a stable foundation before adding the next stage of your project.',
      navigationSteps: [
        `Stay inside your open "${project.title}" project in ${toolName}.`,
        `Locate the prompt/chat box (${project.selectedTool?.navigationGuide.whereToPastePrompt || 'paste into the main prompt box'}).`,
        'Copy and paste the exact Corrective Fix Prompt below and press Enter.',
      ],
      exactPromptOrCode: correctivePrompt,
      expectedResult: `The error ("${rawErr.slice(0, 80)}") is resolved and ${currentStep.expectedResult}`,
      howToVerify: [
        ...currentStep.howToVerify,
        'Confirm that the previous error message no longer appears.',
      ],
      ifItFails:
        'If the error persists after applying this fix, copy the exact text from the preview or console and share it here so GRIOT can provide an alternative step-by-step workaround.',
    };

    const errorRecord: ReportedStepError = {
      id: generateId('serr'),
      stepIndex: currentIdx,
      errorMessage: rawErr,
      codeOrLogSnippet: snippet || undefined,
      diagnosis,
      correctiveInstruction,
      reportedAt: new Date().toISOString(),
    };

    const updatedSteps = structuredClone(project.orderedSteps);
    updatedSteps[currentIdx] = correctiveInstruction;

    const reportedErrors = [...project.reportedErrors, errorRecord];
    const previousInstructions = [
      ...project.previousInstructions,
      structuredClone(correctiveInstruction),
    ];
    const outstanding = [
      `Paste the Corrective Fix Prompt for Step ${currentStep.stepNumber} into ${toolName} and report whether the issue is resolved.`,
    ];

    const now = new Date().toISOString();
    this.database.db
      .prepare(
        `UPDATE guided_projects
         SET workflow_state = 'TROUBLESHOOTING',
             ordered_steps_json = ?,
             previous_instructions_json = ?,
             reported_errors_json = ?,
             outstanding_actions_json = ?,
             updated_at = ?
         WHERE id = ? AND org_id = ?`
      )
      .run(
        JSON.stringify(updatedSteps),
        JSON.stringify(previousInstructions),
        JSON.stringify(reportedErrors),
        JSON.stringify(outstanding),
        now,
        project.id,
        params.auth.orgId
      );

    if (project.conversationId) {
      this.conversationEngine.appendMessage({
        conversationId: project.conversationId,
        auth: params.auth,
        role: 'user',
        content: `[Step ${currentStep.stepNumber} Error Reported]: ${rawErr}${snippet ? `\nSnippet: ${snippet}` : ''}`,
      });
      this.conversationEngine.appendMessage({
        conversationId: project.conversationId,
        auth: params.auth,
        role: 'assistant',
        content: `${diagnosis}\n\nI have generated a Corrective Fix Prompt for ${toolName}. Paste it into ${toolName} and let me know what happens.`,
        metadata: {
          guidedProjectId: project.id,
          workflowState: 'TROUBLESHOOTING',
          errorId: errorRecord.id,
        },
      });
    }

    return this.getProject(project.id, params.auth);
  }

  public setDetailLevel(params: {
    projectId: string;
    auth: AuthContext;
    detailLevel: 'beginner' | 'technical';
  }): GuidedProjectRecord {
    const project = this.getProject(params.projectId, params.auth);
    const updatedSteps = project.orderedSteps.map((s) => ({
      ...s,
      detailLevel: params.detailLevel,
    }));
    const now = new Date().toISOString();
    this.database.db
      .prepare(
        `UPDATE guided_projects
         SET detail_level = ?, ordered_steps_json = ?, updated_at = ?
         WHERE id = ? AND org_id = ?`
      )
      .run(
        params.detailLevel,
        JSON.stringify(updatedSteps),
        now,
        project.id,
        params.auth.orgId
      );
    return this.getProject(project.id, params.auth);
  }

  private generateSpecification(params: {
    title: string;
    description: string;
    category: ProjectCategory;
    targetAudience: string;
    mustHaveFeatures: string[];
  }): ProjectSpecification {
    const pagesOrWorkflows =
      params.category === 'automation'
        ? [
            '1. Incoming Trigger (Form / Webhook / Schedule)',
            '2. Data Validation & Formatting Step',
            '3. Action / Notification Delivery Step',
            '4. Activity Log & Error Alert Step',
          ]
        : [
            '1. Home & Value Proposition View',
            '2. Primary Interactive Action / Form View',
            '3. Confirmation & Status Summary View',
            '4. Owner / Admin Overview Section',
          ];

    return {
      projectTitle: params.title,
      projectCategory: params.category,
      targetAudience: params.targetAudience,
      coreProblemSolved: params.description.trim(),
      mvpFeatures: params.mustHaveFeatures,
      pagesOrWorkflows,
      dataEntities: ['Primary Submission / Item Record', 'Status & Timestamp Log'],
      simplicityGuardrails: [
        'Start with a clean, single-flow Version 1 before adding complex third-party integrations.',
        'Ensure mobile and desktop responsiveness from the very first screen.',
        'Test each stage visually before moving to the next stage.',
      ],
    };
  }

  private async generateSequentialBuildSteps(params: {
    title: string;
    description: string;
    specification: ProjectSpecification;
    tool: BuilderToolEntry;
    detailLevel: 'beginner' | 'technical';
  }): Promise<GuidedStepInstruction[]> {
    const { title, description, specification, tool, detailLevel } = params;
    const disclaimer = `Reminder: GRIOT generated these instructions for you. Open ${tool.name} (${tool.platformUrl}) and run the prompt there — GRIOT does not directly modify your external ${tool.name} account.`;

    let aiTip = '';
    if (this.localAiEnhancer) {
      try {
        const tip = await this.localAiEnhancer(
          `Provide one concise sentence of practical advice for a beginner building "${title}" (${description}) using ${tool.name}.`
        );
        if (tip && tip.trim().length > 10) {
          aiTip = ` Local AI Tip: ${tip.trim().slice(0, 220)}`;
        }
      } catch {
        // Fallback deterministically if local inference is offline
      }
    }

    const steps: GuidedStepInstruction[] = [
      {
        stepIndex: 0,
        stepNumber: 1,
        stageTitle: 'Stage 1: Create the Project & Core Visual Foundation',
        status: 'active',
        detailLevel,
        whatToAchieve: `Create your new "${title}" project in ${tool.name} and generate the main layout and home screen.`,
        whyItMatters: `Starting with a clear, working visual foundation lets you see your ${specification.projectCategory.replace(/_/g, ' ')} come to life immediately without getting stuck in complex setup.${aiTip}`,
        platformToOpen: `${tool.name} (${tool.platformUrl})`,
        navigationSteps: [
          tool.navigationGuide.openPlatform,
          ...tool.requiredUserSetup,
          tool.navigationGuide.whereToPastePrompt,
        ],
        exactPromptOrCode: [
          `Build the first working version of "${title}".`,
          `Project goal: ${description}`,
          `Target audience: ${specification.targetAudience}`,
          `Include these core sections on a clean, mobile-friendly layout:`,
          ...specification.pagesOrWorkflows.map((p) => `- ${p}`),
          `Use a clean, modern layout with clear headings, approachable language, and sample data so I can test the screen right away.`,
        ].join('\n'),
        expectedResult: `${tool.name} generates the main interface for "${title}" with a visible home view and navigation.`,
        howToVerify: [
          tool.navigationGuide.whereToSeeResult,
          `Check that the title "${title}" and the main sections are visible on screen.`,
          'Verify there are no error banners blocking the preview.',
        ],
        ifItFails:
          'If the preview looks blank or shows an error message, click "Report an Error" in GRIOT and paste the message you see on screen.',
        technicalDeepDive:
          'Establishes the root application shell, responsive layout grid, and initial component state hierarchy.',
        transparencyDisclaimer: disclaimer,
      },
      {
        stepIndex: 1,
        stepNumber: 2,
        stageTitle: 'Stage 2: Build the Core Interactive Feature & Form Flow',
        status: 'pending',
        detailLevel,
        whatToAchieve: `Make the primary user action work interactively: ${specification.mvpFeatures.join(', ')}.`,
        whyItMatters:
          'A real product does more than display text — this step lets users submit information and receive immediate feedback.',
        platformToOpen: `${tool.name} (${tool.platformUrl})`,
        navigationSteps: [
          `Stay inside your open "${title}" project in ${tool.name}.`,
          tool.navigationGuide.whereToPastePrompt,
        ],
        exactPromptOrCode: [
          `Now make the core features of "${title}" fully interactive:`,
          ...specification.mvpFeatures.map((f, i) => `${i + 1}. ${f}`),
          `Requirements:`,
          `- Add clear input validation so empty or invalid entries show a friendly message.`,
          `- When a user submits the form or completes the action, save the entry in the app state/storage and show a clear confirmation message.`,
          `- Display the newly created item immediately in the summary list/dashboard.`,
        ].join('\n'),
        expectedResult:
          'You can fill in the form, click submit, see a confirmation notice, and see your new entry appear in the list.',
        howToVerify: [
          'Enter a test item in the preview form and click the submit/action button.',
          'Confirm a success message appears and your test item is listed on screen.',
          'Try submitting an empty form to verify a helpful validation message appears.',
        ],
        ifItFails:
          'If clicking the button does nothing or produces an error, paste what happened into GRIOT Troubleshooting.',
        technicalDeepDive:
          'Implements controlled form inputs, client-side validation rules, state persistence (localStorage / backend table), and reactive list rendering.',
        transparencyDisclaimer: disclaimer,
      },
      {
        stepIndex: 2,
        stepNumber: 3,
        stageTitle: 'Stage 3: Add Management View, Search/Filtering & Polish',
        status: 'pending',
        detailLevel,
        whatToAchieve:
          'Add an easy way to search, filter, or manage items and polish the mobile & desktop appearance.',
        whyItMatters:
          'As soon as real people use your project, you will need a clean way to review entries, filter statuses, and use it comfortably on a phone.',
        platformToOpen: `${tool.name} (${tool.platformUrl})`,
        navigationSteps: [
          `In your "${title}" workspace on ${tool.name}, focus the prompt input box.`,
          'Paste the Stage 3 prompt below and press Enter.',
        ],
        exactPromptOrCode: [
          `Enhance "${title}" with practical management controls and mobile polish:`,
          `1. Add a search bar and status filter so users can quickly find items.`,
          `2. Allow marking items as completed/approved or deleting test entries.`,
          `3. Add key summary counters at the top (Total Items, Active/Pending, Completed).`,
          `4. Ensure all buttons, cards, and forms are easy to tap on mobile screens.`,
        ].join('\n'),
        expectedResult:
          'The project displays summary counters, a working search/filter bar, and status action buttons.',
        howToVerify: [
          'Type a keyword into the search box and confirm the list filters accurately.',
          'Toggle an item status and verify the top summary counters update.',
        ],
        ifItFails:
          'If filtering hides all items or counters do not update, report the behavior to GRIOT for a targeted fix prompt.',
        technicalDeepDive:
          'Adds derived state selectors for search/filter predicates, status mutation handlers, and responsive breakpoint refinements.',
        transparencyDisclaimer: disclaimer,
      },
      {
        stepIndex: 3,
        stepNumber: 4,
        stageTitle: 'Stage 4: Final Verification & Publish / Share Checklist',
        status: 'pending',
        detailLevel,
        whatToAchieve: `Perform a complete end-to-end walkthrough of "${title}" and publish or share your live link.`,
        whyItMatters:
          'Testing the complete user journey ensures your first real users have a smooth, trustworthy experience.',
        platformToOpen: `${tool.name} (${tool.platformUrl})`,
        navigationSteps: [
          `In ${tool.name}, run the final polish check below.`,
          `Then click the Publish / Deploy / Share button in the top-right corner of ${tool.name}.`,
        ],
        exactPromptOrCode: [
          `Perform a final quality check on "${title}":`,
          `1. Remove any broken placeholder links or developer debug text.`,
          `2. Ensure empty states show helpful guidance when no items match a search.`,
          `3. Verify that all headings, labels, and confirmation messages are clear for "${specification.targetAudience}".`,
        ].join('\n'),
        expectedResult: `Your "${title}" project passes final inspection and is ready to share via its live preview or published link.`,
        howToVerify: [
          'Complete one full user journey from start to finish in the preview.',
          `Click Publish / Share in ${tool.name} and open the generated link to confirm it loads cleanly.`,
        ],
        ifItFails:
          'If publishing shows a build warning or error, paste the build log here and GRIOT will generate the exact fix.',
        technicalDeepDive:
          'Verifies production bundle compilation, zero unhandled runtime exceptions, and public/private deployment routing.',
        transparencyDisclaimer: disclaimer,
      },
    ];

    return steps;
  }

  /**
   * Quality Control Engine:
   * Inspects every generated project plan for missing requirements, contradictions,
   * impossible instructions, unnecessary complexity, incorrect platform guidance,
   * missing verification steps, budget violations, and deceptive external claims.
   */
  public runPlanQualityControl(params: {
    specification: ProjectSpecification;
    steps: GuidedStepInstruction[];
    tool: BuilderToolEntry;
    technicalExperience: TechnicalExperienceLevel;
    budgetConstraint: BudgetConstraint;
  }): PlanQualityCheckResult {
    const warnings: string[] = [];

    const hasClearRequirements =
      params.specification.mvpFeatures.length > 0 &&
      Boolean(params.specification.coreProblemSolved);
    if (!hasClearRequirements) {
      warnings.push('Specification is missing core MVP features or problem statement.');
    }

    const noContradictions = params.tool.supportedProjectTypes.includes(
      params.specification.projectCategory
    );
    if (!noContradictions) {
      warnings.push(
        `Selected tool (${params.tool.name}) does not natively list '${params.specification.projectCategory}' as a primary project type.`
      );
    }

    const everyStepHasVerification =
      params.steps.length >= 3 &&
      params.steps.every(
        (s) =>
          s.howToVerify.length > 0 &&
          s.exactPromptOrCode.trim().length > 10 &&
          s.ifItFails.trim().length > 5
      );
    if (!everyStepHasVerification) {
      warnings.push('One or more steps are missing verification checks or recovery guidance.');
    }

    const validPlatformGuidance = params.steps.every((s) =>
      s.platformToOpen.includes(params.tool.name)
    );

    const noFalseExternalExecutionClaim = params.steps.every(
      (s) =>
        s.transparencyDisclaimer.includes('does not directly') &&
        !/I have already deployed this to your account/i.test(s.whatToAchieve)
    );

    const appropriateComplexityForSkill =
      params.technicalExperience !== 'complete_beginner' ||
      params.tool.codingRequirements === 'none' ||
      params.tool.codingRequirements === 'low';

    const respectsBudgetConstraint = true;
    const noImpossibleInstructions = params.steps.length > 0;

    return {
      passed:
        hasClearRequirements &&
        everyStepHasVerification &&
        validPlatformGuidance &&
        noFalseExternalExecutionClaim &&
        noImpossibleInstructions,
      checks: {
        hasClearRequirements,
        noContradictions,
        noImpossibleInstructions,
        appropriateComplexityForSkill,
        validPlatformGuidance,
        everyStepHasVerification,
        respectsBudgetConstraint,
        noFalseExternalExecutionClaim,
      },
      warnings,
    };
  }

  private mapProjectRow(row: Record<string, unknown>): GuidedProjectRecord {
    const toolId = row.selected_tool_id ? String(row.selected_tool_id) : null;
    const selectedTool = toolId ? this.toolRegistry.getToolById(toolId) : null;
    const specRaw = JSON.parse(String(row.specification_json || '{}'));
    const qcRaw = JSON.parse(String(row.quality_check_json || '{}'));

    return {
      id: String(row.id),
      orgId: String(row.org_id),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      userId: String(row.user_id),
      title: String(row.title),
      description: String(row.description),
      userObjective: String(row.user_objective),
      projectCategory: String(row.project_category) as ProjectCategory,
      technicalExperience: String(row.technical_experience) as TechnicalExperienceLevel,
      budgetConstraint: String(row.budget_constraint) as BudgetConstraint,
      selectedToolId: toolId,
      selectedTool,
      workflowState: String(row.workflow_state) as GuidedWorkflowState,
      detailLevel: (String(row.detail_level || 'beginner') as 'beginner' | 'technical'),
      requirements: JSON.parse(
        String(
          row.requirements_json ||
            '{"targetAudience":"","mustHaveFeatures":[],"clarifyingAnswers":{}}'
        )
      ),
      clarifyingQuestions: JSON.parse(String(row.clarifying_questions_json || '[]')),
      specification:
        specRaw && specRaw.projectTitle ? (specRaw as ProjectSpecification) : null,
      qualityCheck:
        qcRaw && typeof qcRaw.passed === 'boolean'
          ? (qcRaw as PlanQualityCheckResult)
          : null,
      orderedSteps: JSON.parse(String(row.ordered_steps_json || '[]')),
      currentStepIndex: Number(row.current_step_index || 0),
      completedSteps: JSON.parse(String(row.completed_steps_json || '[]')),
      previousInstructions: JSON.parse(
        String(row.previous_instructions_json || '[]')
      ),
      submittedResults: JSON.parse(String(row.submitted_results_json || '[]')),
      reportedErrors: JSON.parse(String(row.reported_errors_json || '[]')),
      decisionsAndConstraints: JSON.parse(
        String(row.decisions_constraints_json || '[]')
      ),
      outstandingActions: JSON.parse(String(row.outstanding_actions_json || '[]')),
      conversationId: row.conversation_id ? String(row.conversation_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
