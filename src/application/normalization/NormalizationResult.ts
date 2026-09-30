import {
  ProjectModel,
  ProjectModelInput,
} from "../../domain/project/ProjectModel.js";

export interface NormalizationResult {
  readonly original: Readonly<ProjectModelInput>;
  readonly model: Readonly<ProjectModel>;
}
