/*
 * The platform's tax-category vocabulary.
 *
 * These are the distinctions real jurisdictions actually draw on prepared
 * food, not a guess: the UK zero-rates cold takeaway food while standard-
 * rating the same shop's hot food, several US states and Canadian provinces
 * separate prepared food from grocery items, and most VAT systems keep a
 * distinct "exempt" treatment that is legally different from a 0% rate.
 *
 * Deliberately small. A category only earns a place here if some market
 * charges a DIFFERENT rate for it; anything finer is a reporting concern, not
 * a pricing one. A flat-rate market configures STANDARD alone and its vendors
 * never meet the concept.
 *
 * Keyed on `code`, which is stable — name and slug are both admin-editable, so
 * keying on either would duplicate on the first rename. Same rule as the
 * cuisine and dietary-tag catalogs.
 *
 * NOTE: no rates live here. A rate is a legal fact about one country and is a
 * deliberate admin decision, exactly like per-country payment-method
 * activation. Seeding a number would be asserting a jurisdiction's tax law
 * from a data file.
 */
export interface TaxCategorySeed {
  code: string
  slug: string
  name: string
  description: string
}

export const TAX_CATEGORIES: TaxCategorySeed[] = [
  {
    code: "STANDARD",
    slug: "standard",
    name: "Standard rate",
    description:
      "The default treatment for prepared food in this market. Used for any dish that names no category.",
  },
  {
    code: "HOT_PREPARED_FOOD",
    slug: "hot-prepared-food",
    name: "Hot prepared food",
    description:
      "Food sold hot and ready to eat. Some markets tax this at the standard rate while taxing cold food differently.",
  },
  {
    code: "COLD_TAKEAWAY_FOOD",
    slug: "cold-takeaway-food",
    name: "Cold takeaway food",
    description:
      "Cold food taken away rather than eaten on the premises. Zero-rated in several markets, including the UK.",
  },
  {
    code: "PACKAGED_GROCERY",
    slug: "packaged-grocery",
    name: "Packaged grocery",
    description:
      "Sealed items resold as-is rather than prepared. Often taxed as groceries rather than as a meal.",
  },
  {
    code: "NON_ALCOHOLIC_BEVERAGE",
    slug: "non-alcoholic-beverage",
    name: "Non-alcoholic drink",
    description:
      "Soft drinks, juices, water and hot drinks. Several markets rate these apart from food.",
  },
  {
    code: "ALCOHOL",
    slug: "alcohol",
    name: "Alcoholic drink",
    description:
      "Almost universally taxed apart from food, and frequently at a higher rate or with an extra duty.",
  },
  {
    code: "ZERO_RATED",
    slug: "zero-rated",
    name: "Zero-rated",
    description:
      "Taxable at 0%. Legally distinct from exempt: the sale is still within the tax system and is reported.",
  },
  {
    code: "EXEMPT",
    slug: "exempt",
    name: "Exempt",
    description:
      "Outside the tax system entirely rather than taxed at zero. Reported differently and cannot be reclaimed against.",
  },
]
