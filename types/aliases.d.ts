import type {
  AliasPlanReport,
  AliasScope,
  CorpusSnapshot,
  PackIndexLike,
  PackMapLike,
  TruesightNamesApi
} from "../../truesight/types/api-v1.d.ts";

export type {
  AliasPlan,
  AliasScope,
  CorpusItemMetadata,
  CorpusSnapshot,
  NameEvidenceEntry,
  NamePair,
  PackIndexLike,
  PackMapLike,
  RulesEdition,
  SourceErrorReport,
  TruesightNamesApi
} from "../../truesight/types/api-v1.d.ts";

export interface LookupFallbackOptions {
  compendiumUtils: any;
  source: string;
  resolve: (item: any, options: any) => string | null;
  isActive?: () => boolean;
  onError?: (error: unknown) => void;
  getSourceOrder?: () => string[];
  getAppliedSource?: (item: any) => string | undefined;
}

export interface ProviderDescriptor {
  id: string;
  source: string;
  lookupMethod: string;
  modeSetting: string;
  catalogNames: (corpus: CorpusSnapshot, mode: number, scope: AliasScope) => Set<string>;
}

export interface AdapterReport {
  provider: string;
  status: string;
  grouping?: string;
  scopes?: Array<AliasPlanReport & { mode: number }>;
  source?: string | null;
  detail?: string;
}

export interface AdapterApi {
  report: AdapterReport;
  refresh?: (options?: Record<string, unknown>) => Promise<AdapterReport>;
  stop?: () => void;
  lastLookupError?: { status: string; detail: string };
}

export interface ActivateProviderOptions {
  provider: ProviderDescriptor;
  core: TruesightNamesApi;
  cpr: any;
  loadCorpus: () => Promise<CorpusSnapshot>;
  isActive?: () => boolean;
}

export type MiscPackFolderIndex = Map<string, Map<string, string>>;

export interface MiscCatalogContext {
  folders?: MiscPackFolderIndex;
  automations?: Record<string, Record<string, { factory?: unknown } | undefined> | undefined>;
}
