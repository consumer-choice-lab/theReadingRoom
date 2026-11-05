# Qualtrics setup

All addresses below assume the repository `consumer-choice-lab/theReadingRoom`. Keep the capitals exactly as shown.

Set **Look & Feel → Layout** to **Flat** or **Modern**. The *Simple* layout handles the JavaScript differently, and these snippets won't work there.

---

## Phase 1: the store

**1. Survey Flow.** Add **Embedded Data** at the very top, with the field `PROLIFIC_PID` left blank. Before the store block, add another **Embedded Data** element with these fields, all left blank:

```
bs_pid  bs_rid  bs_items  bs_n  bs_total_p  bs_left_p  bs_budget_p  bs_order  bs_views  bs_secs  bs_log
```

**2. Store question.** Add a **Text / Graphic** question. Click into its text, switch to **HTML View**, and paste:

```html
<iframe src="https://consumer-choice-lab.github.io/theReadingRoom/?pid=${e://Field/PROLIFIC_PID}&rid=${e://Field/ResponseID}"
  style="width:100%;height:85vh;border:0;border-radius:8px" title="Book store"></iframe>
```

**3. Question JavaScript.** Click the question, then **JavaScript**, and replace the contents with:

```js
Qualtrics.SurveyEngine.addOnload(function () {
  var q = this;
  q.hideNextButton();
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://consumer-choice-lab.github.io") return;
    if (!e.data || e.data.type !== "readingroom-complete") return;
    var p = e.data.payload;
    Object.keys(p).forEach(function (k) {
      Qualtrics.SurveyEngine.setEmbeddedData(k, String(p[k]));
    });
    q.showNextButton();
  });
});
```

**4. Temporary check page.** On the page after the store, add a temporary question containing the line below. Delete it before going live.

```
Items: ${e://Field/bs_items} | Spent (p): ${e://Field/bs_total_p} | Kept (p): ${e://Field/bs_left_p}
```

### What the store sends

| Field | Meaning |
|---|---|
| `bs_items` | Book ids bought, e.g. `b03,b11` |
| `bs_n` | Number of books |
| `bs_total_p`, `bs_left_p`, `bs_budget_p` | Spent, kept and endowment, **in pence** |
| `bs_order` | The grid order this participant saw (randomised per participant ID) |
| `bs_views` | `id:times_opened:seconds` for each product page visited |
| `bs_secs` | Total seconds in the store |
| `bs_log` | Clickstream as `seconds,code[,id]` separated by `;`. Codes: G grid, F filter, V product view, A add, R remove, B basket, X checkout pressed, K confirmation cancelled, C confirmed |

---

## Phase 2: the reader (Google previews)

**Getting Phase 1 choices into Phase 2**
- **Same survey:** `bs_items` is already there.
- **Separate session:** export `PROLIFIC_PID` and `bs_items` from Phase 1 and upload them as a Qualtrics **Contact list**. In the Phase 2 Survey Flow, add an **Authenticator** that matches on `PROLIFIC_PID` and loads `bs_items` as embedded data.

**1. Survey Flow.** Before the reader block, add **Embedded Data** with these fields left blank:

```
rd_pid  rd_books  rd_secs  rd_seq  rd_total
```

**2. Reader question.** Add a **Text / Graphic** question, switch to **HTML View**, and paste:

```html
<iframe src="https://consumer-choice-lab.github.io/theReadingRoom/reader.html?pid=${e://Field/PROLIFIC_PID}&books=${e://Field/bs_items}&minsecs=60"
  style="width:100%;height:85vh;border:0;border-radius:8px" title="Your books"></iframe>
```

`minsecs=60` is the minimum total time before participants can finish. Change it or remove it as needed.

**3. Question JavaScript.** Same as the store, but with a different message type:

```js
Qualtrics.SurveyEngine.addOnload(function () {
  var q = this;
  q.hideNextButton();
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://consumer-choice-lab.github.io") return;
    if (!e.data || e.data.type !== "readingroom-reader-complete") return;
    var p = e.data.payload;
    Object.keys(p).forEach(function (k) {
      Qualtrics.SurveyEngine.setEmbeddedData(k, String(p[k]));
    });
    q.showNextButton();
  });
});
```

### What the reader sends

| Field | Meaning |
|---|---|
| `rd_books` | Books shown |
| `rd_secs` | `id:seconds` for each book, counting only while that tab was open and visible |
| `rd_seq` | Order the tabs were opened |
| `rd_total` | Total seconds |

---

## Recoding in R

```r
library(dplyr); library(tidyr)
d <- d %>% mutate(spent = as.numeric(bs_total_p) / 100,
                  kept  = as.numeric(bs_left_p)  / 100)
items <- d %>% select(PROLIFIC_PID, bs_items) %>%
  separate_rows(bs_items, sep = ",") %>% filter(bs_items != "")
reading <- d %>% select(PROLIFIC_PID, rd_secs) %>%
  separate_rows(rd_secs, sep = ",") %>%
  separate(rd_secs, c("book", "secs"), sep = ":", convert = TRUE)
```
