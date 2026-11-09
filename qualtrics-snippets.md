# Qualtrics setup

Repository: `consumer-choice-lab/theReadingRoom`. Keep the capitals exactly as shown. Field names are case-sensitive.

## Phase 1: the store

### Survey Flow

1. At the very top, add **Embedded Data** with the field `PROLIFIC_PID`, left blank. The Prolific study link must end with `?PROLIFIC_PID={{%PROLIFIC_PID%}}`.
2. Directly above the store block, add **Embedded Data** with these fields, all left blank:

```
bs_pid bs_rid bs_items bs_n bs_total_p bs_left_p bs_budget_p bs_order bs_views bs_secs bs_log
```

### Store question

Use a **Text / Graphic** question, alone on its page. Paste this into the HTML view:

```html
<iframe src="https://consumer-choice-lab.github.io/theReadingRoom/?pid=${e://Field/PROLIFIC_PID}&rid=${e://Field/ResponseID}"
  style="width:100%;height:85vh;border:0;border-radius:8px" title="Book store"></iframe>
```

### Question JavaScript

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

### What the store sends

| Field | Meaning |
|---|---|
| `bs_items` | Books bought, e.g. `b03,b11,b14` |
| `bs_n` | Number of books bought |
| `bs_total_p`, `bs_left_p`, `bs_budget_p` | Spent, left and endowment, in pence (1800 / 0 / 1800) |
| `bs_order` | The shuffled grid order this participant saw |
| `bs_views` | `id:times_opened:seconds` for each product page opened |
| `bs_secs` | Total seconds in the store |
| `bs_log` | Click log as `seconds,code[,id]` separated by `;`. Codes: G grid, F filter, V product view, A add, R remove, B basket, X checkout pressed, K confirmation cancelled, C confirmed |

---

## Phase 2: payment condition, samples, keep/return

### Contact list (Directories → Lists → Create list → Import)

Build a CSV with one row per Phase 1 participant. Map `bs_items` and `bs_total_p` as **embedded data**.

```csv
ExternalDataReference,bs_items,bs_total_p
TEST1,"b03,b11,b14",1800
```

- `ExternalDataReference` is the participant's Phase 1 `PROLIFIC_PID`.
- `bs_items` and `bs_total_p` come from the Phase 1 export.
- Leave out preview rows and anyone with a blank `bs_items`.

### Survey Flow

```
Embedded Data: PROLIFIC_PID
Authenticator (Contact → your list; External Data Reference; label "Prolific ID";
               Pre-fill ✓ = ${e://Field/PROLIFIC_PID}; Password ✗; all Options checkboxes ✗)
    Embedded Data: bs_items, bs_total_p             (value: set from Panel or URL)
    Randomizer (present 1, Evenly present ✓)
        Embedded Data: cond = 1        (BNPL, "Pay in 4")
        Embedded Data: cond = 0        (delayed lump sum, "Pay Later")
    Embedded Data (all blank):
        rd_pid rd_cond rd_cond_label rd_books rd_keeps rd_returns rd_n_books rd_n_returned
        rd_return_rate rd_order_p rd_kept_p rd_returned_p rd_plan rd_paid_p rd_refund_p rd_pdate
        rd_secs rd_seq rd_total rd_declog rd_confirm_secs cond_match
    Block: Reader
    Block: Manipulation check and other questions
End of Survey → redirect to Prolific completion URL
```

### Reader question

Use a **Text / Graphic** question, alone on its page:

```html
<iframe src="https://consumer-choice-lab.github.io/theReadingRoom/reader.html?pid=${e://Field/PROLIFIC_PID}&books=${e://Field/bs_items}&cond=${e://Field/cond}&minsecs=60"
  style="width:100%;height:90vh;border:0;border-radius:8px" title="Your order"></iframe>
```

### Question JavaScript

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
    Qualtrics.SurveyEngine.setEmbeddedData("cond_match", p.rd_cond === "${e://Field/cond}" ? "1" : "0");
    q.showNextButton();
  });
});
```

### What the reader shows

- **`cond=1`, Pay in 4:** order placed Mon 9 Nov. £4.50 was paid on 9 Nov, and £4.50 is due on each of 16, 23 and 30 Nov. Returns come off the remaining payments; any amount beyond what's still owed is refunded.
- **`cond=0`, Pay Later:** "You agreed to pay £18.00 in 4 weeks", due Mon 7 Dec, nothing paid yet. Returns reduce the amount due.

The purchase date and schedules are set in `config.js` (`purchaseDate`, `paymentPlans`). To use each participant's own order date, add `&pdate=YYYY-MM-DD` to the iframe address.

### What the reader sends

| Field | Meaning |
|---|---|
| `rd_cond` | Condition shown: `1`, `0` or `none` (should equal `cond`) |
| `rd_cond_label` | `BNPL`, `LumpSum` or `none` |
| `cond_match` | 1 if the reader showed the assigned condition |
| `rd_keeps`, `rd_returns` | Book ids kept / returned |
| `rd_n_books`, `rd_n_returned`, `rd_return_rate` | Counts and returned/purchased |
| `rd_order_p`, `rd_kept_p`, `rd_returned_p` | Order, kept and returned value, in pence |
| `rd_plan` | Payments after returns, in days from purchase, e.g. `0:450:paid|7:250|14:250|21:250` or `28:1200` |
| `rd_paid_p`, `rd_refund_p`, `rd_pdate` | Already paid, refund owed (pence), purchase date |
| `rd_secs`, `rd_seq`, `rd_total` | Seconds per book, tab order, total seconds |
| `rd_declog` | Every Keep/Return click as `seconds,id,K|R` |
| `rd_confirm_secs` | Seconds from opening the page to confirming |

---

## Testing

**Site only**
- Store: `https://consumer-choice-lab.github.io/theReadingRoom/?pid=TEST1`
- Reader: `https://consumer-choice-lab.github.io/theReadingRoom/reader.html?pid=TEST1&books=b03,b11,b14&cond=1` (or `cond=0`)

Use a new `pid` each time for a fresh start.

**In Qualtrics:** preview each survey with `&PROLIFIC_PID=TEST1` added to the address. For Phase 2, TEST1 must be in the contact list. Check that `cond` and `rd_cond` match and that `cond_match = 1`.

---

## Recoding in R

```r
library(dplyr); library(tidyr)
p1 <- p1 %>% mutate(spent = as.numeric(bs_total_p) / 100)
p2 <- p2 %>% mutate(bnpl = as.integer(cond == "1"),
                    return_rate = as.numeric(rd_return_rate),
                    returned_gbp = as.numeric(rd_returned_p) / 100)
returns_long <- p2 %>% select(PROLIFIC_PID, cond, rd_books, rd_returns) %>%
  separate_rows(rd_books, sep = ",") %>%
  mutate(returned = mapply(function(b, r) b %in% strsplit(r, ",")[[1]], rd_books, rd_returns))
```
