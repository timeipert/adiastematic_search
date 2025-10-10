import marimo

__generated_with = "0.16.5"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import pandas as pd
    import re
    return mo, pd, re


@app.cell
def _(mo):
    mo.md(
        r"""
    ## Adiastematic Search
    You can search for melodies in the Corpus Monodicum dataset that constrain to a certain contour. The following characters can be used:
    * ```u``` – certain up
    * ```d``` – certain down
    * ```r``` – repeat
    * ```.``` – a single note, but unknown direction
    * ```(u|d)``` – a single note, could be up or down, but not r (same for (u|r) etc.)

    Also, an asterisk marks the beginning

    So for example a query could look like

    ```*uruu.dur.dd```
    """
    )
    return


@app.cell
def _(mo):
    query = mo.ui.text(full_width=True, debounce=True, value=".dddrd")
    button = mo.ui.button(label="Search")
    mo.md(f"""Adiastematic query (as regex): {query} {button}""")
    return (query,)


@app.cell
def _():


    return


@app.cell
def _(pd, re):


    VOLPIANO_ALPHABET = "89abcdefghijklmnopqrstuvw"
    POSITION_MAP = {note: i for i, note in enumerate(VOLPIANO_ALPHABET)}

    def transform_to_contour(volpiano_melody):

        if type(volpiano_melody) is not str or len(volpiano_melody) < 2:
            return pd.NA
        contour_parts = ["*"]
        for last_note, current_note in zip(volpiano_melody, volpiano_melody[1:]):
            try:
                last_pos = POSITION_MAP[last_note]
                current_pos = POSITION_MAP[current_note]
            except KeyError as e:
                raise ValueError(f"Melody contains an invalid character not in alphabet: {e}")

            if current_pos > last_pos:
                contour_parts.append("u")
            elif current_pos < last_pos:
                contour_parts.append("d")
            else:
                contour_parts.append("e")

        return "".join(contour_parts)



    def find_rows(df, column, pattern):
        mask = df[column].str.contains(pattern, na=False, regex=True)
        if not mask.any():
            return pd.DataFrame() 
        result_df = df[mask].copy()
        compiled_regex = re.compile(pattern)
        result_df['match_start'] = result_df[column].apply(
            lambda x: compiled_regex.search(x).start()
        )
        return result_df
    return find_rows, transform_to_contour


@app.cell
def _(find_rows, pd, query, transform_to_contour):

    before_corpus = pd.read_csv("https://raw.githubusercontent.com/timeipert/adiastematic_search/refs/heads/master/corpus.csv")
    before_corpus["volpiano_pitches"] = before_corpus["volpiano"].str.replace("-", "")
    before_corpus.dropna(subset=["volpiano_pitches"])

    corpus = before_corpus.copy()
    corpus["contour"] = corpus["volpiano_pitches"].apply(transform_to_contour)
    corpus.dropna(subset=["contour"])

    search_result = find_rows(corpus, "contour", query.value)
    search_result

    return


if __name__ == "__main__":
    app.run()
