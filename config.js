/* ------------------------------------------------------------------
   STUDY CONFIGURATION — edit this file, not store.js
   ------------------------------------------------------------------ */
window.STORE_CONFIG = {
  storeName: "The Reading Room",

  // Endowment in pence (1800 = £18.00). Can be overridden per participant with ?budget=1800
  budgetPence: 1800,

  // Minimum / maximum number of books a participant may check out with.
  // minItems: 0 lets participants keep the whole endowment as cash.
  minItems: 1,
  maxItems: 10,

  // true = Checkout is blocked until the whole endowment is spent (nothing left over).
  requireFullSpend: true,

  // Format label shown on product pages (per-book override: a "format" column in books.csv)
  format: "Kindle ebook",

  // Folder holding cover images, relative to index.html. "covers/" by default;
  // "" if the images sit next to index.html at the top of the repository.
  coversFolder: "covers/",

  // Grid order: "random" (seeded by participant ID, so stable on reload) or "fixed" (catalogue order)
  gridOrder: "random",

  // Text shown above the grid
  instructions:
    "You have <strong>£18</strong> to spend. Browse the books, open any title to read more, " +
    "and add the ones you want to your basket. Please spend the full amount. " +
    "When you are happy with your basket, press <strong>Checkout</strong>.",

  // Only redirect back to these hosts when ?ret= is used (prevents open redirects).
  allowedReturnHosts: ["qualtrics.com"],

  // Only accept the Qualtrics page as iframe parent from these origins ("*" while piloting).
  parentOrigin: "*"
};
