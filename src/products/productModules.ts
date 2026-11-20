// ============================================================================
// GRIOT AI — MODULAR PRODUCT EXPANSION BOUNDARIES
// Prepares shared intelligence boundaries for all 6 GRIOT products without
// requiring a new AI backend for each application:
// 1. GRIOT Chat
// 2. GRIOT Learn (Entrepreneurship, Financial Education, Engineering, Technology, Personal Development)
// 3. GRIOT Business
// 4. GRIOT Develop
// 5. GRIOT API
// 6. GRIOT Agents
// Supports Locked Dual Branding:
// - Standalone: "GRIOT"
// - Corporate/Ecosystem/Institutional: "GRIOT powered by Avantage"
// ============================================================================

import type {
  BrandingMode,
  GriotProductModuleId,
  PermissionScope,
  RoutingHints,
} from '../types/domain.ts';

export interface GriotProductModuleBoundary {
  id: GriotProductModuleId;
  name: string;
  standaloneBrand: string;
  ecosystemBrand: string;
  missionSummary: string;
  educationalDomains?: string[];
  defaultSystemInstruction: string;
  defaultRoutingHints: RoutingHints;
  requiredScopes: PermissionScope[];
}

export const GRIOT_PRODUCT_MODULES: Record<
  GriotProductModuleId,
  GriotProductModuleBoundary
> = {
  griot_chat: {
    id: 'griot_chat',
    name: 'GRIOT Chat',
    standaloneBrand: 'GRIOT Chat',
    ecosystemBrand: 'GRIOT Chat — powered by Avantage',
    missionSummary:
      'Accessible, fast, everyday conversational AI assistant for individuals and teams across Africa and globally.',
    defaultSystemInstruction:
      'You are GRIOT, a clear, accurate, and helpful AI assistant. Provide well-structured, practical answers.',
    defaultRoutingHints: {},
    requiredScopes: ['chat:write'],
  },
  griot_learn: {
    id: 'griot_learn',
    name: 'GRIOT Learn',
    standaloneBrand: 'GRIOT Learn',
    ecosystemBrand: 'GRIOT Learn — powered by Avantage',
    missionSummary:
      'Educational intelligence helping builders and professionals master entrepreneurship, financial education, engineering, technology, and personal development.',
    educationalDomains: [
      'entrepreneurship',
      'financial_education',
      'engineering',
      'technology',
      'personal_development',
    ],
    defaultSystemInstruction:
      'You are GRIOT Learn, an educational mentor dedicated to helping builders and professionals master entrepreneurship, financial education, engineering, technology, and personal development. Break down complex concepts clearly, provide actionable examples relevant to African and global builders, and encourage mastery.',
    defaultRoutingHints: {
      reasoningComplexity: 'medium',
    },
    requiredScopes: ['chat:write'],
  },
  griot_business: {
    id: 'griot_business',
    name: 'GRIOT Business',
    standaloneBrand: 'GRIOT Business',
    ecosystemBrand: 'GRIOT Business — powered by Avantage',
    missionSummary:
      'Operational intelligence, document analysis, and permission-aware organisational knowledge retrieval for Avantage Group companies and enterprises.',
    defaultSystemInstruction:
      'You are GRIOT Business, an enterprise intelligence engine. Ground answers in verified organisational knowledge and documents, cite sources accurately, and maintain strict professional rigor.',
    defaultRoutingHints: {
      reasoningComplexity: 'medium',
    },
    requiredScopes: ['chat:write'],
  },
  griot_develop: {
    id: 'griot_develop',
    name: 'GRIOT Develop',
    standaloneBrand: 'GRIOT Develop',
    ecosystemBrand: 'GRIOT Develop — powered by Avantage',
    missionSummary:
      'Software engineering, architecture design, code generation, debugging, and technical analysis engine.',
    defaultSystemInstruction:
      'You are GRIOT Develop, a principal software engineering assistant. Write clean, secure, production-grade code and explain architectural trade-offs concisely.',
    defaultRoutingHints: {
      taskOverride: 'coding',
      reasoningComplexity: 'medium',
    },
    requiredScopes: ['chat:write'],
  },
  griot_api: {
    id: 'griot_api',
    name: 'GRIOT API',
    standaloneBrand: 'GRIOT API',
    ecosystemBrand: 'GRIOT API — powered by Avantage',
    missionSummary:
      'Unified multi-provider AI gateway and usage billing infrastructure for third-party developers and digital ventures.',
    defaultSystemInstruction: '',
    defaultRoutingHints: {},
    requiredScopes: ['chat:write'],
  },
  griot_agents: {
    id: 'griot_agents',
    name: 'GRIOT Agents',
    standaloneBrand: 'GRIOT Agents',
    ecosystemBrand: 'GRIOT Agents — powered by Avantage',
    missionSummary:
      'Governed autonomous multi-step agent execution with strict tool-call authorisation and cost controls.',
    defaultSystemInstruction:
      'You are a GRIOT Autonomous Agent. Plan systematically, invoke only authorised tools with validated arguments, and report verifiable outcomes.',
    defaultRoutingHints: {
      reasoningComplexity: 'high',
    },
    requiredScopes: ['chat:write'],
  },
};

export function getProductModuleBoundary(
  moduleId: GriotProductModuleId = 'griot_chat'
): GriotProductModuleBoundary {
  return GRIOT_PRODUCT_MODULES[moduleId] || GRIOT_PRODUCT_MODULES.griot_chat;
}

export function listProductModules(): GriotProductModuleBoundary[] {
  return Object.values(GRIOT_PRODUCT_MODULES);
}

export function resolveBrandHeader(brandingMode: BrandingMode): {
  platformBrand: 'GRIOT' | 'GRIOT powered by Avantage';
  brandingMode: BrandingMode;
} {
  return {
    platformBrand:
      brandingMode === 'griot_powered_by_avantage'
        ? 'GRIOT powered by Avantage'
        : 'GRIOT',
    brandingMode,
  };
}
