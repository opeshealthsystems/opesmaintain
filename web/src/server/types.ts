import registry from "@/generated/registry.json";

export interface ValidationError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  errors: ValidationError[];

  constructor(status: number, code: string, message: string, errors: ValidationError[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  static unauthorized(msg = "Sign in to continue"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", msg);
  }

  static forbidden(msg = "Not permitted"): ApiError {
    return new ApiError(403, "FORBIDDEN", msg);
  }

  static notFound(what = "Record"): ApiError {
    return new ApiError(404, "NOT_FOUND", `${what} was not found`);
  }

  static invalid(msg: string, errors: ValidationError[] = []): ApiError {
    return new ApiError(400, "VALIDATION_FAILED", msg, errors);
  }

  static guard(code: string, msg: string): ApiError {
    return new ApiError(422, code, msg);
  }

  static conflict(code: string, msg: string): ApiError {
    return new ApiError(409, code, msg);
  }
}

export interface AccessScope {
  sites: Set<string>;
  assets: Set<string>;
}

export interface Principal {
  userId: string | null;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  customerId: string | null;
  scope: AccessScope | null;
}

export function isRole(p: Principal, ...roles: string[]): boolean {
  return roles.includes(p.role);
}

export function isInternal(p: Principal): boolean {
  return p.role !== "CUSTOMER";
}

export interface FieldDef {
  name: string;
  label: string;
  type: "str" | "text" | "enum" | "ref" | "bool" | "int" | "dec" | "money" | "date" | "datetime";
  ref: string | null;
  options: string[];
  required: boolean;
  list: boolean;
  managed: boolean;
  computed: boolean;
  guarded: boolean;
}

export interface ResourceDef {
  path: string;
  entity: string;
  context: string;
  module: string;
  label: string;
  singular: string;
  icon: string;
  prefix: string | null;
  display: string;
  readonly: boolean;
  writerRoles: string[];
  desc: string;
  fields: FieldDef[];
}

export interface TenantRecord {
  id: string;
  code: string;
  legalName: string;
  country: string;
  timeZone: string;
  currency: string;
  language: string;
  plan: string;
  status: string;
  maxUsers: number;
  maxAssets: number;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityRecord = Record<string, any> & {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export const RESOURCES: ResourceDef[] = registry.resources as ResourceDef[];

export const RESOURCE_BY_PATH = new Map<string, ResourceDef>(
  RESOURCES.map((r) => [r.path, r]),
);

export const FIELD_MAP_BY_PATH = new Map<string, Map<string, FieldDef>>(
  RESOURCES.map((r) => [r.path, new Map(r.fields.map((f) => [f.name, f]))]),
);

export function getResourceDef(path: string): ResourceDef {
  const def = RESOURCE_BY_PATH.get(path);
  if (!def) throw ApiError.notFound(`Resource ${path}`);
  return def;
}

export function hasField(def: ResourceDef, field: string): boolean {
  return FIELD_MAP_BY_PATH.get(def.path)?.has(field) ?? false;
}

export function getField(def: ResourceDef, field: string): FieldDef | undefined {
  return FIELD_MAP_BY_PATH.get(def.path)?.get(field);
}
