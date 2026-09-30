import { Project } from "./Project.js";

export interface ProjectRepository {
  save(project: Readonly<Project>): Promise<void>;
  findById(projectId: string): Promise<Readonly<Project> | undefined>;
}
