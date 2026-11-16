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

  /* ---------------- PHASE 2 (reader.html) ----------------
     The condition comes from Qualtrics in the reader's address: &cond=1 (BNPL) or &cond=0 (LumpSum).
     days = when each payment falls due, in days from today (0 = today).
     The amount is split equally across the payments; returned books are removed from it. */
  // Date the Phase 1 order was placed (YYYY-MM-DD). All payment dates count from here.
  // Can be set per participant by adding &pdate=2026-11-09 to the reader's address.
  purchaseDate: "2026-11-09",

  // days  = when each payment falls due, in days after the purchase date (0 = purchase day)
  // paid  = how many of those payments have already been made
  // labels = text shown under each payment (no calendar dates are shown)
  // allAtEnd = show £0 at every step and the whole amount on the last one (lump sum)
  paymentPlans: {
    BNPL: { name: "Pay in 4", days: [0, 14, 21, 28], paid: 1,
            labels: ["Paid", "Due in 2 weeks", "Due in 3 weeks", "Due in 4 weeks"] },
    LumpSum: { name: "Pay Later", days: [0, 14, 21, 28], paid: 1, allAtEnd: true,
               labels: ["Paid", "Due in 2 weeks", "Due in 3 weeks", "Due in 4 weeks"] }
  },

  // Text shown at the top of the reader
  readerIntro:
    "Here are the opening pages of the books you chose. Look through each one and decide whether to " +
    "<strong>keep</strong> it or <strong>return</strong> it. You will not pay for any book you return. " +
    "When you have decided for every book, press <strong>Confirm my order</strong>.",

  // Only redirect back to these hosts when ?ret= is used (prevents open redirects).
  allowedReturnHosts: ["qualtrics.com"],

  // Only accept the Qualtrics page as iframe parent from these origins ("*" while piloting).
  parentOrigin: "*"
};
