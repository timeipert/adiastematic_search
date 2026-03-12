import marimo

__generated_with = "0.16.5"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import pandas as pd
    import re
    import os
    return mo, os, pd, re


@app.cell
def _(mo):
    mo.md(
        r"""
    ## Adiastematic Search
    You can search for melodies in the Corpus Monodicum dataset that constrain to a certain contour.

    **Syntax updates:**
    * `u` / `d` / `r` – Up, Down, Repeat
    * `_` – Syllable boundary (e.g., `_ u d _` searches for exactly a two-interval syllable contour)
    * `_ _` – A single note syllable (zero intervals)
    * `[...]` – Skip any amount of unknown notes (mapped to `.*`)
    * `[u|d]` – Alternative options (mapped to `(u|d)` in regex)
    * `^` / `$` – Start / End of the chant

    (Note: Spaces are ignored automatically to allow for readable queries).

    So for example a query could look like:
    `_ u d d [...] u d _` or `[ . | . r | . r r ] u d`
    """
    )
    return


@app.cell
def _(mo):
    query = mo.ui.text(full_width=True, debounce=True, value="uddu")

    corpus_selection = mo.ui.radio(
        options=["Main Corpus (Corpus Monodicum)", "Schlager Melodies", "Cumulative (Both)"],
        value="Cumulative (Both)",
        label="Select Corpus Database:"
    )

    search_location = mo.ui.radio(
        options=["Anywhere in the melody", "Only in the Beginning (Incipit)", "Only in the End (Coda)"],
        value="Anywhere in the melody",
        label="Where should the match occur?"
    )
    region_size = mo.ui.slider(start=5, stop=100, step=5, value=25, label="Size of Beginning/End search region (%)")

    ignore_syllables = mo.ui.checkbox(label="Ignore syllables in search", value=True)
    button = mo.ui.button(label="Search")

    mo.md(f"""
    **Adiastematic query:** {query} 
    **Database:** {corpus_selection}
    **Region Filter:** {search_location} {region_size}
    **Options:** {ignore_syllables}
    {button}
    """)
    return (
        corpus_selection,
        ignore_syllables,
        query,
        region_size,
        search_location,
    )


@app.cell
def _():


    return


@app.cell
def _(pd, re):


    VOLPIANO_ALPHABET = "89abcdefghijklmnopqrstuvw"
    POSITION_MAP = {note: i for i, note in enumerate(VOLPIANO_ALPHABET)}

    def transform_to_contour(volpiano_melody):
        if type(volpiano_melody) is not str:
            return pd.NA

        syllables = [s for s in re.split(r'-+', volpiano_melody) if s.strip()]
        if not syllables:
            return pd.NA

        syllable_contours = []
        for syl in syllables:
            syl_contour = []
            for last_note, current_note in zip(syl, syl[1:]):
                try:
                    last_pos = POSITION_MAP[last_note]
                    current_pos = POSITION_MAP[current_note]
                except KeyError:
                    continue

                if current_pos > last_pos:
                    syl_contour.append("u")
                elif current_pos < last_pos:
                    syl_contour.append("d")
                else:
                    syl_contour.append("r")
            syllable_contours.append("".join(syl_contour))

        return "_" + "_".join(syllable_contours) + "_"


    def preprocess_query(q):
        q = q.replace(" ", "")
        q = q.replace("[...]", ".*")
        q = q.replace("*", ".")
        q = q.replace("[", "(").replace("]", ")")
        return q

    def find_rows(df, column, pattern, start_pct=0, end_pct=100):
        try:
            compiled_regex = re.compile(pattern)
        except re.error:
            return pd.DataFrame()

        def is_match_in_bounds(val):
            if not isinstance(val, str):
                return False
            for match in compiled_regex.finditer(val):
                match_start_pct = (match.start() / max(1, len(val))) * 100
                match_end_pct = (match.end() / max(1, len(val))) * 100
                if match_start_pct >= start_pct and match_end_pct <= end_pct:
                    return True
            return False

        mask = df[column].apply(is_match_in_bounds)
        result_df = df[mask].copy()

        def get_match_start(val):
             for match in compiled_regex.finditer(val):
                match_start_pct = (match.start() / max(1, len(val))) * 100
                match_end_pct = (match.end() / max(1, len(val))) * 100
                if match_start_pct >= start_pct and match_end_pct <= end_pct:
                    return match.start()
             return -1

        if not result_df.empty:
            result_df['match_start'] = result_df[column].apply(get_match_start)
        return result_df
    return find_rows, preprocess_query, transform_to_contour


