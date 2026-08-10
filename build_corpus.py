import pandas as pd
import re
import os
import json

VOLPIANO_ALPHABET = "89abcdefghijklmnopqrstuvw"
POSITION_MAP = {note: i for i, note in enumerate(VOLPIANO_ALPHABET)}

COLS_TO_KEEP = [
    "uuid", "siglum", "related_chant", "genre", "subgenre", "genre2", 
    "mode", "feast_day", "feast_time", "initial_text", "melodyname_standardized",
    "editor", "volpiano", "contour", "database_source"
]

def transform_to_contour(volpiano_melody):
    if not isinstance(volpiano_melody, str):
        return pd.NA
        
    notes = []
    for i, char in enumerate(volpiano_melody):
        if char in VOLPIANO_ALPHABET:
            notes.append({'char': char, 'pos': i})
            
    if len(notes) < 2:
        return pd.NA
        
    contour = []
    for i in range(len(notes) - 1):
        n1 = notes[i]
        n2 = notes[i+1]
        
        try:
            p1 = POSITION_MAP[n1['char']]
            p2 = POSITION_MAP[n2['char']]
        except KeyError:
            continue
            
        if p2 > p1:
            c = "u"
        elif p2 < p1:
            c = "d"
        else:
            c = "r"
            
        inter_content = volpiano_melody[n1['pos']+1 : n2['pos']]
        if '-' in inter_content:
            contour.append("_")
            
        contour.append(c)
        
    return "".join(contour)

def process_excel_dataset(filepath, source_name, prefix, page_col="Folio/Page", notes_col="Notes"):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return pd.DataFrame()
    
    print(f"Processing {source_name} from {filepath}...")
    df = pd.read_excel(filepath)
    df.dropna(subset=["Volpiano"], inplace=True)
    df = df.copy()
    
    df["volpiano"] = df["Volpiano"].astype(str)
    df["contour"] = df["volpiano"].apply(transform_to_contour)
    df.dropna(subset=["contour"], inplace=True)
    
    df["database_source"] = source_name
    df["uuid"] = [f"{prefix}_{i+1:03d}" for i in range(len(df))]
    
    if "Title" in df.columns:
        df["initial_text"] = df["Title"].fillna("")
        df["melodyname_standardized"] = df["Title"].fillna("")
    
    if page_col in df.columns:
        df["siglum"] = df[page_col].fillna("").astype(str)
        
    if notes_col and notes_col in df.columns:
        df["editor"] = df[notes_col].fillna("").astype(str)
        
    for col in COLS_TO_KEEP:
        if col not in df.columns:
            df[col] = ""
            
    return df[COLS_TO_KEEP]

def build_corpus():
    print("Building Combined Corpus Data...")
    dfs = []
    
    # 1. Main Corpus (Corpus Monodicum)
    main_path = "data/corpus.csv"
    if os.path.exists(main_path):
        print(f"Processing Main Corpus from {main_path}...")
        main_corpus = pd.read_csv(main_path)
    else:
        print(f"{main_path} not found. Fetching online copy...")
        main_corpus = pd.read_csv("https://raw.githubusercontent.com/timeipert/adiastematic_search/refs/heads/master/corpus.csv")
        
    main_corpus.dropna(subset=["volpiano"], inplace=True)
    main_corpus = main_corpus.copy()
    main_corpus["contour"] = main_corpus["volpiano"].apply(transform_to_contour)
    main_corpus.dropna(subset=["contour"], inplace=True)
    main_corpus["database_source"] = "Main Corpus (Corpus Monodicum)"
    main_corpus.rename(columns={"source_id": "siglum"}, inplace=True)
    for col in COLS_TO_KEEP:
        if col not in main_corpus.columns:
            main_corpus[col] = ""
    dfs.append(main_corpus[COLS_TO_KEEP])

    # 2. Schlager Melodies
    schlager_path = "data/schlager_melodies.csv"
    if os.path.exists(schlager_path):
        print(f"Processing Schlager Melodies from {schlager_path}...")
        try:
            schlager_df = pd.read_csv(schlager_path)
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
                return pd.Series({
                    'uuid': schlager_id, 
                    'siglum': '', 
                    'related_chant': cantus_id, 
                    'genre': genre, 
                    'mode': mode,
                    'initial_text': ''
                })
                
            meta_df = schlager_df.apply(extract_schlager_meta, axis=1)
            schlager_corpus = pd.concat([schlager_df, meta_df], axis=1)
            schlager_corpus.rename(columns={"Volpiano": "volpiano"}, inplace=True)
            schlager_corpus["contour"] = schlager_corpus["volpiano"].apply(transform_to_contour)
            schlager_corpus.dropna(subset=["contour"], inplace=True)
            schlager_corpus["database_source"] = "Schlager Melodies"
            for col in COLS_TO_KEEP:
                if col not in schlager_corpus.columns:
                    schlager_corpus[col] = ""
            dfs.append(schlager_corpus[COLS_TO_KEEP])
        except Exception as e:
            print(f"Error loading {schlager_path}: {e}")

    # 3. Excel Datasets
    excel_configs = [
        ("data/BNF Lat10508 Complete.xlsx", "BnF Lat10508 Complete", "BNF_Lat10508_Complete", "Folio/Page", "Notes"),
        ("data/Bannister Hughes - West Frankish sequences.xlsx", "Bannister Hughes - West Frankish sequences", "Bannister_Hughes", "Page Number", "Notes"),
        ("data/BnF Lat10508 Incipits.xlsx", "BnF Lat10508 Incipits", "BNF_Lat10508_Incipits", "Folio/Page", "Notes"),
        ("data/Bower - Notker.xlsx", "Bower - Notker", "Bower_Notker", "Bower Page Number", None),
    ]

    for filepath, source_name, prefix, page_col, notes_col in excel_configs:
        df_excel = process_excel_dataset(filepath, source_name, prefix, page_col, notes_col)
        if not df_excel.empty:
            dfs.append(df_excel)

    # 4. Personal Transcriptions (if present)
    for t_path in ["transcriptions.csv", "data/transcriptions.csv"]:
        if os.path.exists(t_path):
            print(f"Processing Personal Transcriptions from {t_path}...")
            try:
                transcriptions = pd.read_csv(t_path)
                if "contour" not in transcriptions.columns and "volpiano" in transcriptions.columns:
                    transcriptions["contour"] = transcriptions["volpiano"].apply(transform_to_contour)
                for col in COLS_TO_KEEP:
                    if col not in transcriptions.columns:
                        transcriptions[col] = ""
                transcriptions["database_source"] = "Personal Transcriptions"
                dfs.append(transcriptions[COLS_TO_KEEP])
                break
            except Exception as e:
                print(f"Error loading {t_path}: {e}")

    # Combine all dataframes
    combined = pd.concat(dfs, ignore_index=True)
    combined.fillna("", inplace=True)

    # Ensure output directories exist
    os.makedirs("docs", exist_ok=True)
    os.makedirs("public", exist_ok=True)
    
    out_path_docs = "docs/search_data.json"
    out_path_public = "public/search_data.json"
    
    combined.to_json(out_path_docs, orient="records", indent=None)
    combined.to_json(out_path_public, orient="records", indent=None)
    
    print(f"\nSuccessfully exported {len(combined)} melodies across {combined['database_source'].nunique()} sources to {out_path_public} and {out_path_docs} ({os.path.getsize(out_path_public)/1024/1024:.2f} MB)")
    print("Breakdown by database source:")
    print(combined["database_source"].value_counts().to_string())

if __name__ == "__main__":
    build_corpus()
