export enum CommercialAvailability {
  IN_STOCK = "IN_STOCK",
  OUT_OF_STOCK = "OUT_OF_STOCK",
  UNKNOWN = "UNKNOWN",
}

export interface CommercialOffer {
  readonly offerId: string;
  readonly productId: string;

  readonly merchant: string;
  readonly merchantProductId?: string;

  readonly productUrl: string;
  readonly affiliateUrl?: string;

  readonly price?: number;
  readonly currency: string;

  readonly availability: CommercialAvailability;

  readonly affiliateProgram?: string;

  readonly lastCheckedAt: string;
}

export class CommercialOfferError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CommercialOfferError";
  }
}

function validateRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new CommercialOfferError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function validateOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validateRequiredString(value, fieldName);
}

function validateOptionalPrice(
  value: unknown,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new CommercialOfferError(
      "price must be a finite number greater than or equal to 0",
    );
  }

  return value;
}

function validateAvailability(
  value: unknown,
): CommercialAvailability {
  if (
    value !== CommercialAvailability.IN_STOCK &&
    value !== CommercialAvailability.OUT_OF_STOCK &&
    value !== CommercialAvailability.UNKNOWN
  ) {
    throw new CommercialOfferError(
      "availability must be IN_STOCK, OUT_OF_STOCK, or UNKNOWN",
    );
  }

  return value;
}

function validateIsoDateTime(
  value: unknown,
  fieldName: string,
): string {
  const dateTime = validateRequiredString(
    value,
    fieldName,
  );

  const parsed = new Date(dateTime);

  if (
    Number.isNaN(parsed.getTime()) ||
    !dateTime.includes("T")
  ) {
    throw new CommercialOfferError(
      `${fieldName} must be a valid ISO 8601 date-time`,
    );
  }

  return dateTime;
}

export function createCommercialOffer(
  input: CommercialOffer,
): Readonly<CommercialOffer> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new CommercialOfferError(
      "input must be an object",
    );
  }

  const offerId = validateRequiredString(
    input.offerId,
    "offerId",
  );

  const productId = validateRequiredString(
    input.productId,
    "productId",
  );

  const merchant = validateRequiredString(
    input.merchant,
    "merchant",
  );

  const merchantProductId = validateOptionalString(
    input.merchantProductId,
    "merchantProductId",
  );

  const productUrl = validateRequiredString(
    input.productUrl,
    "productUrl",
  );

  const affiliateUrl = validateOptionalString(
    input.affiliateUrl,
    "affiliateUrl",
  );

  const price = validateOptionalPrice(
    input.price,
  );

  const currency = validateRequiredString(
    input.currency,
    "currency",
  );

  const availability = validateAvailability(
    input.availability,
  );

  const affiliateProgram = validateOptionalString(
    input.affiliateProgram,
    "affiliateProgram",
  );

  const lastCheckedAt = validateIsoDateTime(
    input.lastCheckedAt,
    "lastCheckedAt",
  );

  return Object.freeze({
    offerId,
    productId,
    merchant,
    ...(merchantProductId !== undefined
      ? { merchantProductId }
      : {}),
    productUrl,
    ...(affiliateUrl !== undefined
      ? { affiliateUrl }
      : {}),
    ...(price !== undefined
      ? { price }
      : {}),
    currency,
    availability,
    ...(affiliateProgram !== undefined
      ? { affiliateProgram }
      : {}),
    lastCheckedAt,
  });
}