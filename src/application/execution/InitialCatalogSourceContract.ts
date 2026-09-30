import type { ProductCatalog } from "../../domain/catalog/ProductCatalog.js";
import type { TechnicalSource } from "../../domain/catalog/TechnicalProduct.js";

export type InitialCatalogSource =
  | {
      readonly status: "AVAILABLE";
      readonly catalog: Readonly<ProductCatalog>;
      readonly catalogVersion: string;
      readonly technicalSource: Readonly<TechnicalSource>;
    }
  | {
      readonly status: "ABSENT";
    }
  | {
      readonly status: "BLOCKED";
      readonly issue: string;
    };

export class InitialCatalogSourceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InitialCatalogSourceError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function readTechnicalSource(
  value: unknown,
): TechnicalSource {
  if (!isPlainRecord(value)) {
    throw new InitialCatalogSourceError(
      "technicalSource is required for an available catalog",
    );
  }

  for (const fieldName of [
    "sourceName",
    "documentReference",
    "sourceUrl",
    "version",
    "checkedAt",
  ] as const) {
    if (!isNonEmptyString(value[fieldName])) {
      throw new InitialCatalogSourceError(
        `technicalSource.${fieldName} must be a non-empty string`,
      );
    }
  }

  return {
    sourceName: value.sourceName as string,
    documentReference: value.documentReference as string,
    sourceUrl: value.sourceUrl as string,
    version: value.version as string,
    checkedAt: value.checkedAt as string,
  };
}

function validateTechnicalSource(
  value: unknown,
): Readonly<TechnicalSource> {
  return Object.freeze({ ...readTechnicalSource(value) });
}

function validateTechnicalSourceReference(
  value: unknown,
): Readonly<TechnicalSource> {
  const source = readTechnicalSource(value);

  if (!Object.isFrozen(value)) {
    throw new InitialCatalogSourceError(
      "technicalSource must be frozen before it is authorized as an initial source",
    );
  }

  return value as Readonly<TechnicalSource>;
}

function validateCatalog(
  value: unknown,
): Readonly<ProductCatalog> {
  if (!isPlainRecord(value)) {
    throw new InitialCatalogSourceError(
      "catalog is required for an available catalog",
    );
  }

  if (!isNonEmptyString(value.catalogVersion)) {
    throw new InitialCatalogSourceError(
      "catalog.catalogVersion must be a non-empty string",
    );
  }

  if (
    !Array.isArray(value.products) ||
    !Array.isArray(value.offers) ||
    typeof value.getProduct !== "function" ||
    typeof value.getOffers !== "function" ||
    typeof value.getProductWithOffers !== "function" ||
    typeof value.getProductTraceability !== "function" ||
    typeof value.findSolarPanelCandidates !== "function" ||
    typeof value.findCompatibleDriplineEmitters !== "function"
  ) {
    throw new InitialCatalogSourceError(
      "catalog must be a valid ProductCatalog",
    );
  }

  if (!Object.isFrozen(value)) {
    throw new InitialCatalogSourceError(
      "catalog must be frozen before it is authorized as an initial source",
    );
  }

  return value as unknown as Readonly<ProductCatalog>;
}

export function createInitialCatalogSource(
  input: InitialCatalogSource,
): Readonly<InitialCatalogSource> {
  if (!isPlainRecord(input)) {
    throw new InitialCatalogSourceError("input must be an object");
  }

  if (input.status === "ABSENT") {
    return Object.freeze({ status: "ABSENT" });
  }

  if (input.status === "BLOCKED") {
    if (!isNonEmptyString(input.issue)) {
      throw new InitialCatalogSourceError(
        "issue is required for a blocked catalog",
      );
    }

    return Object.freeze({
      status: "BLOCKED",
      issue: input.issue,
    });
  }

  if (input.status !== "AVAILABLE") {
    throw new InitialCatalogSourceError(
      "status must be AVAILABLE, ABSENT, or BLOCKED",
    );
  }

  const catalog = validateCatalog(input.catalog);

  if (!isNonEmptyString(input.catalogVersion)) {
    throw new InitialCatalogSourceError(
      "catalogVersion is required for an available catalog",
    );
  }

  if (input.catalogVersion !== catalog.catalogVersion) {
    throw new InitialCatalogSourceError(
      "catalogVersion must match catalog.catalogVersion",
    );
  }

  const technicalSource = validateTechnicalSource(input.technicalSource);

  const source = Object.freeze({
    status: "AVAILABLE",
    catalog,
    catalogVersion: input.catalogVersion,
    technicalSource,
  });

  return validateInitialCatalogSource(source);
}

export function validateInitialCatalogSource(
  value: unknown,
): Readonly<InitialCatalogSource> {
  if (!isPlainRecord(value) || !Object.isFrozen(value)) {
    throw new InitialCatalogSourceError(
      "initialCatalogSource must be an authorized frozen source",
    );
  }

  if (value.status === "ABSENT") {
    return value as unknown as Readonly<InitialCatalogSource>;
  }

  if (value.status === "BLOCKED") {
    if (!isNonEmptyString(value.issue)) {
      throw new InitialCatalogSourceError(
        "initialCatalogSource.issue is required when status is BLOCKED",
      );
    }

    return value as unknown as Readonly<InitialCatalogSource>;
  }

  if (value.status !== "AVAILABLE") {
    throw new InitialCatalogSourceError(
      "initialCatalogSource.status is invalid",
    );
  }

  const catalog = validateCatalog(value.catalog);

  if (
    !isNonEmptyString(value.catalogVersion) ||
    value.catalogVersion !== catalog.catalogVersion
  ) {
    throw new InitialCatalogSourceError(
      "initialCatalogSource AVAILABLE catalogVersion is invalid",
    );
  }

  validateTechnicalSourceReference(value.technicalSource);

  return value as unknown as Readonly<InitialCatalogSource>;
}