@app.cell
def _(
    corpus_selection,
    find_rows,
    ignore_syllables,
    os,
    pd,
    preprocess_query,
    query,
    region_size,
    search_location,
    transform_to_contour,
):
    try:
        before_corpus = pd.read_csv("data/corpus.csv")
    except:
        before_corpus = pd.read_csv("https://raw.githubusercontent.com/timeipert/adiastematic_search/refs/heads/master/corpus.csv")

    before_corpus.dropna(subset=["volpiano"], inplace=True)
    main_corpus = before_corpus.copy()
    main_corpus["contour"] = main_corpus["volpiano"].apply(transform_to_contour)
    main_corpus.dropna(subset=["contour"], inplace=True)
    main_corpus["database_source"] = "Main Corpus (Corpus Monodicum)"

    schlager_corpus = pd.DataFrame()
    if os.path.exists("data/schlager_melodies.csv"):
        try:
            schlager_df = pd.read_csv("data/schlager_melodies.csv")
            schlager_df.dropna(subset=["Volpiano"], inplace=True)

            def extract_schlager_meta(row):
                id_str = str(row['ID'])
                parts = id_str.split('\n')
                schlager_id = parts[0].strip() if len(parts) > 0 else ''
                cantus_id = ''
                if len(parts) > 1 and 'Cantus ID:' in parts[1]:
                    cantus_id = parts[1].replace('Cantus ID:', '').strip()
                genre = ''
                mode = ''
                if len(parts) > 2 and 'Genre:' in parts[2]:
                    g_m_parts = parts[2].split('|')
                    genre = g_m_parts[0].replace('Genre:', '').strip() if len(g_m_parts) > 0 else ''
                    mode = g_m_parts[1].replace('Mode:', '').strip() if len(g_m_parts) > 1 else ''
                return pd.Series({'uuid': schlager_id, 'related_chant': cantus_id, 'genre': genre, 'mode': mode})

            meta_df = schlager_df.apply(extract_schlager_meta, axis=1)
            schlager_corpus = pd.concat([schlager_df, meta_df], axis=1)
            schlager_corpus.rename(columns={"Volpiano": "volpiano"}, inplace=True)
            schlager_corpus["contour"] = schlager_corpus["volpiano"].apply(transform_to_contour)
            schlager_corpus.dropna(subset=["contour"], inplace=True)
            schlager_corpus["database_source"] = "Schlager Melodies"
        except Exception as e:
            print(f"Error loading schlager_melodies.csv: {e}")

    if corpus_selection.value == "Main Corpus (Corpus Monodicum)":
        corpus = main_corpus
    elif corpus_selection.value == "Schlager Melodies" and not schlager_corpus.empty:
        corpus = schlager_corpus
    else: # Cumulative 
        corpus = pd.concat([main_corpus, schlager_corpus], ignore_index=True)

    if os.path.exists("transcriptions.csv"):
        try:
            transcriptions = pd.read_csv("transcriptions.csv")
            if "contour" not in transcriptions.columns and "volpiano" in transcriptions.columns:
                 transcriptions["contour"] = transcriptions["volpiano"].apply(transform_to_contour)
            transcriptions["database_source"] = "Personal Transcriptions"
            corpus = pd.concat([corpus, transcriptions], ignore_index=True)
        except Exception as e:
            print(f"Error loading transcriptions.csv: {e}")

    processed_pattern = preprocess_query(query.value)

    if ignore_syllables.value:
        corpus["search_contour"] = corpus["contour"].str.replace("_", "")
    else:
        corpus["search_contour"] = corpus["contour"]

    start_pct = 0
    end_pct = 100
    if search_location.value == "Only in the Beginning (Incipit)":
        end_pct = region_size.value
    elif search_location.value == "Only in the End (Coda)":
        start_pct = 100 - region_size.value

    search_result = find_rows(corpus, "search_contour", processed_pattern, start_pct, end_pct)
    search_result
    return


if __name__ == "__main__":
    app.run()
