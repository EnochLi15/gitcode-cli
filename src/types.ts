export type TargetType = "local" | "url";

export interface RouteSpec {
  path: string;
  source: string;
  kind: "page" | "api";
  method: string;
  name?: string;
}

export interface ApiEndpointSpec {
  method: string;
  path: string;
  source: string;
  name?: string;
}

export interface FormFieldSpec {
  name: string;
  fieldType: string;
  required: boolean;
}

export interface FormSpec {
  action: string;
  method: string;
  source: string;
  fields: FormFieldSpec[];
  name?: string;
}

export interface WebSpec {
  target: string;
  targetType: TargetType;
  name: string;
  baseUrl?: string;
  frameworks: string[];
  packageScripts: Record<string, string>;
  routes: RouteSpec[];
  apiEndpoints: ApiEndpointSpec[];
  forms: FormSpec[];
  openapiFiles: string[];
  notes: string[];
}

