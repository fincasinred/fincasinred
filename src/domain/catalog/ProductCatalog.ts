import {
  CommercialOffer,
  createCommercialOffer,
} from "./CommercialOffer.js";
import {
  TechnicalDriplineEmitterProduct,
  TechnicalProduct,
  TechnicalProductCategory,
  TechnicalSolarPanelProduct,
  TechnicalBatteryProduct,
  TechnicalSource,
  createTechnicalProduct,
} from "./TechnicalProduct.js";
import type { EmitterCompatibilityPolicyReference } from "./EmitterCompatibilityPolicyContract.js";

export interface DriplineEmitterCompatibilityRequirement {
  readonly category: TechnicalProductCategory.DRIPLINE_EMITTER;
  readonly emitterFlowLph: number;
  readonly emitterSpacingMm: number;
  readonly operatingPressureMca: number;
}

export interface ProductCatalogTraceability {
  readonly productId: string;
  readonly catalogVersion: string;
  readonly technicalSource: TechnicalSource;
}

export type SolarPanelCandidatesResult =
  | {
      readonly status: "VALIDATED";
      readonly catalogVersion: string;
      readonly products: readonly TechnicalSolarPanelProduct[];
      readonly productIds: readonly string[];
      readonly traceability: readonly ProductCatalogTraceability[];
    }
  | {
      readonly status: "PENDING";
      readonly catalogVersion: string;
      readonly products: readonly [];
      readonly productIds: readonly [];
      readonly traceability: readonly [];
      readonly missingFields: readonly ["solarPanels"];
    };

export type BatteryCandidatesResult =
  | {
      readonly status: "VALIDATED";
      readonly catalogVersion: string;
      readonly products: readonly TechnicalBatteryProduct[];
      readonly productIds: readonly string[];
      readonly traceability: readonly ProductCatalogTraceability[];
    }
  | {
      readonly status: "PENDING";
      readonly catalogVersion: string;
      readonly products: readonly [];
      readonly productIds: readonly [];
      readonly traceability: readonly [];
      readonly missingFields: readonly ["batteries"];
    };

export type DriplineEmitterCompatibilityResult =
  | {
      readonly status: "VALIDATED";
      readonly catalogVersion: string;
      readonly products: readonly TechnicalDriplineEmitterProduct[];
      readonly productIds: readonly string[];
    }
  | {
      readonly status: "PENDING";
      readonly catalogVersion: string;
      readonly products: readonly [];
      readonly productIds: readonly [];
      readonly missingFields: readonly string[];
      readonly compatibilityPolicy?: Readonly<EmitterCompatibilityPolicyReference>;
    }
  | {
      readonly status: "BLOCKED";
      readonly catalogVersion: string;
      readonly products: readonly [];
      readonly productIds: readonly [];
      readonly issue: string;
    };

export interface ProductCatalogInput {
  readonly catalogVersion: string;
  readonly products?: readonly TechnicalProduct[];
  readonly offers?: readonly CommercialOffer[];
}

export interface ProductCatalog {
  readonly catalogVersion: string;
  readonly products: readonly TechnicalProduct[];
  readonly offers: readonly CommercialOffer[];

  readonly getProduct: (
    productId: string,
  ) => TechnicalProduct | undefined;

  readonly getOffers: (
    productId: string,
  ) => readonly CommercialOffer[];

  readonly getProductWithOffers: (
    productId: string,
  ) =>
    | {
        readonly product: TechnicalProduct;
        readonly offers: readonly CommercialOffer[];
      }
    | undefined;

  readonly getProductTraceability: (
    productId: string,
  ) => ProductCatalogTraceability | undefined;

  readonly findSolarPanelCandidates: () => SolarPanelCandidatesResult;

  readonly findBatteryCandidates: () => BatteryCandidatesResult;

  readonly findCompatibleDriplineEmitters: (
    requirement?: DriplineEmitterCompatibilityRequirement,
    compatibilityPolicy?: EmitterCompatibilityPolicyReference,
  ) => DriplineEmitterCompatibilityResult;
}

export class ProductCatalogError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProductCatalogError";
  }
}

function validateId(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new ProductCatalogError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function validateCatalogVersion(value: unknown): string {
  return validateId(value, "catalogVersion");
}

function validatePositiveRequirement(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ProductCatalogError(
      `${fieldName} must be finite and positive`,
    );
  }
}

function validateCompatibilityRequirement(
  requirement: DriplineEmitterCompatibilityRequirement | undefined,
): readonly string[] {
  if (requirement === undefined) {
    return Object.freeze(["requirement"]);
  }

  if (requirement.category !== TechnicalProductCategory.DRIPLINE_EMITTER) {
    return Object.freeze(["requirement.category"]);
  }

  const missingFields: string[] = [];
  for (const fieldName of [
    "emitterFlowLph",
    "emitterSpacingMm",
    "operatingPressureMca",
  ] as const) {
    if (requirement[fieldName] === undefined) {
      missingFields.push(`requirement.${fieldName}`);
    } else {
      validatePositiveRequirement(
        requirement[fieldName],
        `requirement.${fieldName}`,
      );
    }
  }

  return Object.freeze(missingFields);
}

function validateProducts(
  value: unknown,
): readonly TechnicalProduct[] {
  if (!Array.isArray(value)) {
    throw new ProductCatalogError(
      "products must be an array",
    );
  }

  const products: TechnicalProduct[] = [];
  const productIds = new Set<string>();

  for (const input of value) {
    try {
      const product = createTechnicalProduct(
        input as TechnicalProduct,
      );

      if (productIds.has(product.productId)) {
        throw new ProductCatalogError(
          `duplicate productId: ${product.productId}`,
        );
      }

      productIds.add(product.productId);
      products.push(product);
    } catch (error) {
      if (error instanceof ProductCatalogError) {
        throw error;
      }

      throw error;
    }
  }

  return Object.freeze(products);
}

