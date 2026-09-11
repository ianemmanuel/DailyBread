/**
 * Canonical food-taxonomy datasets — global definitions, not tied to any
 * country. Which countries actually offer an entry is an ongoing admin
 * decision (CuisineCountry / DietaryTagCountry), deliberately not seeded —
 * same convention as VENDOR_TYPES beside this file.
 *
 * The cuisine list is deliberately broad-but-shallow, matching how Uber Eats,
 * DoorDash and Bolt Food tag a store: a customer-recognisable category, not a
 * culinary classification. Regional entries are included because this platform
 * launches in African markets first and "African" alone is useless as a filter
 * there — the same reason DoorDash lists "Hawaiian" and "Cajun" separately in
 * the US rather than folding them into "American".
 */

export interface FoodTagSeedRow {
  code       : string
  slug       : string
  name       : string
  description: string
}

export const CUISINES: FoodTagSeedRow[] = [
  { code: "AFRICAN",      slug: "african",      name: "African",       description: "Pan-African dishes not tied to one national cuisine" },
  { code: "KENYAN",       slug: "kenyan",       name: "Kenyan",        description: "Nyama choma, ugali, sukuma wiki and other Kenyan staples" },
  { code: "ETHIOPIAN",    slug: "ethiopian",    name: "Ethiopian",     description: "Injera-based dishes, wat stews and Ethiopian coffee service" },
  { code: "NIGERIAN",     slug: "nigerian",     name: "Nigerian",      description: "Jollof, suya, egusi and other Nigerian staples" },
  { code: "SWAHILI",      slug: "swahili",      name: "Swahili coast", description: "Coastal East African cooking — pilau, biryani, coconut curries" },
  { code: "INDIAN",       slug: "indian",       name: "Indian",        description: "Curries, tandoor, biryani and Indian street food" },
  { code: "CHINESE",      slug: "chinese",      name: "Chinese",       description: "Stir-fry, noodles, dim sum and Chinese takeaway staples" },
  { code: "ITALIAN",      slug: "italian",      name: "Italian",       description: "Pasta, risotto and Italian mains" },
  { code: "PIZZA",        slug: "pizza",        name: "Pizza",         description: "Pizza-led menus, by the slice or whole" },
  { code: "BURGERS",      slug: "burgers",      name: "Burgers",       description: "Burger-led menus and sides" },
  { code: "CHICKEN",      slug: "chicken",      name: "Chicken",       description: "Fried, grilled and rotisserie chicken" },
  { code: "SEAFOOD",      slug: "seafood",      name: "Seafood",       description: "Fish and shellfish-led menus" },
  { code: "BBQ_GRILL",    slug: "bbq-grill",    name: "BBQ & grill",   description: "Grilled and barbecued meats" },
  { code: "MIDDLE_EASTERN", slug: "middle-eastern", name: "Middle Eastern", description: "Shawarma, mezze, falafel and grilled kebabs" },
  { code: "MEXICAN",      slug: "mexican",      name: "Mexican",       description: "Tacos, burritos and Mexican-style plates" },
  { code: "JAPANESE",     slug: "japanese",     name: "Japanese",      description: "Sushi, ramen and Japanese mains" },
  { code: "THAI",         slug: "thai",         name: "Thai",          description: "Thai curries, noodles and stir-fries" },
  { code: "BREAKFAST",    slug: "breakfast",    name: "Breakfast",     description: "Breakfast and brunch-led menus" },
  { code: "BAKERY",       slug: "bakery",       name: "Bakery",        description: "Bread, pastries and baked goods" },
  { code: "DESSERTS",     slug: "desserts",     name: "Desserts",      description: "Cakes, ice cream and sweet menus" },
  { code: "HEALTHY",      slug: "healthy",      name: "Healthy",       description: "Salads, bowls and lighter menus" },
  { code: "STREET_FOOD",  slug: "street-food",  name: "Street food",   description: "Quick, informal street-style plates" },
  { code: "BEVERAGES",    slug: "beverages",    name: "Drinks",        description: "Coffee, juice, smoothies and other drinks-led menus" },
]

/**
 * Dietary tags are a claim a vendor makes about who they can serve, so the
 * list stays short and unambiguous. Everything here is something a customer
 * would filter on and a vendor can answer yes/no to — deliberately no fuzzy
 * entries like "healthy", which lives in the cuisine list as a category rather
 * than a dietary guarantee.
 *
 * HALAL and KOSHER describe a certified preparation standard rather than an
 * ingredient list; a market that wants proof of certification should pair the
 * tag with a required DocumentTypeConfig, which the document framework already
 * supports without any change here.
 */
export const DIETARY_TAGS: FoodTagSeedRow[] = [
  { code: "VEGETARIAN",   slug: "vegetarian",   name: "Vegetarian options",  description: "Dishes containing no meat or fish" },
  { code: "VEGAN",        slug: "vegan",        name: "Vegan options",       description: "Dishes containing no animal products at all" },
  { code: "HALAL",        slug: "halal",        name: "Halal",               description: "Prepared to halal standards" },
  { code: "KOSHER",       slug: "kosher",       name: "Kosher",              description: "Prepared to kosher standards" },
  { code: "GLUTEN_FREE",  slug: "gluten-free",  name: "Gluten-free options", description: "Dishes prepared without gluten-containing ingredients" },
  { code: "NUT_FREE",     slug: "nut-free",     name: "Nut-free options",    description: "Dishes prepared without nuts" },
  { code: "DAIRY_FREE",   slug: "dairy-free",   name: "Dairy-free options",  description: "Dishes prepared without dairy" },
  { code: "LOW_CARB",     slug: "low-carb",     name: "Low carb options",    description: "Dishes with reduced carbohydrate content" },
]
