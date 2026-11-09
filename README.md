# The Reading Room: BNPL returns study

This is a static website with no server, and nothing is stored on GitHub. All responses go to Qualtrics.

- **Phase 1** (`index.html`): participants spend an £18 endowment on books (six per row in a grid shuffled per participant), moving to a product page, then the basket, then checkout. Checkout is blocked until the full £18 is spent.
- **Phase 2** (`reader.html`): participants see their Phase 1 books under one payment plan (`&cond=1` Pay in 4, first £4.50 already paid on 9 Nov; `&cond=0` Pay Later, £18 due 7 Dec), read each book's Google preview, and choose Keep or Return for each. Plans and the purchase date are set in `config.js`.

| File | What it is |
|---|---|
| `books.csv` | **The book list. Edit this one in Excel.** |
| `covers/` | Cover images, named to match the `cover` column |
| `config.js` | Settings: endowment, min/max books, grid order, instructions text, covers folder, allowed origins |
| `index.html`, `store.js` | The Phase 1 store |
| `reader.html`, `reader.js` | The Phase 2 reader |
| `catalogue.js` | Reads and checks `books.csv`; no need to edit it |
| `style.css` | Look and feel |
| `samples/` | Only needed for books whose `sample` is `file` |
| `qualtrics-snippets.md` | Iframe HTML, question JavaScript, Survey Flow fields, R recoding |

## Put it on GitHub Pages

1. On github.com, click **New repository**. Name it `theReadingRoom` (owner `consumer-choice-lab`), set it to **Public**, and don't add a README. Click **Create repository**.
2. On the new repository's page, press the **.** (full stop) key to open github.dev.
3. Drag **everything inside** this folder from File Explorer onto the Explorer panel: the files plus the `covers` and `samples` folders. Check that `covers` appears as a folder with your images inside.
4. Click **Source Control** (third icon in the left bar). Type a message such as `First upload` and press **Ctrl+Enter**.
5. Back on github.com, go to **Settings → Pages**. Under Branch, choose **main** and **/ (root)**, then click **Save**.
6. After 1–2 minutes, go to `https://consumer-choice-lab.github.io/theReadingRoom/?pid=TEST1`. Outside Qualtrics, checkout shows the exact data that would be sent.

To change books later, edit `books.csv` and upload the new version. It replaces the old one, and the site updates within a minute or two.

## books.csv columns

| Column | Required? | Notes |
|---|---|---|
| `id` | yes | A unique code such as `b01`. **Never change or reuse an id once data collection starts.** |
| `title`, `author` | yes | |
| `price` | yes | In pounds, e.g. `6.99`. This is the price participants pay in the store. |
| `genre` | no | Shown on the product page. The genre filter only appears if there are 2+ genres. |
| `cover` | no | Image file name in `covers/`, e.g. `b01.png`. Leave blank for a plain typographic cover. |
| `colour` | no | Background colour for the typographic cover, e.g. `#23325e`. |
| `google_id` | for Phase 2 | The Google Books edition ID, e.g. `XbbGEQAAQBAJ` (see below). |
| `isbn` | no | Used for the preview only if `google_id` is blank. |
| `sample` | for Phase 2 | `google` (Google preview) or `file` (an extract in `samples/<id>.html`). |
| `blurb` | no | Description. Blank lines become paragraphs. |
| `format`, `pages` | no | Shown on the product page. `format` falls back to `config.js`. |

The store ignores any other column (e.g. `amazon price on 4 Nov 2026`), so you can use extra columns for your own notes.

**Finding a google_id:** open the book on Google Books and copy the 12-character code from the address. In `https://www.google.co.uk/books/edition/A_Carol_and_a_Killing/2MbbEQAAQBAJ`, the ID is `2MbbEQAAQBAJ`. Use an edition whose page has a **Preview** button.

**Excel tips:**
- Save as **CSV UTF-8 (Comma delimited)**.
- Format any ISBN column as **Text** before typing, or Excel turns it into numbers like `9.78E+12`. `google_id` doesn't have this problem.

If the CSV has a problem, the store shows a list of the faulty rows instead of the books, so participants never see a broken catalogue.

## Before going live

- Confirm the `price` column holds the prices you intend participants to pay, and that you will deliver each book.
- Open `reader.html?books=b01,b02,b03,b04,b05,b06,b07,b08,b09,b10,b11,b12` and click every tab to check each Google preview appears.
- In `config.js`, change `parentOrigin: "*"` to your Qualtrics address, e.g. `"https://leeds.eu.qualtrics.com"`.
- Test on a phone inside the Qualtrics preview.