function validateOffers(
  value: unknown,
  products: readonly TechnicalProduct[],
): readonly CommercialOffer[] {
  if (!Array.isArray(value)) {
    throw new ProductCatalogError(
      "offers must be an array",
    );
  }

  const offers: CommercialOffer[] = [];
  const offerIds = new Set<string>();
  const productIds = new Set(
    products.map((product) => product.productId),
  );

  for (const input of value) {
    const offer = createCommercialOffer(
      input as CommercialOffer,
    );

    if (offerIds.has(offer.offerId)) {
      throw new ProductCatalogError(
        `duplicate offerId: ${offer.offerId}`,
      );
    }

    if (!productIds.has(offer.productId)) {
      throw new ProductCatalogError(
        `offer ${offer.offerId} references unknown productId: ${offer.productId}`,
      );
    }

    offerIds.add(offer.offerId);
    offers.push(offer);
  }

  return Object.freeze(offers);
}

export function createProductCatalog(
  input: ProductCatalogInput,
): Readonly<ProductCatalog> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new ProductCatalogError(
      "input must be an object",
    );
  }

  const catalogVersion = validateCatalogVersion(input.catalogVersion);

  const products = validateProducts(
    input.products ?? [],
  );

  const offers = validateOffers(
    input.offers ?? [],
    products,
  );

  const productById = new Map(
    products.map((product) => [
      product.productId,
      product,
    ]),
  );

  const offersByProductId = new Map<
    string,
    readonly CommercialOffer[]
  >();

  for (const offer of offers) {
    const current =
      offersByProductId.get(offer.productId) ?? [];

    offersByProductId.set(
      offer.productId,
      Object.freeze([
        ...current,
        offer,
      ]),
    );
  }

  return Object.freeze({
    catalogVersion,
    products,
    offers,

    getProduct(productId: string) {
      const id = validateId(
        productId,
        "productId",
      );

      return productById.get(id);
    },

    getOffers(productId: string) {
      const id = validateId(
        productId,
        "productId",
      );

      return (
        offersByProductId.get(id) ??
        Object.freeze([])
      );
    },

    getProductWithOffers(productId: string) {
      const id = validateId(
        productId,
        "productId",
      );

      const product = productById.get(id);

      if (product === undefined) {
        return undefined;
      }

      return Object.freeze({
        product,
        offers:
          offersByProductId.get(id) ??
          Object.freeze([]),
      });
    },

    getProductTraceability(productId: string) {
      const id = validateId(productId, "productId");
      const product = productById.get(id);

      if (product === undefined) {
        return undefined;
      }

      return Object.freeze({
        productId: product.productId,
        catalogVersion,
        technicalSource: product.technicalSource,
      });
    },

    findSolarPanelCandidates() {
      const solarPanelProducts = products.filter(
        (product): product is TechnicalSolarPanelProduct =>
          product.category === TechnicalProductCategory.SOLAR_PANEL,
      );

      if (solarPanelProducts.length === 0) {
        return Object.freeze({
          status: "PENDING" as const,
          catalogVersion,
          products: Object.freeze([]) as readonly [],
          productIds: Object.freeze([]) as readonly [],
          traceability: Object.freeze([]) as readonly [],
          missingFields: ["solarPanels"] as const,
        });
      }

      return Object.freeze({
        status: "VALIDATED" as const,
        catalogVersion,
        products: Object.freeze([...solarPanelProducts]),
        productIds: Object.freeze(
          solarPanelProducts.map((product) => product.productId),
        ),
        traceability: Object.freeze(
          solarPanelProducts.map((product) =>
            Object.freeze({
              productId: product.productId,
              catalogVersion,
              technicalSource: product.technicalSource,
            }),
          ),
        ),
      });
    },

    findBatteryCandidates() {
      const batteryProducts = products.filter(
        (product): product is TechnicalBatteryProduct =>
          product.category === TechnicalProductCategory.BATTERY,
      );

      if (batteryProducts.length === 0) {
        return Object.freeze({
          status: "PENDING" as const,
          catalogVersion,
          products: Object.freeze([]) as readonly [],
          productIds: Object.freeze([]) as readonly [],
          traceability: Object.freeze([]) as readonly [],
          missingFields: ["batteries"] as const,
        });
      }

      return Object.freeze({
        status: "VALIDATED" as const,
        catalogVersion,
        products: Object.freeze([...batteryProducts]),
        productIds: Object.freeze(
          batteryProducts.map((product) => product.productId),
        ),
        traceability: Object.freeze(
          batteryProducts.map((product) =>
            Object.freeze({
              productId: product.productId,
              catalogVersion,
              technicalSource: product.technicalSource,
            }),
          ),
        ),
      });
    },

    findCompatibleDriplineEmitters(
      requirement?: DriplineEmitterCompatibilityRequirement,
      compatibilityPolicy?: EmitterCompatibilityPolicyReference,
    ) {
      const missingFields = validateCompatibilityRequirement(requirement);

      if (missingFields.length > 0) {
        return Object.freeze({
          status: "PENDING" as const,
          catalogVersion,
          products: Object.freeze([]) as readonly [],
          productIds: Object.freeze([]) as readonly [],
          missingFields,
        });
      }

      return Object.freeze({
        status: "PENDING" as const,
        catalogVersion,
        products: Object.freeze([]) as readonly [],
        productIds: Object.freeze([]) as readonly [],
        ...(compatibilityPolicy === undefined ? {} : { compatibilityPolicy }),
        missingFields: Object.freeze(
          compatibilityPolicy === undefined ? ["compatibilityPolicy"] : [],
        ),
      });
    },
  });
}